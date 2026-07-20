const db = require('../config/db');

// Products visible to buyers: only ones the admin has approved
// (status is selling / reserved / sold_out - never pending or rejected)
// Supports filtering by category and a keyword search on the product name
function getApprovedProducts(filters, callback) {
    let sql = `SELECT products.*, categories.name AS categoryName, users.name AS sellerName
               FROM products
               JOIN users ON products.seller_id = users.id
               LEFT JOIN categories ON products.category_id = categories.id
               WHERE products.status IN ('selling', 'reserved', 'sold_out')`;
    const params = [];

    if (filters.categoryId) {
        sql += ' AND products.category_id = ?';
        params.push(filters.categoryId);
    }

    if (filters.search) {
        sql += ' AND products.name LIKE ?';
        params.push('%' + filters.search + '%');
    }

    sql += ' ORDER BY products.created_at DESC';

    db.query(sql, params, callback);
}

// One product with its category and seller info, for the product details page
function getProductById(productId, callback) {
    const sql = `SELECT products.*, categories.name AS categoryName, users.name AS sellerName
                 FROM products
                 JOIN users ON products.seller_id = users.id
                 LEFT JOIN categories ON products.category_id = categories.id
                 WHERE products.id = ?`;
    db.query(sql, [productId], callback);
}

// Insert a new product listing. Always starts as 'pending' until an admin approves it.
function createProduct(product, callback) {
    const sql = `INSERT INTO products
                 (seller_id, category_id, name, description, price, \`condition\`, quantity, image, contact_info, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`;
    const params = [
        product.sellerId,
        product.categoryId,
        product.name,
        product.description,
        product.price,
        product.condition,
        product.quantity,
        product.image,
        product.contactInfo
    ];
    db.query(sql, params, callback);
}

// All products waiting for admin review
function getPendingProducts(callback) {
    const sql = `SELECT products.*, categories.name AS categoryName, users.name AS sellerName
                 FROM products
                 JOIN users ON products.seller_id = users.id
                 LEFT JOIN categories ON products.category_id = categories.id
                 WHERE products.status = 'pending'
                 ORDER BY products.created_at ASC`;
    db.query(sql, callback);
}

// Admin approves a pending product -> becomes visible to buyers
function approveProduct(productId, callback) {
    const sql = "UPDATE products SET status = 'selling', rejection_reason = NULL WHERE id = ?";
    db.query(sql, [productId], callback);
}

// Admin rejects a pending product and stores why, so the seller can see the reason
function rejectProduct(productId, reason, callback) {
    const sql = "UPDATE products SET status = 'rejected', rejection_reason = ? WHERE id = ?";
    db.query(sql, [reason, productId], callback);
}

module.exports = {
    getApprovedProducts,
    getProductById,
    createProduct,
    getPendingProducts,
    approveProduct,
    rejectProduct
};
