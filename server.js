require('dotenv').config();

const axios = require('axios');
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const flash = require('connect-flash');
const promisePool = require('./node/db');
const bcrypt = require('bcrypt');
const app = express();
const multer = require('multer');
const port = 3000;

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to parse incoming request bodies
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Middleware for session handling
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using https
}));

app.use((req, res, next) => {
    res.locals.user = req.session.user;
    next();
});

// Initialize flash middleware
app.use(flash());

// Middleware to set flash messages to locals
app.use((req, res, next) => {
    res.locals.messages = req.flash();
    res.locals.user = req.session.user || null;
    next();
});

// Authentication Middleware
function ensureAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    }
    req.flash('error', 'Please log in to access this page');
    res.redirect('/login');
}

function ensureAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    req.flash('error', 'You do not have permission to access this page');
    res.redirect('/');
}

// Placeholder function for sendEmail
function sendEmail({ to, subject, text }) {
    console.log(`Email sent to ${to} with subject "${subject}" and message: "${text}"`);
    // You can integrate with an actual email service here (e.g., Nodemailer)
}


///////////////////// Routes ////////////////////////

// Route that requires login
app.get('/dashboard', ensureAuthenticated, (req, res) => {
    res.render('dashboard');
});


// Route that requires admin role
app.get('/admin', ensureAuthenticated, ensureAdmin, (req, res) => {
    res.render('admin');
});

// Route for login page
app.get('/login', (req, res) => {
    res.render('login');
});

// Handle Login Form Submission
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const [rows] = await promisePool.query('SELECT * FROM users WHERE username = ?', [username]);
        const user = rows[0];

        if (user && await bcrypt.compare(password, user.password)) {
            req.session.user = {
                id: user.id,
                username: user.username,
                role: user.role
            };
            req.flash('success', 'Logged in successfully');
            
            if (user.role === 'admin') {
                res.redirect('/admin/admin-dashboard');
            } else {
                res.redirect('/');
            }
        } else {
            req.flash('error', 'Invalid username or password');
            res.redirect('/login');
        }
    } catch (error) {
        console.error('Error during login:', error);
        req.flash('error', 'Internal Server Error');
        res.redirect('/login');
    }
});

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.redirect('/');
        }
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
});


// Route for register page
app.get('/register', (req, res) => {
    res.render('register');
});

// Handle Register Form Submission
app.post('/register', async (req, res) => {
    const { username, password, confirm_password, role } = req.body;

    if (password !== confirm_password) {
        req.flash('error', 'Passwords do not match');
        return res.redirect('/register');
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        await promisePool.query('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', 
        [username, hashedPassword, role]);

        req.flash('success', 'Registered successfully, please log in');
        res.redirect('/login');
    } catch (error) {
        console.error('Error registering user:', error);
        req.flash('error', 'Internal Server Error');
        res.redirect('/register');
    }
});

// Route for home page
app.get('/', (req, res) => {
    res.render('index', {
        user: req.session.user || null,
        messages: req.flash()
    });
});

// Homepage route
app.get('/', (req, res) => {
    res.render('index', {
        user: req.session.user || null,
        messages: req.flash() // Pass flash messages
    });
});

// Route for about page
app.get('/about', (req, res) => {
    res.render('about');
});

// Route for services page
app.get('/services', (req, res) => {
    res.render('services');
});

//Route for admin-dashboard
app.get('/admin/admin-dashboard', ensureAuthenticated, ensureAdmin, (req, res) => {
    res.render('admin/admin-dashboard', { user: req.session.user });
});

// Route for stock page
app.get('/admin/stock', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const [rows] = await promisePool.query('SELECT * FROM stock');
        res.render('admin/stock', { stock: rows, user: req.session.user });
    } catch (error) {
        console.error('Error fetching stock data:', error);
        res.status(500).send('Internal Server Error');
    }
});


// Route for add_stock page
app.get('/admin/add_stock', ensureAuthenticated, ensureAdmin, (req, res) => {
    res.render('admin/add_stock', { user: req.session.user });
});


// Handle Add Stock Form Submission
app.post('/admin/add_stock',ensureAuthenticated, ensureAdmin, async (req, res) => {
    const { item, brand, model, quantity } = req.body;

    try {
        await promisePool.query('INSERT INTO stock (item, brand, model, quantity) VALUES (?, ?, ?, ?)', 
        [item, brand, model, quantity]);

        req.flash('success', 'Stock added successfully!');
        res.redirect('/admin/stock'); // Redirect to the stock list page
    } catch (error) {
        console.error('Error adding stock:', error);
        req.flash('error', 'Failed to add stock');
        res.redirect('/admin/add_stock');
    }
});

