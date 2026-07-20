const db = require('../config/db');

// Reports: a normal user reporting a product or another user, reviewed by admin.
// (Ei Htet Htet Tun's part)

// Insert a new report. Either reportedProductId or reportedUserId (or both) will be set,
// depending on whether the buyer reported a listing or a person.
function createReport(report, callback) {
    const sql = `INSERT INTO reports
                 (reporter_id, reported_user_id, reported_product_id, category, description, evidence_image, status)
                 VALUES (?, ?, ?, ?, ?, ?, 'pending')`;
    const params = [
        report.reporterId,
        report.reportedUserId || null,
        report.reportedProductId || null,
        report.category,
        report.description,
        report.evidenceImage
    ];
    db.query(sql, params, callback);
}

// All reports for the admin report panel, newest first.
// status can be 'pending', 'approved', 'rejected' or 'all'.
function getAllReports(status, callback) {
    let sql = `SELECT reports.*,
                      reporter.name AS reporterName,
                      reportedUser.name AS reportedUserName,
                      products.name AS reportedProductName
               FROM reports
               JOIN users AS reporter ON reports.reporter_id = reporter.id
               LEFT JOIN users AS reportedUser ON reports.reported_user_id = reportedUser.id
               LEFT JOIN products ON reports.reported_product_id = products.id`;
    const params = [];

    if (status && status !== 'all') {
        sql += ' WHERE reports.status = ?';
        params.push(status);
    }

    sql += ' ORDER BY reports.created_at DESC';
    db.query(sql, params, callback);
}

// One report with full reporter / reported user / reported product details,
// for the admin review page.
function getReportById(reportId, callback) {
    const sql = `SELECT reports.*,
                        reporter.name AS reporterName, reporter.email AS reporterEmail,
                        reportedUser.name AS reportedUserName, reportedUser.email AS reportedUserEmail,
                        reportedUser.is_banned AS reportedUserBanned,
                        products.name AS reportedProductName, products.image AS reportedProductImage,
                        products.status AS reportedProductStatus
                FROM reports
                JOIN users AS reporter ON reports.reporter_id = reporter.id
                LEFT JOIN users AS reportedUser ON reports.reported_user_id = reportedUser.id
                LEFT JOIN products ON reports.reported_product_id = products.id
                WHERE reports.id = ?`;
    db.query(sql, [reportId], callback);
}

// Reports submitted by one user, for their own "My Reports" history page.
function getReportsByReporter(reporterId, callback) {
    const sql = `SELECT reports.*,
                        reportedUser.name AS reportedUserName,
                        products.name AS reportedProductName
                FROM reports
                LEFT JOIN users AS reportedUser ON reports.reported_user_id = reportedUser.id
                LEFT JOIN products ON reports.reported_product_id = products.id
                WHERE reports.reporter_id = ?
                ORDER BY reports.created_at DESC`;
    db.query(sql, [reporterId], callback);
}

// Admin approves the report: some action was taken against the product/user.
// adminAction is a short text summary of what was done, stored for the record.
function approveReport(reportId, adminAction, callback) {
    const sql = "UPDATE reports SET status = 'approved', admin_action = ?, resolved_at = NOW() WHERE id = ?";
    db.query(sql, [adminAction, reportId], callback);
}

// Admin dismisses the report: no action needed against the product/user.
function dismissReport(reportId, adminAction, callback) {
    const sql = "UPDATE reports SET status = 'rejected', admin_action = ?, resolved_at = NOW() WHERE id = ?";
    db.query(sql, [adminAction, reportId], callback);
}

module.exports = {
    createReport,
    getAllReports,
    getReportById,
    getReportsByReporter,
    approveReport,
    dismissReport
};
