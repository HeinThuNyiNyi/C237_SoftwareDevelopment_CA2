// ============================================================
// Seed the team's accounts  (Hein Thu Nyi Nyi)
//
// Run it with:   node database/seedUsers.js
//
// Passwords are hashed with SHA-1 before they are inserted, the same
// algorithm the login route uses. A hash cannot be typed by hand, so
// accounts must be created through this script rather than by writing
// INSERT statements directly.
//
// Re-running is safe: an email that already exists has its details and
// password updated instead of a duplicate row being created.
// ============================================================

const db = require('../config/db');
const { hashPassword } = require('../utils/hash');

// Everyone on the team, so one run gives the whole group a working login.
const accounts = [
    { name: 'Admin One',        email: 'admin1@myrp.edu.sg',     password: 'Admin@123',   phone: null, role: 'admin' },
    { name: 'Admin Two',        email: 'admin2@myrp.edu.sg',     password: 'Admin@123',   phone: null, role: 'admin' },

    { name: 'Thiha Aung',       email: 'thiha@myrp.edu.sg',      password: 'Student@123', phone: null, role: 'user' },
    { name: 'Kaiduo',           email: 'kaiduo@myrp.edu.sg',     password: 'Student@123', phone: null, role: 'user' },
    { name: 'Ei Htet Htet Tun', email: 'eihtet@myrp.edu.sg',     password: 'Student@123', phone: null, role: 'user' },
    { name: 'Hein Thu Nyi Nyi', email: 'heinthu@myrp.edu.sg',    password: 'Student@123', phone: null, role: 'user' },
    { name: 'Denna',            email: 'denna@myrp.edu.sg',      password: 'Student@123', phone: null, role: 'user' },
    { name: 'Zhen Cheng Chao',  email: 'chengchao@myrp.edu.sg',  password: 'Student@123', phone: null, role: 'user' }
];

function seedAccount(account, callback) {
    const sql = `
        INSERT INTO users (name, email, password, phone, role)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            password = VALUES(password),
            phone = VALUES(phone),
            role = VALUES(role)
    `;

    const hash = hashPassword(account.password);

    db.query(sql, [account.name, account.email, hash, account.phone, account.role], (error) => {
        if (error) {
            return callback(error);
        }
        console.log('  ' + account.role.padEnd(5) + '  ' + account.email.padEnd(26) + 'password: ' + account.password);
        callback(null);
    });
}

// Work through the accounts one at a time, then close the connection.
function seedNext(index) {
    if (index >= accounts.length) {
        console.log('\nDone. All accounts now use SHA-1 hashed passwords.');
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

console.log('Seeding accounts with SHA-1 hashed passwords...\n');
seedNext(0);
