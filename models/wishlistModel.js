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

function addToWishlist(userId, productId, callback) {
    const sql = `INSERT IGNORE INTO wishlists (user_id, product_id)
                 SELECT ?, products.id
                 FROM products
                 WHERE products.id = ?
                   AND products.status IN ('selling', 'reserved')
                   AND products.seller_id <> ?`;

    db.query(sql, [userId, productId, userId], callback);
}

function removeFromWishlist(userId, productId, callback) {
    const sql = `DELETE FROM wishlists
                 WHERE user_id = ? AND product_id = ?`;

    db.query(sql, [userId, productId], callback);
}

module.exports = {
    getWishlistByUser,
    addToWishlist,
    removeFromWishlist
};
