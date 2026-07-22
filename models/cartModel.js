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
    const lookupSql = `SELECT products.id,
                              products.seller_id,
                              products.status,
                              products.quantity AS available_quantity,
                              carts.quantity AS cart_quantity
                       FROM products
                       LEFT JOIN carts
                         ON carts.product_id = products.id
                        AND carts.user_id = ?
                       WHERE products.id = ?`;

    db.query(lookupSql, [userId, productId], (lookupError, rows) => {
        if (lookupError) {
            return callback(lookupError);
        }

        if (rows.length === 0) {
            return callback(null, { status: 'not_found' });
        }

        const product = rows[0];
        const availableQuantity = Number(product.available_quantity);
        const cartQuantity = Number(product.cart_quantity || 0);

        if (Number(product.seller_id) === Number(userId)) {
            return callback(null, { status: 'own_product' });
        }

        if (product.status !== 'selling' || availableQuantity < 1) {
            return callback(null, { status: 'unavailable' });
        }

        if (cartQuantity >= availableQuantity) {
            return callback(null, {
                status: 'max_quantity',
                availableQuantity
            });
        }

        const saveSql = cartQuantity > 0
            ? `UPDATE carts
               SET quantity = quantity + 1
               WHERE user_id = ? AND product_id = ?`
            : `INSERT INTO carts (user_id, product_id, quantity)
               VALUES (?, ?, 1)`;

        db.query(saveSql, [userId, productId], (saveError) => {
            if (saveError) {
                return callback(saveError);
            }

            callback(null, {
                status: 'added',
                quantity: cartQuantity + 1,
                availableQuantity
            });
        });
    });
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
