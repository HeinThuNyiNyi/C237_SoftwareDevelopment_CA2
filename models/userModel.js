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
        SELECT id, name, role, created_at, last_active, is_banned, is_active, is_approved
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

// Total number of registered users, for the admin dashboard stat card.
function countAllUsers(callback) {
    db.query('SELECT COUNT(*) AS total FROM users', callback);
}

// ============================================================
// Profile management + approved sign-ups  (Hein Thu Nyi Nyi)
// ============================================================

// CREATE - a student registering themselves.
//
// The row goes straight into users, the same way the registration example
// in the module inserts into its own users table. The account starts with
// is_approved = 0, so the login route refuses it until an admin approves.
// The password arriving here is already SHA-1 hashed by the route.
function createUser(user, callback) {
    const sql = `
        INSERT INTO users (name, email, password, phone, role, is_approved)
        VALUES (?, ?, ?, ?, 'user', 0)
    `;
    db.query(sql, [user.name, user.email, user.password, user.phone], callback);
}

// READ - every account waiting for an admin decision.
function getPendingApprovals(callback) {
    const sql = `
        SELECT id, name, email, phone, created_at
        FROM users
        WHERE is_approved = 0
        ORDER BY created_at DESC
    `;
    db.query(sql, callback);
}

// UPDATE - the admin letting a new student in.
function approveUser(id, callback) {
    const sql = 'UPDATE users SET is_approved = 1 WHERE id = ?';
    db.query(sql, [id], callback);
}

// DELETE - the admin refusing a registration.
//
// A hard DELETE is safe here only because is_approved = 0 is part of the
// WHERE clause. An unapproved account has never been able to log in, so it
// cannot own any products, purchases, ratings or reports for the foreign
// key cascade to reach. An approved account is closed with is_active = 0
// instead - see deactivateAccount below.
function rejectUser(id, callback) {
    const sql = 'DELETE FROM users WHERE id = ? AND is_approved = 0';
    db.query(sql, [id], callback);
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
    findByEmail,
    findById,
    touchLastActive,
    findPublicById,
    getPublicStats,
    countAllUsers,
    createUser,
    getPendingApprovals,
    approveUser,
    rejectUser,
    updateProfile,
    updatePassword,
    deactivateAccount
};
