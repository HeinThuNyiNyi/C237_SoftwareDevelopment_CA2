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
    const productSql = 'SELECT id, seller_id, status, quantity FROM products WHERE id = ?';

    db.query(productSql, [productId], (productError, productRows) => {
        if (productError) {
            return callback(productError);
        }

        if (productRows.length === 0) {
            return callback(null, { status: 'not_found' });
        }

        const product = productRows[0];

        if (Number(product.seller_id) === Number(userId)) {
            return callback(null, { status: 'own_product' });
        }

        if (product.status !== 'selling' || product.quantity < 1) {
            return callback(null, { status: 'unavailable' });
        }

        const cartSql = 'SELECT quantity FROM carts WHERE user_id = ? AND product_id = ?';

        db.query(cartSql, [userId, productId], (cartError, cartRows) => {
            if (cartError) {
                return callback(cartError);
            }

            const cartQuantity = cartRows.length > 0 ? cartRows[0].quantity : 0;

            if (cartQuantity >= product.quantity) {
                return callback(null, { status: 'max_quantity', availableQuantity: product.quantity });
            }

            if (cartRows.length > 0) {
                const updateSql = 'UPDATE carts SET quantity = quantity + 1 WHERE user_id = ? AND product_id = ?';
                db.query(updateSql, [userId, productId], (updateError) => {
                    if (updateError) {
                        return callback(updateError);
                    }
                    callback(null, { status: 'added' });
                });
            } else {
                const insertSql = 'INSERT INTO carts (user_id, product_id, quantity) VALUES (?, ?, 1)';
                db.query(insertSql, [userId, productId], (insertError) => {
                    if (insertError) {
                        return callback(insertError);
                    }
                    callback(null, { status: 'added' });
                });
            }
        });
    });
}

// Only lets the quantity go up while there is still stock available.
function increaseQuantity(userId, productId, callback) {
    const checkSql = `SELECT carts.quantity, products.quantity AS available_quantity
                      FROM carts
                      JOIN products ON carts.product_id = products.id
                      WHERE carts.user_id = ? AND carts.product_id = ?`;

    db.query(checkSql, [userId, productId], (checkError, rows) => {
        if (checkError) {
            return callback(checkError);
        }

        if (rows.length === 0 || rows[0].quantity >= rows[0].available_quantity) {
            return callback(null, { affectedRows: 0 });
        }

        const updateSql = 'UPDATE carts SET quantity = quantity + 1 WHERE user_id = ? AND product_id = ?';
        db.query(updateSql, [userId, productId], callback);
    });
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
