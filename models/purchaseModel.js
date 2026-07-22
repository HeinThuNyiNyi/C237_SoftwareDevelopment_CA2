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

// Everything this user has bought, newest first - for their Purchase History page.
function getPurchasesByBuyer(buyerId, callback) {
    const sql = `SELECT purchases.*,
                        products.name AS productName,
                        products.image AS productImage,
                        sellers.name AS sellerName,
                        ratings.id AS ratingId
                 FROM purchases
                 JOIN products ON purchases.product_id = products.id
                 JOIN users AS sellers ON purchases.seller_id = sellers.id
                 LEFT JOIN ratings
                   ON ratings.product_id = purchases.product_id
                  AND ratings.buyer_id = purchases.buyer_id
                 WHERE purchases.buyer_id = ?
                 ORDER BY purchases.purchased_at DESC`;
    db.query(sql, [buyerId], callback);
}

// Everything this user has sold, newest first - for their Sales History page.
function getSalesBySeller(sellerId, callback) {
    const sql = `SELECT purchases.*,
                        products.name AS productName,
                        products.image AS productImage,
                        products.status AS productStatus,
                        buyers.name AS buyerName
                 FROM purchases
                 JOIN products ON purchases.product_id = products.id
                 JOIN users AS buyers ON purchases.buyer_id = buyers.id
                 WHERE purchases.seller_id = ?
                 ORDER BY purchases.purchased_at DESC`;
    db.query(sql, [sellerId], callback);
}

module.exports = {
    findCompletedPurchase,
    getPurchasesByBuyer,
    getSalesBySeller
};
