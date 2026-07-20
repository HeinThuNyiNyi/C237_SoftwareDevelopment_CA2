const db = require('../config/db');

// Find one user by their school email. Used by the login route.
// Returns an array (mysql2 always does) - the route checks results.length.
function findByEmail(email, callback) {
    const sql = 'SELECT * FROM users WHERE email = ?';
    db.query(sql, [email], callback);
}

// Find one user by id. Used by the profile pages.
function findById(id, callback) {
    const sql = 'SELECT * FROM users WHERE id = ?';
    db.query(sql, [id], callback);
}

// Looking up a reported user and banning/unbanning an account after a
// report has been reviewed. (Ei Htet Htet Tun's part)

// Basic public info for a user, used on the "report this user" form
// and on the admin report review page.
function getUserById(userId, callback) {
    const sql = 'SELECT id, name, email, phone, role, is_banned, banned_until FROM users WHERE id = ?';
    db.query(sql, [userId], callback);
}

// Ban a user for a number of days, or permanently when days === 'permanent'.
function banUser(userId, days, reason, bannedBy, callback) {
    if (days === 'permanent') {
        const sql = 'UPDATE users SET is_banned = 1, banned_until = NULL, ban_reason = ?, banned_by = ? WHERE id = ?';
        db.query(sql, [reason, bannedBy, userId], callback);
    } else {
        const sql = 'UPDATE users SET is_banned = 1, banned_until = DATE_ADD(NOW(), INTERVAL ? DAY), ban_reason = ?, banned_by = ? WHERE id = ?';
        db.query(sql, [days, reason, bannedBy, userId], callback);
    }
}

// Lift a ban before it expires.
function unbanUser(userId, callback) {
    const sql = 'UPDATE users SET is_banned = 0, banned_until = NULL, ban_reason = NULL, banned_by = NULL WHERE id = ?';
    db.query(sql, [userId], callback);
}

// All currently banned users, shown on the admin report panel.
function getBannedUsers(callback) {
    const sql = `SELECT id, name, email, banned_until, ban_reason FROM users
                 WHERE is_banned = 1
                 ORDER BY banned_until IS NULL DESC, banned_until ASC`;
    db.query(sql, callback);
}

module.exports = {
    findByEmail,
    findById,
    getUserById,
    banUser,
    unbanUser,
    getBannedUsers
};
