// ============================================================
// Give every team account a completed purchase or two, so each
// teammate can log into their own account and try the "write a
// review" flow against something they actually "bought".
//
// Run it with:   node database/seedTeamPurchases.js
//
// No ratings are inserted here on purpose - that part is left for
// each teammate to do themselves through the app.
//
// Re-running is safe: a (buyer, product) pair that already has a
// purchases row is skipped instead of inserting a duplicate.
// ============================================================

const db = require('../config/db');

// buyerEmail -> product ids to "buy". Kept away from each buyer's own
// listings so nobody ends up buying something they sold themselves.
const purchasePlan = [
    { buyerEmail: 'admin1@myrp.edu.sg',    productIds: [14, 15] },
    { buyerEmail: 'admin2@myrp.edu.sg',    productIds: [16, 18] },
    { buyerEmail: 'thiha@myrp.edu.sg',     productIds: [15] },      // already has product 18
    { buyerEmail: 'kaiduo@myrp.edu.sg',    productIds: [14, 18] },
    { buyerEmail: 'eihtet@myrp.edu.sg',    productIds: [15, 16] },
    { buyerEmail: 'heinthu@myrp.edu.sg',   productIds: [14, 18] },
    { buyerEmail: 'denna@myrp.edu.sg',     productIds: [15, 16] },
    { buyerEmail: 'chengchao@myrp.edu.sg', productIds: [14, 18] }
];

function getUserByEmail(email, callback) {
    db.query('SELECT id, name FROM users WHERE email = ?', [email], (error, rows) => {
        if (error) return callback(error);
        callback(null, rows[0] || null);
    });
}

function getProductById(id, callback) {
    db.query('SELECT id, seller_id, name, price FROM products WHERE id = ?', [id], (error, rows) => {
        if (error) return callback(error);
        callback(null, rows[0] || null);
    });
}

function insertPurchaseIfMissing(buyer, product, callback) {
    const sql = `
        INSERT INTO purchases (product_id, buyer_id, seller_id, reservation_id, price)
        SELECT ?, ?, ?, NULL, ?
        WHERE NOT EXISTS (
            SELECT 1 FROM purchases WHERE product_id = ? AND buyer_id = ?
        )
    `;
    db.query(sql, [product.id, buyer.id, product.seller_id, product.price, product.id, buyer.id], (error, result) => {
        if (error) return callback(error);
        callback(null, result.affectedRows > 0);
    });
}

function processTask(index, callback) {
    if (index >= tasks.length) {
        return callback(null);
    }

    const { buyerEmail, productId } = tasks[index];

    getUserByEmail(buyerEmail, (userError, buyer) => {
        if (userError) return callback(userError);
        if (!buyer) {
            console.log(`  skip: no account found for ${buyerEmail}`);
            return processTask(index + 1, callback);
        }

        getProductById(productId, (productError, product) => {
            if (productError) return callback(productError);
            if (!product) {
                console.log(`  skip: no product #${productId} found`);
                return processTask(index + 1, callback);
            }
            if (product.seller_id === buyer.id) {
                console.log(`  skip: ${buyerEmail} is the seller of product #${productId}`);
                return processTask(index + 1, callback);
            }

            insertPurchaseIfMissing(buyer, product, (insertError, inserted) => {
                if (insertError) return callback(insertError);
                console.log(
                    `  ${inserted ? 'added' : 'already had'}: ${buyer.name.padEnd(20)} -> "${product.name}" ($${product.price})`
                );
                processTask(index + 1, callback);
            });
        });
    });
}

// Flatten the plan into one (buyerEmail, productId) task per purchase.
const tasks = purchasePlan.flatMap((entry) =>
    entry.productIds.map((productId) => ({ buyerEmail: entry.buyerEmail, productId }))
);

console.log('Seeding team purchases...\n');
processTask(0, (error) => {
    if (error) {
        console.error('Error seeding purchases:', error.message);
        return db.end();
    }
    console.log('\nDone.');
    db.end();
});
