const db = require('../config/db');

function getWishlistByUser(userId, callback) {
    const sql = `SELECT wishlists.id AS wishlist_id,
                        wishlists.product_id,
                        wishlists.created_at,
                        products.name,
                        products.price,
                        products.description,
                        products.image,
                        categories.name AS category
                 FROM wishlists
                 JOIN products ON wishlists.product_id = products.id
                 LEFT JOIN categories ON products.category_id = categories.id
                 WHERE wishlists.user_id = ?
                 ORDER BY wishlists.created_at DESC`;

    db.query(sql, [userId], callback);
}

function getProductIdsByUser(userId, callback) {
    const sql = `SELECT product_id
                 FROM wishlists
                 WHERE user_id = ?`;

    db.query(sql, [userId], (error, rows) => {
        if (error) {
            return callback(error);
        }

        callback(null, rows.map((row) => Number(row.product_id)));
    });
}

// Checks the product first, then inserts - only a student's own listing or an
// already-sold item gets blocked; INSERT IGNORE stops a duplicate save from
// throwing an error if they click the button twice.
function addToWishlist(userId, productId, callback) {
    const checkSql = 'SELECT id, seller_id, status FROM products WHERE id = ?';

    db.query(checkSql, [productId], (checkError, rows) => {
        if (checkError) {
            return callback(checkError);
        }

        if (rows.length === 0) {
            return callback(null, { affectedRows: 0 });
        }

        const product = rows[0];
        const isOwnProduct = Number(product.seller_id) === Number(userId);
        const isAvailable = ['selling', 'reserved'].includes(product.status);

        if (isOwnProduct || !isAvailable) {
            return callback(null, { affectedRows: 0 });
        }

        const insertSql = 'INSERT IGNORE INTO wishlists (user_id, product_id) VALUES (?, ?)';
        db.query(insertSql, [userId, productId], callback);
    });
}

function removeFromWishlist(userId, productId, callback) {
    const sql = `DELETE FROM wishlists
                 WHERE user_id = ? AND product_id = ?`;

    db.query(sql, [userId, productId], callback);
}

module.exports = {
    getWishlistByUser,
    getProductIdsByUser,
    addToWishlist,
    removeFromWishlist
};
