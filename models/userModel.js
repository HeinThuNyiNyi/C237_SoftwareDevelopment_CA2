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
// in the module inserts into its own users table. Holding an @myrp.edu.sg
// address is what proves the person is an RP student, so the account is
// usable immediately and there is no approval step.
// The password arriving here is already SHA-1 hashed by the route.
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

// READ - every student account, for the admin's Active Users page.
// Admins are left out: this page is for managing student accounts, and an
// admin should not be able to delete a fellow admin from here.
function getAllStudents(callback) {
    const sql = `
        SELECT id, name, email, phone, created_at, last_active,
               is_banned, banned_until, ban_reason
        FROM users
        WHERE role = 'user'
        ORDER BY name ASC
    `;
    db.query(sql, callback);
}

// Counts what a delete would destroy, so the confirmation can tell the
// admin exactly what is about to be lost.
//
// Every foreign key pointing at users is ON DELETE CASCADE, so removing
// one student also removes their listings and the purchase records and
// reviews that OTHER students made with them. The admin needs to see that
// before deciding, not afterwards.
function getDeletionImpact(id, callback) {
    const sql = `
        SELECT
            (SELECT COUNT(*) FROM products     WHERE seller_id = ?)                  AS listings,
            (SELECT COUNT(*) FROM purchases    WHERE seller_id = ? OR buyer_id = ?)  AS purchases,
            (SELECT COUNT(*) FROM ratings      WHERE seller_id = ? OR buyer_id = ?)  AS reviews,
            (SELECT COUNT(*) FROM reservations WHERE seller_id = ? OR buyer_id = ?)  AS reservations
    `;
    db.query(sql, [id, id, id, id, id, id, id], callback);
}

// DELETE - the admin permanently removing a student account, for example
// once that student has graduated and is no longer an RP student.
//
// role = 'user' is part of the WHERE clause on purpose, so this can never
// delete an admin account even if an admin id is sent by hand.
function deleteUser(id, callback) {
    const sql = "DELETE FROM users WHERE id = ? AND role = 'user'";
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
    updateProfile,
    updatePassword,
    getAllStudents,
    getDeletionImpact,
    deleteUser
};
