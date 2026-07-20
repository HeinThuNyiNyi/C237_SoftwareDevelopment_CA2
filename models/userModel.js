const db = require('../config/db');

// Find one user by their school email. Used by the login route.
// Returns an array (mysql2 always does) - the route checks results.length.
function findByEmail(email, callback) {
    const sql = 'SELECT * FROM users WHERE email = ?';
    db.query(sql, [email], callback);
}

// Find one user by id. Used by the "My Account" page, where it is safe to
// show the person their own email and phone number.
function findById(id, callback) {
    const sql = 'SELECT * FROM users WHERE id = ?';
    db.query(sql, [id], callback);
}

// Record the time of a successful login. Used for the "Last seen" line on
// the public profile. Failures here are ignored by the caller because a
// login should still succeed even if this small update does not.
function touchLastActive(id, callback) {
    const sql = 'UPDATE users SET last_active = NOW() WHERE id = ?';
    db.query(sql, [id], callback);
}

// Find one user for their PUBLIC profile page.
//
// The columns are listed out on purpose instead of using SELECT *, so that
// the password hash, email, phone and ban details can never be sent to a
// page that another student is allowed to look at.
function findPublicById(id, callback) {
    const sql = `
        SELECT id, name, role, created_at, last_active, is_banned
        FROM users
        WHERE id = ?
    `;
    db.query(sql, [id], callback);
}

// Work out the seller statistics shown on the public profile.
//
// These read the other team members' tables. If a feature has no rows yet
// the counts simply come back as 0, so this keeps working as they build.
function getPublicStats(id, callback) {
    const sql = `
        SELECT
            (SELECT COUNT(*) FROM products
              WHERE seller_id = ? AND status = 'selling')            AS activeListings,

            (SELECT COUNT(*) FROM purchases
              WHERE seller_id = ?)                                   AS itemsSold,

            (SELECT COUNT(*) FROM ratings
              WHERE seller_id = ?)                                   AS reviewCount,

            (SELECT ROUND(AVG(rating), 1) FROM ratings
              WHERE seller_id = ?)                                   AS averageRating,

            (SELECT COUNT(*) FROM ratings
              WHERE seller_id = ? AND rating >= 4)                   AS goodRatings
    `;
    db.query(sql, [id, id, id, id, id], callback);
}

module.exports = {
    findByEmail,
    findById,
    touchLastActive,
    findPublicById,
    getPublicStats
};
