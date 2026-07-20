const db = require('../config/db');

// Purchase records: Thiha-Aung's purchases table only ever stores completed
// transactions, so there is no status column to check here.

// Most recent completed purchase of this product by this buyer, or null.
function findCompletedPurchase(buyerId, productId, callback) {
    const sql = `SELECT id, product_id, buyer_id, seller_id, reservation_id, price, purchased_at
                 FROM purchases
                 WHERE buyer_id = ? AND product_id = ?
                 ORDER BY purchased_at DESC
                 LIMIT 1`;
    db.query(sql, [buyerId, productId], (error, rows) => {
        if (error) {
            return callback(error);
        }
        callback(null, rows[0] || null);
    });
}

module.exports = {
    findCompletedPurchase
};
