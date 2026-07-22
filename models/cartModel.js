const db = require('../config/db');

function getCartByUser(userId, callback) {
    const sql = `SELECT carts.id AS cart_id,
                        carts.product_id,
                        carts.quantity,
                        products.name,
                        products.price,
                        products.description,
                        products.image,
                        products.quantity AS available_quantity,
                        products.status,
                        categories.name AS category,
                        products.price * carts.quantity AS subtotal
                 FROM carts
                 JOIN products ON carts.product_id = products.id
                 LEFT JOIN categories ON products.category_id = categories.id
                 WHERE carts.user_id = ?
                 ORDER BY carts.created_at DESC`;

    db.query(sql, [userId], callback);
}

function addToCart(userId, productId, callback) {
    const sql = `INSERT INTO carts (user_id, product_id, quantity)
                 SELECT ?, products.id, 1
                 FROM products
                 WHERE products.id = ?
                   AND products.status = 'selling'
                   AND products.quantity > 0
                   AND products.seller_id <> ?
                 ON DUPLICATE KEY UPDATE
                    quantity = LEAST(
                        carts.quantity + 1,
                        (SELECT products.quantity
                         FROM products
                         WHERE products.id = ?)
                    )`;

    db.query(sql, [userId, productId, userId, productId], callback);
}

function increaseQuantity(userId, productId, callback) {
    const sql = `UPDATE carts
                 JOIN products ON carts.product_id = products.id
                 SET carts.quantity = carts.quantity + 1
                 WHERE carts.user_id = ?
                   AND carts.product_id = ?
                   AND carts.quantity < products.quantity
                   AND products.status = 'selling'`;

    db.query(sql, [userId, productId], callback);
}

function decreaseQuantity(userId, productId, callback) {
    const sql = `UPDATE carts
                 SET quantity = quantity - 1
                 WHERE user_id = ?
                   AND product_id = ?
                   AND quantity > 1`;

    db.query(sql, [userId, productId], callback);
}

function removeFromCart(userId, productId, callback) {
    const sql = `DELETE FROM carts
                 WHERE user_id = ? AND product_id = ?`;

    db.query(sql, [userId, productId], callback);
}

module.exports = {
    getCartByUser,
    addToCart,
    increaseQuantity,
    decreaseQuantity,
    removeFromCart
};
