require('dotenv').config();

// One-off script, run manually with `node scripts/seedRatingTestData.js`.
// Creates a few test buyer accounts and gives each of them a purchase +
// rating for every existing product, so the ratings feature has real data
// to show. Safe to run more than once - purchases and ratings are skipped
// or updated rather than duplicated.
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: true }
});

const testBuyers = [
    { name: 'Rating Test Buyer 1', email: 'rating.buyer1@campuscycle.test' },
    { name: 'Rating Test Buyer 2', email: 'rating.buyer2@campuscycle.test' },
    { name: 'Rating Test Buyer 3', email: 'rating.buyer3@campuscycle.test' }
];

const comments = [
    'The item matched the description and worked well.',
    'Smooth handover, the seller was easy to reach.',
    'Good condition for the price.',
    'Exactly as pictured, happy with the purchase.',
    'Would buy from this seller again.'
];

async function seedRatingTestData() {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        for (const buyer of testBuyers) {
            await connection.execute(
                `INSERT INTO users (name, email, password, role)
                 VALUES (?, ?, 'TEST_ACCOUNT_LOGIN_NOT_CONFIGURED', 'user')
                 ON DUPLICATE KEY UPDATE name = VALUES(name)`,
                [buyer.name, buyer.email]
            );
        }

        const [buyers] = await connection.query(
            `SELECT id, name FROM users WHERE email IN (?)`,
            [testBuyers.map((buyer) => buyer.email)]
        );
        const [products] = await connection.query(
            `SELECT id, seller_id, price FROM products`
        );

        if (!products.length) {
            throw new Error('No products found. Add products before seeding ratings.');
        }

        let ratingValue = 5;
        let commentIndex = 0;

        for (const buyer of buyers) {
            for (const product of products) {
                // Each purchases row represents a completed transaction; the
                // NOT EXISTS guard makes this script safe to run more than once.
                await connection.execute(
                    `INSERT INTO purchases (product_id, buyer_id, seller_id, reservation_id, price)
                     SELECT ?, ?, ?, NULL, ?
                     WHERE NOT EXISTS (
                        SELECT 1 FROM purchases WHERE product_id = ? AND buyer_id = ?
                     )`,
                    [product.id, buyer.id, product.seller_id, product.price, product.id, buyer.id]
                );

                await connection.execute(
                    `INSERT INTO ratings (product_id, buyer_id, seller_id, rating, comment, is_anonymous)
                     VALUES (?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                        rating = VALUES(rating),
                        comment = VALUES(comment),
                        updated_at = CURRENT_TIMESTAMP`,
                    [
                        product.id,
                        buyer.id,
                        product.seller_id,
                        ratingValue,
                        comments[commentIndex % comments.length],
                        commentIndex % 4 === 0 ? 1 : 0
                    ]
                );

                ratingValue = ratingValue === 1 ? 5 : ratingValue - 1;
                commentIndex++;
            }
        }

        await connection.commit();
        console.log(`Seeded ratings for ${buyers.length} test buyers across ${products.length} products.`);
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
