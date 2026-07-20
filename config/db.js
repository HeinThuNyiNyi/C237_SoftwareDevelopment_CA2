require('dotenv').config();
const mysql = require('mysql2');

// Database connection (Azure MySQL Database Server)
// Used by the files in models/ so they can run queries without
// touching the connection that app.js sets up for itself.
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
    console.log('Connected to database (models)');
});

module.exports = db;
