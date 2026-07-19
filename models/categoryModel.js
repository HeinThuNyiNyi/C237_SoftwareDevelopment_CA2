const db = require('../config/db');

// Get all categories (used for the Sell form and the Browse filter dropdown)
function getAllCategories(callback) {
    const sql = 'SELECT * FROM categories ORDER BY name';
    db.query(sql, callback);
}

module.exports = {
    getAllCategories
};
