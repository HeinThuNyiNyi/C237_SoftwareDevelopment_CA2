require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');

const app = express();

// Database connection (Azure MySQL Database Server)
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: true }
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to the database:', err.message);
        return;
    }
    console.log('Connected to database');
});

app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 60000 } // Session expires after 1 minute
}));

app.use(flash());

// Setting up EJS
app.set('view engine', 'ejs');

// ==================== Thiha Aung's routes ====================

app.get('/', (req, res) => {
    res.render('index');
});

app.get('/admin', (req, res) => {
    res.render('admin/index');
});


// ==================== Kaido's routes ====================


// ==================== Ei Htet Htet Tun's routes ====================


// ==================== Hein Thu Nyi Nyi's routes ====================


// ==================== Denna's routes ====================


// ==================== Zhen Cheng Chao's routes ====================


// 404 handler - catches any request that doesn't match a route above
app.use((req, res) => {
    res.status(404).send('Error: Page not found.');
});

// General error handler - catches errors passed via next(err)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Error: Something went wrong on the server.');
});

// Starting the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
});
