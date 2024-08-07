const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('./db');

const router = express.Router();

router.get('/', (req, res) => {
    res.render('index.html');
});

router.get('/about', (req, res) => {
    res.render('about.html');
});

router.get('/services', (req, res) => {
    res.render('services.html');
});

router.get('/stock', (req, res) => {
    res.render('stock.html');
});

router.get('/customer', (req, res) => {
    res.render('customer.html');
});

router.get('/contact', (req, res) => {
    res.render('contact.html');
});

router.get('/login', (req, res) => {
    res.render('login.html');
});

router.get('/register', (req, res) => {
    res.render('register.html');
});

router.post('/register', (req, res) => {
    const { username, password, confirm_password } = req.body;

    if (password !== confirm_password) {
        return res.send('Passwords do not match!');
    }

    const hashedPassword = bcrypt.hashSync(password, 10);

    const query = 'INSERT INTO users (username, password) VALUES (?, ?)';
    db.query(query, [username, hashedPassword], (err, result) => {
        if (err) {
            return res.send('Error registering user: ' + err.message);
        }
        res.send('Registration successful!');
    });
});

router.post('/login', (req, res) => {
    const { username, password } = req.body;

    const query = 'SELECT password FROM users WHERE username = ?';
    db.query(query, [username], (err, results) => {
        if (err) {
            return res.send('Error logging in: ' + err.message);
        }

        if (results.length === 0 || !bcrypt.compareSync(password, results[0].password)) {
            return res.send('Invalid username or password.');
        }

        res.send('Login successful!');
    });
});

module.exports = router;
