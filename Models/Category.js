const pool = require('../config/database');

const Category = {
    async getAll() {
        const [rows] = await pool.query('SELECT id, name FROM categories ORDER BY name');
        return rows;
    }
};

module.exports = Category;
