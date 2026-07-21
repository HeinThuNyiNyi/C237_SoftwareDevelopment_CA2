require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');

const app = express();

// Database connection (Azure MySQL Database Server)
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'campuscycle_db',
    ssl: process.env.DB_HOST ? { rejectUnauthorized: false } : false
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to the database:', err.message);
        return;
    }
    console.log('Connected to database successfully');

    // Auto-create tables if they don't exist
    const createTables = [
        `CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(100) NOT NULL,
            email VARCHAR(150) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS products (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            price DECIMAL(10, 2) NOT NULL,
            description TEXT,
            image_symbol VARCHAR(50) DEFAULT '📦',
            category VARCHAR(100),
            stock INT DEFAULT 10,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS wishlist (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            product_id INT NOT NULL,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
            UNIQUE KEY unique_user_product_wishlist (user_id, product_id)
        )`,
        `CREATE TABLE IF NOT EXISTS cart (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS cart_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            cart_id INT NOT NULL,
            product_id INT NOT NULL,
            quantity INT NOT NULL DEFAULT 1,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (cart_id) REFERENCES cart(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
            UNIQUE KEY unique_cart_product (cart_id, product_id)
        )`
    ];

    createTables.reduce((promise, sql) => {
        return promise.then(() => new Promise((resolve, reject) => {
            db.query(sql, (err) => {
                if (err) { console.error('Table creation error:', err.message); return reject(err); }
                resolve();
            });
        }));
    }, Promise.resolve())
    .then(() => {
        console.log('All tables ready.');
        // Inspect actual users table columns before seeding demo user
        db.query('DESCRIBE users', (err, columns) => {
            if (err) { console.error('Could not inspect users table:', err.message); return; }

            const cols = columns.map(c => c.Field);
            const fields = ['id'];
            const values = [1];

            if (cols.includes('username'))      { fields.push('username');      values.push('alex_student'); }
            if (cols.includes('name'))          { fields.push('name');          values.push('Alex Student'); }
            if (cols.includes('email'))         { fields.push('email');         values.push('alex@campus.edu.sg'); }
            if (cols.includes('password'))      { fields.push('password');      values.push('password123'); }
            if (cols.includes('password_hash')) { fields.push('password_hash'); values.push('password123'); }

            const placeholders = values.map(() => '?').join(', ');
            const updateClause = fields.filter(f => f !== 'id').map(f => `${f} = VALUES(${f})`).join(', ') || 'id = id';
            const sql = `INSERT INTO users (${fields.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}`;

            db.query(sql, values, (err) => {
                if (err) console.error('Error seeding demo user:', err.message);
                else console.log('Demo user ready. Columns:', cols.join(', '));
            });
        });

        // Log actual columns of other key tables
        ['products', 'wishlist', 'wishlists', 'cart_items'].forEach(table => {
            db.query(`DESCRIBE ${table}`, (err, columns) => {
                if (!err) console.log(`[schema] ${table}:`, columns.map(c => c.Field).join(', '));
            });
        });

        // Ensure products table has image_symbol column (may be missing in pre-existing Azure schema)
        db.query("SHOW COLUMNS FROM products LIKE 'image_symbol'", (err, result) => {
            if (!err && result.length === 0) {
                db.query("ALTER TABLE products ADD COLUMN image_symbol VARCHAR(50) DEFAULT '📦'", (err) => {
                    if (err) console.error('Could not add image_symbol to products:', err.message);
                    else console.log('✓ Added image_symbol column to products.');
                });
            }
        });

        // Ensure products table has stock column
        db.query("SHOW COLUMNS FROM products LIKE 'stock'", (err, result) => {
            if (!err && result.length === 0) {
                db.query("ALTER TABLE products ADD COLUMN stock INT DEFAULT 10", (err) => {
                    if (err) console.error('Could not add stock to products:', err.message);
                    else console.log('✓ Added stock column to products.');
                });
            }
        });

        // Ensure products table has category column (pre-existing schema uses category_id)
        db.query("SHOW COLUMNS FROM products LIKE 'category'", (err, result) => {
            if (!err && result.length === 0) {
                db.query("ALTER TABLE products ADD COLUMN category VARCHAR(100) DEFAULT 'general'", (err) => {
                    if (err) console.error('Could not add category to products:', err.message);
                    else console.log('✓ Added category column to products.');
                });
            }
        });

        // Ensure wishlist table has added_at column
        db.query("SHOW COLUMNS FROM wishlist LIKE 'added_at'", (err, result) => {
            if (!err && result.length === 0) {
                db.query("ALTER TABLE wishlist ADD COLUMN added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP", (err) => {
                    if (err) console.error('Could not add added_at to wishlist:', err.message);
                    else console.log('✓ Added added_at column to wishlist.');
                });
            }
        });
    })
    .catch(err => console.error('Failed to initialise tables:', err.message));
});

