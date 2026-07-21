const db = require('../config/db');

// Notifications for report outcomes. (Ei Htet Htet Tun's part)

// Tell a user something happened - right now this is only used to let a
// reporter know their report was resolved.
function create(userId, message, link, callback) {
    const sql = 'INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)';
    db.query(sql, [userId, message, link || null], callback);
}

// A user's notifications, newest first, for the notifications page.
function getForUser(userId, callback) {
    const sql = 'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC';
    db.query(sql, [userId], callback);
}

module.exports = {
    create,
    getForUser
};
