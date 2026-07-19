require('dotenv').config();

const pool = require('../config/database');

// 这些账户只用于本地/课程项目测试，不应复制到正式生产数据库。
const testAccounts = [
    { name: 'Rating Test Buyer', email: 'rating.buyer1@campuscycle.test' },
    { name: 'Rating Test Buyer 2', email: 'rating.buyer2@campuscycle.test' },
    { name: 'Rating Test Buyer 3', email: 'rating.buyer3@campuscycle.test' },
    { name: 'Rating Test Buyer 4', email: 'rating.buyer4@campuscycle.test' }
];

const comments = [
    'The item matched the description and worked well during testing.',
    'Collection was easy and the seller explained the item clearly.',
    'Good value for a student budget and the condition was accurate.',
    'The product was clean, functional and ready to use.',
    'A smooth campus transaction with helpful communication.',
    'The listing photos were accurate and pickup was on time.',
    'Everything worked as expected after the purchase.',
    'Useful item, fair price and a straightforward handover.'
];

async function seedRatingTestData() {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 密码字段只是满足当前 schema；项目尚未合并登录功能，不能用它登录。
        for (const account of testAccounts) {
            await connection.execute(
                `INSERT INTO users (name, email, password, role)
                 VALUES (?, ?, ?, 'user')
                 ON DUPLICATE KEY UPDATE name = VALUES(name)`,
                [account.name, account.email, 'TEST_ACCOUNT_LOGIN_NOT_CONFIGURED']
            );
        }

        const [buyers] = await connection.query(
            `SELECT id, name, email
             FROM users
             WHERE email IN (?)
             ORDER BY FIELD(email, ?)`,
            [testAccounts.map((account) => account.email), testAccounts.map((account) => account.email)]
        );
        const [products] = await connection.query(
            `SELECT id, seller_id, name, price
             FROM products
             ORDER BY id`
        );

        if (!products.length) {
            throw new Error('No products found. Seed products before rating test data.');
        }

        const availablePairs = buyers.length * products.length;
        if (availablePairs < 30) {
            throw new Error(`Need at least 30 buyer/product pairs, but only ${availablePairs} are available.`);
        }

        // 买家按顺序与商品组合：第一个测试账户一定先购买并评价全部商品。
        const ratingPairs = [];
        for (const buyer of buyers) {
            for (const product of products) {
                if (ratingPairs.length < 30) {
                    ratingPairs.push({ buyer, product });
                }
            }
        }

        for (const [index, pair] of ratingPairs.entries()) {
            const { buyer, product } = pair;

            // purchases 中每行代表已完成交易；NOT EXISTS 使脚本可重复执行。
            await connection.execute(
                `INSERT INTO purchases
                    (product_id, buyer_id, seller_id, reservation_id, price)
                 SELECT ?, ?, ?, NULL, ?
                 WHERE NOT EXISTS (
                    SELECT 1 FROM purchases
                    WHERE product_id = ? AND buyer_id = ?
                 )`,
                [
                    product.id,
                    buyer.id,
                    product.seller_id,
                    product.price,
                    product.id,
                    buyer.id
                ]
            );

            const rating = ((index * 7 + product.id) % 5) + 1;
            const comment = comments[index % comments.length];
            const isAnonymous = index % 6 === 0 ? 1 : 0;

            await connection.execute(
                `INSERT INTO ratings
                    (product_id, buyer_id, seller_id, rating, comment, is_anonymous)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    seller_id = VALUES(seller_id),
                    rating = VALUES(rating),
                    comment = VALUES(comment),
                    is_anonymous = VALUES(is_anonymous),
                    updated_at = CURRENT_TIMESTAMP`,
                [product.id, buyer.id, product.seller_id, rating, comment, isAnonymous]
            );
        }

        await connection.commit();

        const buyerIds = buyers.map((buyer) => buyer.id);
        const [[seedCounts]] = await pool.query(
            `SELECT
                (SELECT COUNT(*) FROM purchases WHERE buyer_id IN (?)) AS purchases,
                (SELECT COUNT(*) FROM ratings WHERE buyer_id IN (?)) AS ratings`,
            [buyerIds, buyerIds]
        );
        const [[mainBuyerCoverage]] = await pool.execute(
            `SELECT
                COUNT(DISTINCT p.product_id) AS purchased_products,
                (SELECT COUNT(*) FROM products) AS total_products
             FROM purchases p
             WHERE p.buyer_id = ?`,
            [buyers[0].id]
        );

        console.log(`Created/updated ${buyers.length} test buyer accounts.`);
        console.log(`Test purchases: ${seedCounts.purchases}`);
        console.log(`Test ratings: ${seedCounts.ratings}`);
        console.log(
            `Main test buyer coverage: ${mainBuyerCoverage.purchased_products}/${mainBuyerCoverage.total_products} products.`
        );
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
        await pool.end();
    }
}

seedRatingTestData().catch((error) => {
    console.error('Unable to seed rating test data:', error.message);
    process.exitCode = 1;
});