// Middleware configuration
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static('public'));

app.use(session({
    secret: process.env.SESSION_SECRET || 'campuscycle_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 } // Session duration: 1 hour
}));

app.use(flash());

// Setting up EJS view engine
app.set('view engine', 'ejs');

// Global view variables middleware (accessible in all EJS views)
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.success_msg = req.flash('success');
    res.locals.error_msg = req.flash('error');
    next();
});

// Authentication middleware to guard user-specific routes
const requireAuth = (req, res, next) => {
    // Demo fallback: automatically log in user 1 if no active user session exists
    if (!req.session.user) {
        req.session.user = { id: 1, username: 'alex_student', email: 'alex@campus.edu.sg' };
    }
    
    if (req.session && req.session.user && req.session.user.id) {
        return next();
    }
    
    req.flash('error', 'Please log in to continue.');
    res.redirect('/login');
};

// Helper function: Get or create a cart for the logged-in user
const getOrCreateCartId = (userId) => {
    return new Promise((resolve, reject) => {
        const findCartSql = 'SELECT id FROM cart WHERE user_id = ?';
        db.query(findCartSql, [userId], (err, results) => {
            if (err) return reject(err);
            
            if (results.length > 0) {
                return resolve(results[0].id);
            }
            
            const createCartSql = 'INSERT INTO cart (user_id) VALUES (?)';
            db.query(createCartSql, [userId], (err, result) => {
                if (err) return reject(err);
                resolve(result.insertId);
            });
        });
    });
};

// ==================== Public Routes ====================

// Home Page: Display active marketplace products
app.get('/', (req, res) => {
    const sql = 'SELECT * FROM products ORDER BY created_at DESC';
    db.query(sql, (err, products) => {
        if (err) {
            console.error('Error fetching products:', err.message);
            // Fallback product list if database is not yet populated
            const sampleProducts = [
                { id: 1, name: 'Dell Latitude 5420 Laptop', price: 320.00, image_symbol: '💻', category: 'electronics' },
                { id: 2, name: 'C237 Software Development Textbook', price: 45.00, image_symbol: '📚', category: 'books' },
                { id: 3, name: 'Ergonomic Desk Chair', price: 85.00, image_symbol: '🪑', category: 'furniture' },
                { id: 4, name: 'Campus Hoodie (Size M)', price: 25.00, image_symbol: '🧥', category: 'clothing' }
            ];
            return res.render('index', { products: sampleProducts });
        }
        res.render('index', { products: products.length > 0 ? products : [] });
    });
});

app.get('/admin', (req, res) => {
    res.render('admin/index');
});

// Seed demo data route (for convenience during development & presentation)
app.get('/seed', (req, res) => {
    const seedUsersSql = `
        INSERT INTO users (id, username, email, password) VALUES
        (1, 'alex_student', 'alex@campus.edu.sg', 'password123')
        ON DUPLICATE KEY UPDATE username=VALUES(username);
    `;
    const seedProductsSql = `
        INSERT INTO products (id, name, price, description, image_symbol, category, stock) VALUES
        (1, 'Dell Latitude 5420 Laptop', 320.00, 'i5, 16GB RAM, 512GB SSD. Perfect for assignments.', '💻', 'electronics', 5),
        (2, 'C237 Software Development Textbook', 45.00, 'Comprehensive guide to web development.', '📚', 'books', 10),
        (3, 'Ergonomic Desk Chair', 85.00, 'Adjustable mesh office chair.', '🪑', 'furniture', 3),
        (4, 'Campus Hoodie (Size M)', 25.00, 'Soft fleece pullover hoodie.', '🧥', 'clothing', 7)
        ON DUPLICATE KEY UPDATE name=VALUES(name);
    `;

    db.query(seedUsersSql, (err) => {
        if (err) console.error('Error seeding users:', err.message);
        db.query(seedProductsSql, (err) => {
            if (err) console.error('Error seeding products:', err.message);
            req.flash('success', 'Database seeded successfully with sample products!');
            res.redirect('/');
        });
    });
});


// ==================== Wishlist Routes ====================

