const pool = require('../config/database');

const baseSelect = `SELECT
    products.*,
    categories.name AS categoryName,
    users.name AS sellerName
FROM products
JOIN users ON products.seller_id = users.id
LEFT JOIN categories ON products.category_id = categories.id`;

const Product = {
    async getApprovedProducts({ categoryId, search }) {
        let sql = `${baseSelect}
            WHERE products.status IN ('selling', 'reserved', 'sold_out')`;
        const params = [];

        if (categoryId) {
            sql += ' AND products.category_id = ?';
            params.push(categoryId);
        }

        if (search) {
            sql += ' AND products.name LIKE ?';
            params.push(`%${search}%`);
        }

        sql += ' ORDER BY products.created_at DESC';
        const [rows] = await pool.execute(sql, params);
        return rows;
    },

    async getRecentApproved(limit = 3) {
        const safeLimit = Math.max(1, Math.min(Number(limit) || 3, 20));
        const [rows] = await pool.query(
            `${baseSelect}
             WHERE products.status IN ('selling', 'reserved', 'sold_out')
             ORDER BY products.created_at DESC
             LIMIT ${safeLimit}`
        );
        return rows;
    },

    async getById(productId) {
        const [rows] = await pool.execute(`${baseSelect} WHERE products.id = ? LIMIT 1`, [productId]);
        return rows[0] || null;
    },

    async create(product) {
        const [result] = await pool.execute(
            `INSERT INTO products
                (seller_id, category_id, name, description, price, \`condition\`,
                 quantity, image, contact_info, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [
                product.sellerId,
                product.categoryId,
                product.name,
                product.description,
                product.price,
                product.condition,
                product.quantity,
                product.image,
                product.contactInfo
            ]
        );
        return result.insertId;
    },

    async getPendingProducts() {
        const [rows] = await pool.query(
            `${baseSelect}
             WHERE products.status = 'pending'
             ORDER BY products.created_at ASC`
        );
        return rows;
    },

    async approve(productId) {
        await pool.execute(
            "UPDATE products SET status = 'selling', rejection_reason = NULL WHERE id = ?",
            [productId]
        );
    },

    async reject(productId, reason) {
        await pool.execute(
            "UPDATE products SET status = 'rejected', rejection_reason = ? WHERE id = ?",
            [reason, productId]
        );
    }
};

module.exports = Product;
