const db = require('../config/db');

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

// Everyone who is not currently banned (total users minus banned users).
// Admin accounts are excluded - this list is for managing student accounts.
function getActiveUsers(callback) {
    const sql = `SELECT id, name, email, role, created_at FROM users
                 WHERE is_banned = 0 AND role != 'admin'
                 ORDER BY name ASC`;
    db.query(sql, callback);
}

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
        SELECT id, name, role, created_at, last_active, is_banned, is_active
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

            (SELECT COUNT(*) FROM ratings r
              WHERE r.seller_id = ?
                AND EXISTS (
                    SELECT 1 FROM purchases p
                    WHERE p.buyer_id = r.buyer_id
                      AND p.product_id = r.product_id
                ))                                                    AS reviewCount,

            (SELECT ROUND(AVG(r.rating), 1) FROM ratings r
              WHERE r.seller_id = ?
                AND EXISTS (
                    SELECT 1 FROM purchases p
                    WHERE p.buyer_id = r.buyer_id
                      AND p.product_id = r.product_id
                ))                                                    AS averageRating,

            (SELECT COUNT(*) FROM ratings r
              WHERE r.seller_id = ? AND r.rating >= 4
                AND EXISTS (
                    SELECT 1 FROM purchases p
                    WHERE p.buyer_id = r.buyer_id
                      AND p.product_id = r.product_id
                ))                                                    AS goodRatings
    `;
    db.query(sql, [id, id, id, id, id], callback);
}

// Total number of registered users, for the admin dashboard stat card.
function countAllUsers(callback) {
    db.query('SELECT COUNT(*) AS total FROM users', callback);
}

// ============================================================
// Profile management + approved sign-ups  (Hein Thu Nyi Nyi)
// ============================================================

// Create a real account. Only called when an admin approves a sign-up
// from pending_registrations - there is no other route into this table.
function createUser(user, callback) {
    const sql = `
        INSERT INTO users (name, email, password, phone, role)
        VALUES (?, ?, ?, ?, 'user')
    `;
    db.query(sql, [user.name, user.email, user.password, user.phone], callback);
}

// UPDATE - the student editing their own name and phone number.
// Email is deliberately not editable: it is the login identifier and is
// issued by the school.
function updateProfile(id, name, phone, callback) {
    const sql = 'UPDATE users SET name = ?, phone = ? WHERE id = ?';
    db.query(sql, [name, phone, id], callback);
}

// UPDATE - change the password. The new value is already SHA-1 hashed
// by the route before it gets here.
function updatePassword(id, hashedPassword, callback) {
    const sql = 'UPDATE users SET password = ? WHERE id = ?';
    db.query(sql, [hashedPassword, id], callback);
}

// The student closing their own account.
//
// The row is kept on purpose. Every foreign key pointing at users is
// ON DELETE CASCADE, so removing the row would also delete their
// listings, ratings, reports, reservations and purchase history -
// including records that belong to the students they traded with.
// Setting is_active = 0 blocks the login instead, which is the same
// outcome for them without destroying anyone else's data.
function deactivateAccount(id, callback) {
    const sql = 'UPDATE users SET is_active = 0 WHERE id = ?';
    db.query(sql, [id], callback);
}

module.exports = {
    getUserById,
    banUser,
    unbanUser,
    getBannedUsers,
    getActiveUsers,
    findByEmail,
    findById,
    touchLastActive,
    findPublicById,
    getPublicStats,
    countAllUsers,
    createUser,
    updateProfile,
    updatePassword,
    deactivateAccount
};
