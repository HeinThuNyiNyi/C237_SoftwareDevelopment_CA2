const db = require('../config/db');

// ============================================================
// Student sign-ups waiting for admin approval  (Hein Thu Nyi Nyi)
//
// A sign-up sits in pending_registrations until an admin approves it.
// Only on approval is a real row created in users, which is why an
// unapproved student cannot log in - the login route only ever looks
// in the users table.
// ============================================================


// ---------- CREATE ----------

// Save a sign-up. The password arriving here is already SHA-1 hashed.
function createRegistration(registration, callback) {
    const sql = `
        INSERT INTO pending_registrations (name, email, password, phone)
        VALUES (?, ?, ?, ?)
    `;
    db.query(sql, [
        registration.name,
        registration.email,
        registration.password,
        registration.phone
    ], callback);
}


// ---------- READ ----------

// Everything the admin needs to review, waiting ones first.
function getAllRegistrations(callback) {
    const sql = `
        SELECT pending_registrations.*, admins.name AS reviewerName
        FROM pending_registrations
        LEFT JOIN users AS admins ON pending_registrations.reviewed_by = admins.id
        ORDER BY (pending_registrations.status = 'pending') DESC,
                 pending_registrations.created_at DESC
    `;
    db.query(sql, callback);
}

function getRegistrationById(id, callback) {
    const sql = 'SELECT * FROM pending_registrations WHERE id = ?';
    db.query(sql, [id], callback);
}

// Used to stop someone signing up twice with the same email while their
// first request is still waiting.
function findByEmail(email, callback) {
    const sql = 'SELECT * FROM pending_registrations WHERE email = ?';
    db.query(sql, [email], callback);
}


// ---------- UPDATE ----------

// Record that an admin refused the sign-up, with the reason so the
// student can be told why.
function rejectRegistration(id, reason, reviewedBy, callback) {
    const sql = `
        UPDATE pending_registrations
        SET status = 'rejected', rejection_reason = ?, reviewed_by = ?, reviewed_at = NOW()
        WHERE id = ?
    `;
    db.query(sql, [reason, reviewedBy, id], callback);
}


// ---------- DELETE ----------

// Removes the sign-up request. Called after a successful approval, once
// the real row exists in users, and also when an admin clears out an old
// rejected request.
function deleteRegistration(id, callback) {
    const sql = 'DELETE FROM pending_registrations WHERE id = ?';
    db.query(sql, [id], callback);
}


module.exports = {
    createRegistration,
    getAllRegistrations,
    getRegistrationById,
    findByEmail,
    rejectRegistration,
    deleteRegistration
};
