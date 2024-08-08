require('dotenv').config();

const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const flash = require('connect-flash');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const db = require('./node/db');
const nodemailer = require('nodemailer');
const app = express();
const port = 3000;

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to parse incoming request bodies
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static('public'));

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
    res.locals.user = req.session.user || null; // Add user to res.locals
    next();
});

// Create a MySQL connection pool
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '111',
    database: 'mobile_care'
});

// Promise wrapper for MySQL queries
const promisePool = pool.promise();

const transporter = nodemailer.createTransport({
    host: process.env.MAILTRAP_HOST,
    port: process.env.MAILTRAP_PORT,
    auth: {
        user: process.env.MAILTRAP_USER,
        pass: process.env.MAILTRAP_PASS
    }
});

app.post('/send-message', (req, res) => {
    const { name, email, message } = req.body;
    
    const mailOptions = {
        from: email,
        to: process.env.MAILTRAP_TO, // Replace with the recipient's email
        subject: `New message from ${name}`,
        text: message
    };
    
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error:', error);
            req.flash('error', 'Failed to send message. Please try again later.');
            res.redirect('/contact');
        } else {
            console.log('Email sent: ' + info.response);
            req.flash('success', 'Message sent successfully!');
            res.redirect('/contact');
        }
    });
});


// Route for home page
app.get('/', (req, res) => {
    res.render('index', {
        user: req.session.user || null,
        messages: req.flash()
    });
});

// Route for login page
app.get('/login', (req, res) => {
    res.render('login');
});

// Route for register page
app.get('/register', (req, res) => {
    res.render('register');
});

// Handle login form submission
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const [rows] = await promisePool.query('SELECT * FROM users WHERE username = ?', [username]);
        const user = rows[0];

        if (user && await bcrypt.compare(password, user.password)) {
            req.session.user = user;
            req.flash('success', 'Logged in successfully');
            res.redirect('/');
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



// Handle Register Form Submission
app.post('/register', async (req, res) => {
    const { username, password, confirm_password } = req.body;

    if (password !== confirm_password) {
        return res.status(400).send('Passwords do not match');
    }

    try {
        // Hash the password before storing it
        const bcrypt = require('bcrypt');
        const hashedPassword = await bcrypt.hash(password, 10);

        await promisePool.query('INSERT INTO users (username, password) VALUES (?, ?)', 
        [username, hashedPassword]);

        res.redirect('/login'); // Redirect to login page after successful registration
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Homepage route
app.get('/', (req, res) => {
    res.render('index', {
        user: req.session.user || null,
        messages: req.flash() // Pass flash messages
    });
});


// Route for stock page
app.get('/stock', async (req, res) => {
    try {
        const [rows] = await promisePool.query('SELECT * FROM stock');
        res.render('stock', { stock: rows });
    } catch (error) {
        console.error('Error fetching stock:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Route for add_stock page
app.get('/add_stock', (req, res) => {
    res.render('add_stock');
});

// Handle Add Stock Form Submission
app.post('/add_stock', async (req, res) => {
    const { item, brand, model, quantity } = req.body;

    try {
        await promisePool.query('INSERT INTO stock (item, brand, model, quantity) VALUES (?, ?, ?, ?)', 
        [item, brand, model, quantity]);

        res.redirect('/stock'); // Redirect to the stock list page
    } catch (error) {
        console.error('Error adding stock:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Route for edit_stock page
app.get('/edit_stock/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await promisePool.query('SELECT * FROM stock WHERE id = ?', [id]);
        res.render('edit_stock', { stock: rows[0] });
    } catch (error) {
        console.error('Error fetching stock:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Handle Edit Stock Form Submission
app.post('/edit_stock/:id', async (req, res) => {
    const { id } = req.params;
    const { item, brand, model, quantity } = req.body;

    try {
        await promisePool.query('UPDATE stock SET item = ?, brand = ?, model = ?, quantity = ? WHERE id = ?', 
        [item, brand, model, quantity, id]);

        res.redirect('/stock'); // Redirect to the stock list page
    } catch (error) {
        console.error('Error updating stock:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Route for delete_stock page (confirmation)
app.get('/delete_stock/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await promisePool.query('SELECT * FROM stock WHERE id = ?', [id]);
        res.render('delete_stock', { stock: rows[0] });
    } catch (error) {
        console.error('Error fetching stock for deletion:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Handle Delete Stock Request
app.post('/delete_stock/:id', async (req, res) => {
    const { id } = req.params;

    try {
        await promisePool.query('DELETE FROM stock WHERE id = ?', [id]);
        res.redirect('/stock'); // Redirect to the stock list page
    } catch (error) {
        console.error('Error deleting stock:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Handle Add Customer Form Submission
app.post('/add_customer', async (req, res) => {
    const { customerName, idNumber, contactNumber, email, address, purchasedItems, billValue } = req.body;

    try {
        await promisePool.query('INSERT INTO customers (customerName, idNumber, contactNumber, email, address, purchasedItems, billValue) VALUES (?, ?, ?, ?, ?, ?, ?)', 
        [customerName, idNumber, contactNumber, email, address, purchasedItems, billValue]);

        res.redirect('/customer'); // Redirect to the customer list page
    } catch (error) {
        console.error('Error adding customer:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Route for customer page
app.get('/customer', async (req, res) => {
    try {
        const [rows] = await promisePool.query('SELECT * FROM customers');
        res.render('customer', { customers: rows });
    } catch (error) {
        console.error('Error fetching customers:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Route for add_customer page
app.get('/add_customer', (req, res) => {
    res.render('add_customer');
});

// Route for contact page
app.get('/contact', (req, res) => {
    res.render('contact');
});

// Route for edit customer page
app.get('/edit_customer/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await promisePool.query('SELECT * FROM customers WHERE id = ?', [id]);
        res.render('edit_customer', { customer: rows[0] });
    } catch (error) {
        console.error('Error fetching customer:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Handle Edit Customer Form Submission
app.post('/edit_customer/:id', async (req, res) => {
    const { id } = req.params;
    const { customerName, idNumber, contactNumber, email, address, purchasedItems, billValue } = req.body;

    try {
        await promisePool.query('UPDATE customers SET customerName = ?, idNumber = ?, contactNumber = ?, email = ?, address = ?, purchasedItems = ?, billValue = ? WHERE id = ?', 
        [customerName, idNumber, contactNumber, email, address, purchasedItems, billValue, id]);

        res.redirect('/customer'); // Redirect to the customer list page
    } catch (error) {
        console.error('Error updating customer:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Handle Delete Customer Request
app.post('/delete_customer/:id', async (req, res) => {
    const { id } = req.params;

    try {
        await promisePool.query('DELETE FROM customers WHERE id = ?', [id]);
        res.redirect('/customer'); // Redirect to the customer list page
    } catch (error) {
        console.error('Error deleting customer:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Route for about page
app.get('/about', (req, res) => {
    res.render('about');
});

// Route for services page
app.get('/services', (req, res) => {
    res.render('services');
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