// Route for edit_stock page
app.get('/admin/edit_stock/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await promisePool.query('SELECT * FROM stock WHERE id = ?', [id]);
        if (rows.length === 0) {
            req.flash('error', 'Stock item not found');
            return res.redirect('/admin/stock');
        }
        res.render('admin/edit_stock', { stock: rows[0], user: req.session.user });
    } catch (error) {
        console.error('Error fetching stock:', error);
        req.flash('error', 'Failed to fetch stock item');
        res.redirect('/admin/stock');
    }
});

// Handle Edit Stock Form Submission
app.post('/admin/edit_stock/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
    const { id } = req.params;
    const { item, brand, model, quantity } = req.body;

    try {
        const [result] = await promisePool.query(
            'UPDATE stock SET item = ?, brand = ?, model = ?, quantity = ? WHERE id = ?',
            [item, brand, model, quantity, id]
        );
        
        if (result.affectedRows === 0) {
            req.flash('error', 'No stock item was updated');
            return res.redirect('/admin/stock');
        }

        req.flash('warning', 'Stock updated successfully');
        res.redirect('/admin/stock');
    } catch (error) {
        console.error('Error updating stock:', error);
        req.flash('error', 'Failed to update stock');
        res.redirect(`/admin/edit_stock/${id}`);
    }
});

function deleteStockById(stockId, callback) {
    // Replace `YourDatabaseModel` with your actual database model name
    YourDatabaseModel.deleteOne({ id: stockId }, function (err) {
        if (err) {
            console.error('Error deleting stock item:', err);
            callback(err);
        } else {
            console.log('Stock item deleted successfully');
            callback(null);
        }
    });
}


// Route for delete_stock confirmation page
app.get('/admin/delete_stock/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await promisePool.query('SELECT * FROM stock WHERE id = ?', [id]);
        if (rows.length === 0) {
            req.flash('error', 'Stock item not found');
            return res.redirect('/admin/stock');
        }
        res.render('admin/delete_stock', { stock: rows[0], user: req.session.user });
    } catch (error) {
        console.error('Error fetching stock for deletion:', error);
        req.flash('error', 'Failed to fetch stock item for deletion');
        res.redirect('/admin/stock');
    }
});

// Handle Delete Stock Form Submission
app.post('/admin/delete_stock/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        const [result] = await promisePool.query('DELETE FROM stock WHERE id = ?', [id]);

        if (result.affectedRows === 0) {
            req.flash('error', 'No stock item was deleted');
            return res.redirect('/admin/stock');
        }

        req.flash('danger', 'Stock deleted successfully');
        res.redirect('/admin/stock');
    } catch (error) {
        console.error('Error deleting stock:', error);
        req.flash('error', 'Failed to delete stock');
        res.redirect('/admin/stock');
    }
});

