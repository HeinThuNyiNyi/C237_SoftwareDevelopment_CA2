const db = require('../config/db');

// Products visible to buyers: only ones the admin has approved and that are
// still available (sold_out listings are hidden from Browse - once every
// unit is gone there's nothing left for a buyer to act on there).
// Supports filtering by category and a keyword search on the product name
function getApprovedProducts(filters, callback) {
    let sql = `SELECT products.*, categories.name AS categoryName, users.name AS sellerName
               FROM products
               JOIN users ON products.seller_id = users.id
               LEFT JOIN categories ON products.category_id = categories.id
               WHERE products.status IN ('selling', 'reserved')`;
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

// A seller's own listings - pending admin approval, currently selling, or
// reserved - for their Sales History page. status can narrow to just one
// of those three, or 'all'/omitted for all three together.
function getSellerListings(sellerId, status, callback) {
    let sql = `SELECT products.*, categories.name AS categoryName
               FROM products
               LEFT JOIN categories ON products.category_id = categories.id
               WHERE products.seller_id = ?`;
    const params = [sellerId];

    if (status && status !== 'all') {
        sql += ' AND products.status = ?';
        params.push(status);
    } else {
        sql += " AND products.status IN ('pending', 'selling', 'reserved')";
    }

    sql += ' ORDER BY products.created_at DESC';
    db.query(sql, params, callback);
}

// A seller's currently-selling products, shown on their public profile page.
function getSellingProductsBySeller(sellerId, callback) {
    const sql = `SELECT products.*, categories.name AS categoryName
                 FROM products
                 LEFT JOIN categories ON products.category_id = categories.id
                 WHERE products.seller_id = ? AND products.status = 'selling'
                 ORDER BY products.created_at DESC`;
    db.query(sql, [sellerId], callback);
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

// Update a listing's own details. Only meant to be used while it's still
// 'selling' - the route checks that before calling this.
function updateProduct(productId, product, callback) {
    const sql = `UPDATE products
                 SET category_id = ?, name = ?, description = ?, price = ?,
                     \`condition\` = ?, quantity = ?, image = ?, contact_info = ?
                 WHERE id = ?`;
    const params = [
        product.categoryId,
        product.name,
        product.description,
        product.price,
        product.condition,
        product.quantity,
        product.image,
        product.contactInfo,
        productId
    ];
    db.query(sql, params, callback);
}

// Permanently remove a listing (seller deleting their own post).
function deleteProduct(productId, callback) {
    const sql = 'DELETE FROM products WHERE id = ?';
    db.query(sql, [productId], callback);
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
    getSellerListings,
    getSellingProductsBySeller,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    getPendingProducts,
    approveProduct,
    rejectProduct
};
