// ============================================================
// Seed test accounts for the login feature (Hein Thu Nyi Nyi)
//
// Run it with:   node database/seedUsers.js
//
// Passwords are hashed with bcrypt before they are inserted, because a
// bcrypt hash cannot be typed by hand into an SQL file. Re-running this
// script is safe - an existing email has its password re-hashed instead
// of creating a duplicate row.
// ============================================================

const bcrypt = require('bcrypt');
const db = require('../config/db');

const SALT_ROUNDS = 10;

// Test accounts. Change the passwords here if you want different ones.
const accounts = [
    {
        name: 'Admin Account',
        email: 'admin@myrp.edu.sg',
        password: 'Admin@123',
        phone: '61234567',
        role: 'admin'
    },
    {
        name: 'Hein Thu Nyi Nyi',
        email: 'heinthu@myrp.edu.sg',
        password: 'Student@123',
        phone: '69876543',
        role: 'user'
    },
    {
        name: 'Test Student',
        email: 'teststudent@myrp.edu.sg',
        password: 'Student@123',
        phone: '65551234',
        role: 'user'
    },
    {
        // Second student, so a buyer and a seller can be tested at the same
        // time using two different logins in two browser windows.
        name: 'Student Two',
        email: 'student2@myrp.edu.sg',
        password: 'Student@123',
        phone: '65559876',
        role: 'user'
    }
];

function seedAccount(account, callback) {
    bcrypt.hash(account.password, SALT_ROUNDS, (hashError, hash) => {
        if (hashError) {
            return callback(hashError);
        }

        const sql = `
            INSERT INTO users (name, email, password, phone, role)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                password = VALUES(password),
                phone = VALUES(phone),
                role = VALUES(role)
        `;

        db.query(sql, [account.name, account.email, hash, account.phone, account.role], (queryError) => {
            if (queryError) {
                return callback(queryError);
            }
            console.log('  Seeded ' + account.role.padEnd(5) + '  ' + account.email + '  (password: ' + account.password + ')');
            callback(null);
        });
    });
}

// Work through the accounts one at a time, then close the connection.
function seedNext(index) {
    if (index >= accounts.length) {
        console.log('\nDone. You can now log in at http://localhost:3000/login');
        return db.end();
    }

    seedAccount(accounts[index], (error) => {
        if (error) {
            console.error('Error seeding ' + accounts[index].email + ':', error.message);
            return db.end();
        }
        seedNext(index + 1);
    });
}

console.log('Seeding test accounts...\n');
seedNext(0);