// Route for customer page
app.get('/admin/customer',ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const [rows] = await promisePool.query('SELECT * FROM customers');
        res.render('admin/customer', { customers: rows, user: req.session.user });
    } catch (error) {
        console.error('Error fetching customers:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Handle Add Customer Form Submission
app.post('/admin/add_customer',ensureAuthenticated, ensureAdmin, async (req, res) => {
    const { customerName, idNumber, contactNumber, email, address, purchasedItems, billValue } = req.body;

    try {
        await promisePool.query('INSERT INTO customers (customerName, idNumber, contactNumber, email, address, purchasedItems, billValue) VALUES (?, ?, ?, ?, ?, ?, ?)', 
        [customerName, idNumber, contactNumber, email, address, purchasedItems, billValue]);

        req.flash('success', 'Customer added successfully!');
        res.redirect('/admin/customer'); // Redirect to the customer list page
    } catch (error) {
        console.error('Error adding customer:', error);
        res.status(500).send('Internal Server Error');
    }
});


// Route for add_customer page
app.get('/admin/add_customer',ensureAuthenticated, ensureAdmin, (req, res) => {
    res.render('admin/add_customer');
});

// Route for edit customer page
app.get('/admin/edit_customer/:id',ensureAuthenticated, ensureAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await promisePool.query('SELECT * FROM customers WHERE id = ?', [id]);
        res.render('admin/edit_customer', { customer: rows[0], user: req.session.user });
    } catch (error) {
        console.error('Error fetching customer:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Handle Edit Customer Form Submission
app.post('/admin/edit_customer/:id',ensureAuthenticated, ensureAdmin, async (req, res) => {
    const { id } = req.params;
    const { customerName, idNumber, contactNumber, email, address, purchasedItems, billValue } = req.body;

    try {
        await promisePool.query('UPDATE customers SET customerName = ?, idNumber = ?, contactNumber = ?, email = ?, address = ?, purchasedItems = ?, billValue = ? WHERE id = ?', 
        [customerName, idNumber, contactNumber, email, address, purchasedItems, billValue, id]);

        req.flash('warning', 'Customer updated successfully');
        res.redirect('/admin/customer'); // Redirect to the customer list page
    } catch (error) {
        console.error('Error updating customer:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Handle Delete Customer Request
app.post('/admin/delete_customer/:id',ensureAuthenticated, ensureAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        await promisePool.query('DELETE FROM customers WHERE id = ?', [id]);
        
        req.flash('danger', 'Customer deleted successfully');
        res.redirect('/admin/customer'); // Redirect to the customer list page
    } catch (error) {
        console.error('Error deleting customer:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Route for products page (accessible to guests)
app.get('/products', async (req, res) => {
    try {
        // Fetching products from the new products table
        const [products] = await promisePool.query('SELECT * FROM products');
        
        // Render the products.ejs view with the products data
        res.render('products', { products });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).send('Internal Server Error');
    }
});



// Route to render the view product
app.get('/admin/view_product', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const [products] = await promisePool.query('SELECT * FROM products');
        res.render('admin/view_product', { products });
    } catch (error) {
        console.error('Error fetching products:', error);
        req.flash('error', 'There was an error fetching the products.');
        res.redirect('/admin/dashboard');
    }
});

// Route to render the add product form
app.get('/admin/add_product', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const [products] = await promisePool.query('SELECT * FROM products');
        res.render('admin/add_product', { products });
    } catch (error) {
        console.error('Error fetching products:', error);
        req.flash('error', 'There was an error fetching the products.');
        res.redirect('/admin/dashboard');
    }
});

// Set up Multer for file storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, 'public/uploads')); // Directory to store images
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname)); // Unique filename
    }
});

const upload = multer({ storage: storage });

// Add Product Route
app.post('/admin/add_product', ensureAuthenticated, ensureAdmin, upload.single('image'), async (req, res) => {
    const { item, brand, model, description, price, quantity } = req.body;
    const image_url = req.file ? `/uploads/${req.file.filename}` : null;

    try {
        await promisePool.query('INSERT INTO products (item, brand, model, description, price, image_url, quantity) VALUES (?, ?, ?, ?, ?, ?, ?)', 
        [item, brand, model, description, price, image_url, quantity]);

        req.flash('success', 'Product added successfully!');
        res.redirect('/admin/view_product');
    } catch (error) {
        console.error('Error adding product:', error);
        req.flash('error', 'There was an error adding the product. Please try again later.');
        res.redirect('/admin/view_product');
    }
});

// Edit Product Route
app.get('/admin/edit_product/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
    const productId = req.params.id;
    try {
        const [results] = await promisePool.query('SELECT * FROM products WHERE id = ?', [productId]);
        res.render('admin/edit_product', { product: results[0] });
    } catch (error) {
        console.error('Error fetching product:', error);
        req.flash('error', 'There was an error fetching the product.');
        res.redirect('/admin/view_product');
    }
});

// Update Product Route
app.post('/admin/update_product/:id', ensureAuthenticated, ensureAdmin, upload.single('image'), async (req, res) => {
    const productId = req.params.id;
    const { item, brand, model, description, price, quantity } = req.body;

    try {
        let query;
        let params;

        if (req.file) {
            const image_url = '/uploads/' + req.file.filename;
            query = `
                UPDATE products 
                SET item = ?, brand = ?, model = ?, description = ?, price = ?, quantity = ?, image_url = ?
                WHERE id = ?
            `;
            params = [item, brand, model, description, price, quantity, image_url, productId];
        } else {
            query = `
                UPDATE products 
                SET item = ?, brand = ?, model = ?, description = ?, price = ?, quantity = ?
                WHERE id = ?
            `;
            params = [item, brand, model, description, price, quantity, productId];
        }

        await promisePool.query(query, params);

        req.flash('warning', 'Product updated successfully');
        res.redirect('/admin/view_product');
    } catch (error) {
        console.error(`Error updating product with ID ${productId}:`, error);
        req.flash('error', 'There was an error updating the product.');
        res.redirect('/admin/view_product');
    }
});