// GET /wishlist: View user's wishlist
app.get('/wishlist', requireAuth, (req, res) => {
    const userId = req.session.user.id;

    // Parameterised SQL query joining wishlist and products tables
    const sql = `
        SELECT w.id AS wishlist_id, w.added_at, p.id AS product_id, p.name, p.price, p.description, p.image_symbol, p.category
        FROM wishlist w
        JOIN products p ON w.product_id = p.id
        WHERE w.user_id = ?
        ORDER BY w.added_at DESC
    `;

    db.query(sql, [userId], (err, wishlistItems) => {
        if (err) {
            console.error('Error fetching wishlist:', err.message);
            req.flash('error', 'Unable to retrieve your wishlist at this time.');
            return res.render('wishlist', { wishlistItems: [] });
        }
        res.render('wishlist', { wishlistItems });
    });
});

// POST /wishlist/add/:productId: Add product to wishlist
app.post('/wishlist/add/:productId', requireAuth, (req, res) => {
    const userId = req.session.user.id;
    const productId = req.params.productId;

    // Check if product exists first
    const checkProductSql = 'SELECT id, name FROM products WHERE id = ?';
    db.query(checkProductSql, [productId], (err, productResults) => {
        if (err || productResults.length === 0) {
            req.flash('error', 'Product not found.');
            return res.redirect('back');
        }

        const productName = productResults[0].name;

        // Duplicate Prevention using INSERT IGNORE
        const insertSql = 'INSERT IGNORE INTO wishlist (user_id, product_id) VALUES (?, ?)';
        db.query(insertSql, [userId, productId], (err, result) => {
            if (err) {
                console.error('Error adding to wishlist:', err.message);
                req.flash('error', 'Failed to add item to wishlist.');
                return res.redirect('back');
            }

            if (result.affectedRows === 0) {
                req.flash('error', `"${productName}" is already in your wishlist.`);
            } else {
                req.flash('success', `"${productName}" added to your wishlist!`);
            }
            res.redirect('back');
        });
    });
});

// POST /wishlist/remove/:productId: Remove product from wishlist
app.post('/wishlist/remove/:productId', requireAuth, (req, res) => {
    const userId = req.session.user.id;
    const productId = req.params.productId;

    // Strict user authorization check in WHERE clause
    const sql = 'DELETE FROM wishlist WHERE user_id = ? AND product_id = ?';
    db.query(sql, [userId, productId], (err, result) => {
        if (err) {
            console.error('Error removing from wishlist:', err.message);
            req.flash('error', 'Failed to remove item from wishlist.');
            return res.redirect('/wishlist');
        }

        if (result.affectedRows > 0) {
            req.flash('success', 'Item removed from your wishlist.');
        } else {
            req.flash('error', 'Item not found in your wishlist.');
        }
        res.redirect('/wishlist');
    });
});


// ==================== Shopping Cart Routes ====================

// GET /cart: View authenticated user's cart
app.get('/cart', requireAuth, async (req, res) => {
    const userId = req.session.user.id;

    try {
        const cartId = await getOrCreateCartId(userId);

        // Fetch cart items joined with product details
        const sql = `
            SELECT ci.id AS item_id, ci.product_id, ci.quantity, 
                   p.name, p.price, p.image_symbol, p.category, p.stock,
                   (ci.quantity * p.price) AS subtotal
            FROM cart_items ci
            JOIN products p ON ci.product_id = p.id
            WHERE ci.cart_id = ?
            ORDER BY ci.added_at DESC
        `;

        db.query(sql, [cartId], (err, cartItems) => {
            if (err) {
                console.error('Error fetching cart items:', err.message);
                req.flash('error', 'Unable to retrieve shopping cart.');
                return res.render('cart', { cartItems: [], totalAmount: 0 });
            }

            // Calculate total cart amount server-side
            let totalAmount = 0;
            cartItems.forEach(item => {
                totalAmount += parseFloat(item.subtotal);
            });

            res.render('cart', {
                cartItems,
                totalAmount: totalAmount.toFixed(2)
            });
        });
    } catch (err) {
        console.error('Cart retrieval error:', err.message);
        req.flash('error', 'Database error retrieving cart.');
        res.render('cart', { cartItems: [], totalAmount: '0.00' });
    }
});

