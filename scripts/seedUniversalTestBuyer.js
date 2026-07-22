require('dotenv').config();

const mysql = require('mysql2/promise');
const { hashPassword } = require('../utils/hash');

const TEST_ACCOUNT = {
    name: 'Universal Test Buyer',
    email: 'testbuyer@myrp.edu.sg',
    password: 'Test@123',
    phone: '80000000'
};

const requiredEnvironmentVariables = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missingEnvironmentVariables = requiredEnvironmentVariables.filter((name) => !process.env[name]);

if (missingEnvironmentVariables.length) {
    throw new Error(`Missing environment variables: ${missingEnvironmentVariables.join(', ')}`);
}

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: true },
    connectionLimit: 2
});

async function seedUniversalTestBuyer() {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        await connection.execute(
            `INSERT INTO users
                (name, email, password, phone, role, is_active, is_banned)
             VALUES (?, ?, ?, ?, 'user', 1, 0)
             ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                password = VALUES(password),
                phone = VALUES(phone),
                role = 'user',
                is_active = 1,
                is_banned = 0,
                banned_until = NULL,
                ban_reason = NULL,
                banned_by = NULL`,
            [
                TEST_ACCOUNT.name,
                TEST_ACCOUNT.email,
                hashPassword(TEST_ACCOUNT.password),
                TEST_ACCOUNT.phone
            ]
        );

        const [[buyer]] = await connection.execute(
            'SELECT id FROM users WHERE email = ? LIMIT 1',
            [TEST_ACCOUNT.email]
        );

        const [products] = await connection.query(
            `SELECT id, seller_id, price
             FROM products
             ORDER BY id`
        );

        for (const product of products) {
            await connection.execute(
                `INSERT INTO purchases
                    (product_id, buyer_id, seller_id, reservation_id, price)
                 SELECT ?, ?, ?, NULL, ?
                 WHERE NOT EXISTS (
                    SELECT 1
                    FROM purchases
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
        }

        await connection.commit();

        const [[coverage]] = await pool.execute(
            `SELECT
                (SELECT COUNT(*) FROM products) AS totalProducts,
                COUNT(DISTINCT purchases.product_id) AS purchasedProducts
             FROM purchases
             WHERE purchases.buyer_id = ?`,
            [buyer.id]
        );

        console.log('Universal rating test account is ready.');
        console.log(`Email: ${TEST_ACCOUNT.email}`);
        console.log(`Password: ${TEST_ACCOUNT.password}`);
        console.log(`Purchased products: ${coverage.purchasedProducts}/${coverage.totalProducts}`);
        console.log('Run this seed again after adding products to refresh its purchase coverage.');
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
        await pool.end();
    }
}

seedUniversalTestBuyer().catch((error) => {
    console.error('Unable to create the universal test buyer:', error.message);
    process.exitCode = 1;
});