// Delete Product Route
app.post('/admin/delete_product/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
    const productId = req.params.id;
    try {
        await promisePool.query('DELETE FROM products WHERE id = ?', [productId]);
        req.flash('danger', 'Product deleted successfully');
        res.redirect('/admin/view_product');
    } catch (error) {
        console.error('Error deleting product:', error);
        req.flash('error', 'There was an error deleting the product.');
        res.redirect('/admin/view_product');
    }
});

// Route for contact page
app.get('/contact', ensureAuthenticated, async (req, res) => {
    try {
        const userEmail = req.session.user.email;

        // Fetch the original messages sent by the user
        const [userMessages] = await promisePool.query('SELECT * FROM emails WHERE email = ? ORDER BY created_at DESC', [userEmail]);

        // Fetch replies associated with the user's messages
        const [replies] = await promisePool.query(`
            SELECT r.*, e.subject FROM email_replies r
            JOIN emails e ON r.email_id = e.id
            WHERE e.email = ?
            ORDER BY r.created_at ASC
        `, [userEmail]);

        // Pass the messages and replies to the contact view
        res.render('contact', {
            messagesList: userMessages,
            replies: replies,
            user: req.session.user
        });
    } catch (error) {
        console.error('Error fetching user messages or replies:', error);
        req.flash('error', 'There was an error fetching your messages. Please try again later.');
        res.redirect('/contact');
    }
});

// To store emails
app.post('/send-message', async (req, res) => {
    const { name, email, subject, message } = req.body;

    // Insert email details into the database
    try {
        await promisePool.query('INSERT INTO emails (name, email, subject, message) VALUES (?, ?, ?, ?)', 
        [name, email, subject, message]);

        req.flash('success', 'Your message has been sent successfully!');
        res.redirect('/contact');
    } catch (error) {
        console.error('Error saving email:', error);
        req.flash('error', 'There was an error sending your message. Please try again later.');
        res.redirect('/contact');
    }
});

// Route to show messages
app.get('/admin/messages', ensureAuthenticated, ensureAdmin, (req, res) => {
    promisePool.query('SELECT * FROM emails ORDER BY created_at DESC').then(([rows]) => {
        res.render('admin/messages', {
            messages: rows, // These are your fetched emails
            user: req.session.user // User session info
        });
    }).catch(error => {
        console.error('Error fetching messages:', error);
        res.status(500).send('Internal Server Error');
    });
});

// Render the reply form
app.get('/admin/reply-message/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
    const messageId = req.params.id;

    try {
        const [rows] = await promisePool.query('SELECT * FROM emails WHERE id = ?', [messageId]);
        res.render('admin/reply_message', { message: rows[0], user: req.session.user });
    } catch (error) {
        console.error('Error fetching message:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Handle sending the reply
app.post('/admin/reply-message/:id', async (req, res) => {
    const { replyMessage } = req.body;
    const messageId = req.params.id;

    try {
        // Fetch the original message by ID
        const [originalMessage] = await promisePool.query('SELECT * FROM emails WHERE id = ?', [messageId]);

        // Store the reply in the database
        await promisePool.query('INSERT INTO email_replies (email_id, reply_message) VALUES (?, ?)', [messageId, replyMessage]);

        // Send the reply via email (implement your sendEmail logic here)
        sendEmail({
            to: originalMessage[0].email,
            subject: `Re: ${originalMessage[0].subject}`,
            text: replyMessage,
        });

        req.flash('success', 'Reply sent successfully');
        res.redirect('/admin/messages');
    } catch (error) {
        console.error('Error sending reply:', error);
        req.flash('error', 'There was an error sending your reply. Please try again later.');
        res.redirect('/admin/messages');
    }
});


// Handle deleting messages
app.post('/admin/delete-message/:id', async (req, res) => {
    const messageId = req.params.id;

    try {
        await promisePool.query('DELETE FROM emails WHERE id = ?', [messageId]);
        req.flash('success', 'Message deleted successfully');
        res.redirect('/admin/messages');
    } catch (error) {
        req.flash('error', 'There was an error deleting the message. Please try again.');
        res.redirect('/admin/messages');
    }
});




// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
