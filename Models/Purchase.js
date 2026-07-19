const pool = require('../config/database');

/**
 * 购买记录模型。
 * Thiha-Aung 的 purchases 表只保存已经完成的交易，因此无需再判断 status。
 */
const Purchase = {
    async findCompletedPurchase(buyerId, productId) {
        const [rows] = await pool.execute(
            `SELECT id, product_id, buyer_id, seller_id, reservation_id, price, purchased_at
             FROM purchases
             WHERE buyer_id = ? AND product_id = ?
             ORDER BY purchased_at DESC
             LIMIT 1`,
            [buyerId, productId]
        );

        return rows[0] || null;
    },

    async hasCompletedPurchase(buyerId, productId) {
        return Boolean(await this.findCompletedPurchase(buyerId, productId));
    }
};

module.exports = Purchase;