// POST /cart/add/:productId: Add product to cart (or increment if exists)
app.post('/cart/add/:productId', requireAuth, async (req, res) => {
    const userId = req.session.user.id;
    const productId = req.params.productId;

    try {
        const cartId = await getOrCreateCartId(userId);

        // Check if item is already in cart
        const checkSql = 'SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ?';
        db.query(checkSql, [cartId, productId], (err, results) => {
            if (err) {
                req.flash('error', 'Database error checking cart.');
                return res.redirect('back');
            }

            if (results.length > 0) {
                // Product already exists in cart -> Increment quantity
                const newQuantity = results[0].quantity + 1;
                const updateSql = 'UPDATE cart_items SET quantity = ? WHERE id = ?';
                db.query(updateSql, [newQuantity, results[0].id], (err) => {
                    if (err) {
                        req.flash('error', 'Failed to update item quantity.');
                    } else {
                        req.flash('success', 'Increased quantity in shopping cart!');
                    }
                    res.redirect('back');
                });
            } else {
                // Product not in cart -> Insert new row
                const insertSql = 'INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, 1)';
                db.query(insertSql, [cartId, productId], (err) => {
                    if (err) {
                        req.flash('error', 'Failed to add item to shopping cart.');
                    } else {
                        req.flash('success', 'Item added to your shopping cart!');
                    }
                    res.redirect('back');
                });
            }
        });
    } catch (err) {
        console.error('Error adding to cart:', err.message);
        req.flash('error', 'Server error while adding item to cart.');
        res.redirect('back');
    }
});

// POST /cart/increase/:productId: Increase product quantity in cart
app.post('/cart/increase/:productId', requireAuth, async (req, res) => {
    const userId = req.session.user.id;
    const productId = req.params.productId;

    try {
        const cartId = await getOrCreateCartId(userId);

        const sql = `
            UPDATE cart_items 
            SET quantity = quantity + 1 
            WHERE cart_id = ? AND product_id = ?
        `;
        db.query(sql, [cartId, productId], (err, result) => {
            if (err || result.affectedRows === 0) {
                req.flash('error', 'Could not update item quantity.');
            } else {
                req.flash('success', 'Quantity increased.');
            }
            res.redirect('/cart');
        });
    } catch (err) {
        req.flash('error', 'Server error updating cart.');
        res.redirect('/cart');
    }
});

// POST /cart/decrease/:productId: Decrease product quantity in cart
app.post('/cart/decrease/:productId', requireAuth, async (req, res) => {
    const userId = req.session.user.id;
    const productId = req.params.productId;

    try {
        const cartId = await getOrCreateCartId(userId);

        // First check current quantity
        const checkSql = 'SELECT quantity FROM cart_items WHERE cart_id = ? AND product_id = ?';
        db.query(checkSql, [cartId, productId], (err, results) => {
            if (err || results.length === 0) {
                req.flash('error', 'Item not found in cart.');
                return res.redirect('/cart');
            }

            const currentQty = results[0].quantity;

            if (currentQty <= 1) {
                // Prevent zero/negative quantity -> Remove item if quantity drops to zero
                const deleteSql = 'DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?';
                db.query(deleteSql, [cartId, productId], (err) => {
                    if (err) {
                        req.flash('error', 'Failed to remove item.');
                    } else {
                        req.flash('success', 'Item removed from cart.');
                    }
                    res.redirect('/cart');
                });
            } else {
                // Otherwise decrease quantity by 1
                const updateSql = 'UPDATE cart_items SET quantity = quantity - 1 WHERE cart_id = ? AND product_id = ?';
                db.query(updateSql, [cartId, productId], (err) => {
                    if (err) {
                        req.flash('error', 'Failed to update quantity.');
                    } else {
                        req.flash('success', 'Quantity decreased.');
                    }
                    res.redirect('/cart');
                });
            }
        });
    } catch (err) {
        req.flash('error', 'Server error updating cart.');
        res.redirect('/cart');
    }
});

// POST /cart/remove/:productId: Remove product completely from cart
app.post('/cart/remove/:productId', requireAuth, async (req, res) => {
    const userId = req.session.user.id;
    const productId = req.params.productId;

    try {
        const cartId = await getOrCreateCartId(userId);

        const deleteSql = 'DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?';
        db.query(deleteSql, [cartId, productId], (err, result) => {
            if (err) {
                console.error('Error removing cart item:', err.message);
                req.flash('error', 'Failed to remove item from cart.');
            } else if (result.affectedRows > 0) {
                req.flash('success', 'Item removed from cart.');
            }
            res.redirect('/cart');
        });
    } catch (err) {
        req.flash('error', 'Server error removing item from cart.');
        res.redirect('/cart');
    }
});


// 404 handler - catches any request that doesn't match a route above
app.use((req, res) => {
    res.status(404).send('Error: Page not found.');
});

// General error handler - catches errors passed via next(err)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Error: Something went wrong on the server.');
});

// Starting the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`CampusCycle Server running on http://localhost:${PORT}`);
});
