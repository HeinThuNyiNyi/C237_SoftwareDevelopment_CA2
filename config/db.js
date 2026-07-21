require('dotenv').config();
const mysql = require('mysql2');

// Database connection (Azure MySQL Database Server)
// Used by the files in models/ so they can run queries without
// touching the connection that app.js sets up for itself.
const connectionOptions = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: true }
};

const db = mysql.createConnection(connectionOptions);
const transactionPool = mysql.createPool({
    ...connectionOptions,
    connectionLimit: 5
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to the database:', err.message);
        return;
    }
    console.log('Connected to database (models)');
});

// Transactions must have an exclusive connection. Running a transaction on
// the shared model connection allows unrelated requests to accidentally join
// it, so transaction-based models borrow an isolated pooled connection.
db.getTransactionConnection = (callback) => {
    transactionPool.getConnection(callback);
};

module.exports = db;
