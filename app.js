require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

// ==================== Database connection ====================
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false }
});
db.connect((error) => {
    if (error) {
        console.error('Database connection error:', error.message);
        return;
    }
    console.log('Connected to MySQL');
});

// ==================== Express and uploads ====================
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(flash());
const uploadFolder = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadFolder)) {
    fs.mkdirSync(uploadFolder, { recursive: true });
}
const storage = multer.diskStorage({
    destination: (req, file, callback) => {
        callback(null, uploadFolder);
    },
    filename: (req, file, callback) => {
        const safeName = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        callback(null, safeName);
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        if (file.mimetype.startsWith('image/')) {
            callback(null, true);
        } else {
            callback(new Error('Only image uploads are allowed.'));
        }
    }
});

// ==================== Shared helpers ====================
function isLoggedIn(req, res, next) {
    if (req.session.user) {
        return next();
    }
    req.flash('error', 'Please log in to continue.');
    res.redirect('/login');
}
function isAdmin(req, res, next) {
    if (!req.session.user) {
        req.flash('error', 'Please log in as an administrator.');
        return res.redirect('/login');
    }
    if (req.session.user.role !== 'admin') {
        req.flash('error', 'You do not have permission to open that page.');
        return res.redirect('/');
    }
    next();
}
function isGuest(req, res, next) {
    if (!req.session.user) {
        return next();
    }
    res.redirect('/');
}
function handleDatabaseError(res, label, error) {
    console.error(label + ':', error.message);
    res.status(500).send('A database error occurred.');
}
function deleteUploadedFile(filename) {
    if (!filename) return;
    const fullPath = path.join(uploadFolder, path.basename(filename));
    if (fs.existsSync(fullPath)) {
        fs.unlink(fullPath, () => {});
    }
}
function refreshSessionUser(req, callback) {
    db.query(
        'SELECT id, name, email, phone, role, is_banned FROM users WHERE id = ?',
        [req.session.user.id],
        (error, results) => {
            if (!error && results.length > 0) {
                req.session.user = results[0];
            }
            callback(error);
        }
    );
}
function createReservation(buyerId, productId, requestedQuantity, cartId, callback) {
    const quantity = Number(requestedQuantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
        return callback(new Error('Please enter a valid quantity.'));
    }
    const productSql = `SELECT id, seller_id, price, quantity, status
                        FROM products WHERE id = ?`;
    db.query(productSql, [productId], (productError, products) => {
        if (productError) return callback(productError);
        if (products.length === 0) return callback(new Error('Product not found.'));
        const product = products[0];
        if (product.seller_id === buyerId) {
            return callback(new Error('You cannot reserve your own product.'));
        }
        if (product.status !== 'approved' || product.quantity < quantity) {
            return callback(new Error('The requested quantity is no longer available.'));
        }
        const stockSql = `UPDATE products
                          SET quantity = quantity - ?,
                              status = IF(quantity - ? = 0, 'sold_out', 'approved')
                          WHERE id = ? AND status = 'approved' AND quantity >= ?`;
        db.query(stockSql, [quantity, quantity, productId, quantity], (stockError, stockResult) => {
            if (stockError) return callback(stockError);
            if (stockResult.affectedRows === 0) {
                return callback(new Error('The requested quantity is no longer available.'));
            }
            const totalPrice = Number(product.price) * quantity;
            const reservationSql = `INSERT INTO reservations
                (product_id, buyer_id, seller_id, quantity, unit_price, total_price)
                VALUES (?, ?, ?, ?, ?, ?)`;
            const values = [
                product.id,
                buyerId,
                product.seller_id,
                quantity,
                product.price,
                totalPrice
            ];
            db.query(reservationSql, values, (reservationError, result) => {
                if (reservationError) {
                    const restoreSql = `UPDATE products
                                        SET quantity = quantity + ?, status = 'approved'
                                        WHERE id = ?`;
                    return db.query(restoreSql, [quantity, productId], () => {
                        callback(reservationError);
                    });
                }
                if (!cartId) return callback(null, result.insertId);
                db.query(
                    'DELETE FROM carts WHERE id = ? AND user_id = ?',
                    [cartId, buyerId],
                    () => callback(null, result.insertId)
                );
            });
        });
    });
}
function cancelAndRestoreReservation(reservationId, userId, newStatus, callback) {
    const selectSql = `SELECT id, product_id, buyer_id, seller_id, quantity, status, stock_restored
                       FROM reservations WHERE id = ?`;
    db.query(selectSql, [reservationId], (selectError, results) => {
        if (selectError) return callback(selectError);
        if (results.length === 0) return callback(new Error('Reservation not found.'));
        const reservation = results[0];
        const isBuyerCancel = newStatus === 'cancelled' && reservation.buyer_id === userId;
        const isSellerReject = newStatus === 'rejected' && reservation.seller_id === userId;
        if (!isBuyerCancel && !isSellerReject) {
            return callback(new Error('You cannot change this reservation.'));
        }
        if (!['requested', 'proposed', 'confirmed'].includes(reservation.status)) {
            return callback(new Error('This reservation can no longer be cancelled or rejected.'));
        }
        if (reservation.stock_restored) {
            return callback(new Error('Product quantity was already restored.'));
        }
        const updateSql = `UPDATE reservations
                           SET status = ?, stock_restored = 1
                           WHERE id = ? AND stock_restored = 0`;
        db.query(updateSql, [newStatus, reservationId], (updateError, updateResult) => {
            if (updateError) return callback(updateError);
            if (updateResult.affectedRows === 0) {
                return callback(new Error('Reservation was already updated.'));
            }
            const restoreSql = `UPDATE products
                                SET quantity = quantity + ?, status = 'approved'
                                WHERE id = ?`;
            db.query(restoreSql, [reservation.quantity, reservation.product_id], callback);
        });
    });
}
app.use((req, res, next) => {
    res.locals.currentUser = req.session.user || null;
    res.locals.successMessages = req.flash('success');
    res.locals.errorMessages = req.flash('error');
    next();
});

// ==================== Products and browsing - Thiha Aung ====================
app.get('/', (req, res) => {
    const search = (req.query.search || '').trim();
    const category = (req.query.category || '').trim();
    const sort = req.query.sort || 'newest';
    let sql = `SELECT p.*, u.name AS seller_name,
                      COALESCE(r.average_rating, 0) AS average_rating,
                      COALESCE(r.review_count, 0) AS review_count
               FROM products p
               JOIN users u ON u.id = p.seller_id
               LEFT JOIN (
                   SELECT product_id, AVG(rating) AS average_rating, COUNT(*) AS review_count
                   FROM ratings GROUP BY product_id
               ) r ON r.product_id = p.id
               WHERE p.status = 'approved' AND p.quantity > 0`;
    const values = [];
    if (search) {
        sql += ' AND (p.name LIKE ? OR p.description LIKE ?)';
        values.push('%' + search + '%', '%' + search + '%');
    }
    if (category) {
        sql += ' AND p.category = ?';
        values.push(category);
    }
    if (sort === 'price_low') sql += ' ORDER BY p.price ASC';
    else if (sort === 'price_high') sql += ' ORDER BY p.price DESC';
    else if (sort === 'rating') sql += ' ORDER BY average_rating DESC, review_count DESC';
    else sql += ' ORDER BY p.created_at DESC';
    db.query(sql, values, (productError, products) => {
        if (productError) return handleDatabaseError(res, 'Browse products', productError);
        db.query(
            `SELECT DISTINCT category FROM products
             WHERE status = 'approved' ORDER BY category`,
            (categoryError, categories) => {
                if (categoryError) return handleDatabaseError(res, 'Browse categories', categoryError);
                res.render('index', { products, categories, search, category, sort });
            }
        );
    });
});
app.get('/products/:id(\\d+)', (req, res) => {
    const sql = `SELECT p.*, u.name AS seller_name, u.phone AS seller_phone,
                        COALESCE(AVG(ra.rating), 0) AS average_rating,
                        COUNT(ra.id) AS review_count
                 FROM products p
                 JOIN users u ON u.id = p.seller_id
                 LEFT JOIN ratings ra ON ra.product_id = p.id
                 WHERE p.id = ?
                 GROUP BY p.id, u.name, u.phone`;
    db.query(sql, [req.params.id], (error, products) => {
        if (error) return handleDatabaseError(res, 'Product details', error);
        if (products.length === 0) return res.status(404).send('Product not found.');
        const product = products[0];
        const canViewHiddenProduct = req.session.user &&
            (req.session.user.role === 'admin' || req.session.user.id === product.seller_id);
        if (product.status !== 'approved' && !canViewHiddenProduct) {
            return res.status(404).send('Product not found.');
        }
        const reviewSql = `SELECT ra.*, u.name AS buyer_name
                           FROM ratings ra JOIN users u ON u.id = ra.buyer_id
                           WHERE ra.product_id = ? ORDER BY ra.created_at DESC`;
        db.query(reviewSql, [req.params.id], (reviewError, reviews) => {
            if (reviewError) return handleDatabaseError(res, 'Product reviews', reviewError);
            res.render('product/details', { product, reviews });
        });
    });
});
app.get('/my-products', isLoggedIn, (req, res) => {
    db.query(
        'SELECT * FROM products WHERE seller_id = ? ORDER BY created_at DESC',
        [req.session.user.id],
        (error, products) => {
            if (error) return handleDatabaseError(res, 'My products', error);
            res.render('product/my-products', { products });
        }
    );
});
app.get('/products/new', isLoggedIn, (req, res) => {
    res.render('product/form', { product: null, formAction: '/products/new' });
});
app.post('/products/new', isLoggedIn, upload.single('image'), (req, res) => {
    const { name, description, category, itemCondition, price, quantity } = req.body;
    if (!name || !description || !category || !itemCondition || Number(price) <= 0 || Number(quantity) < 1) {
        deleteUploadedFile(req.file && req.file.filename);
        req.flash('error', 'Please complete every product field correctly.');
        return res.redirect('/products/new');
    }
    const sql = `INSERT INTO products
        (seller_id, name, description, category, item_condition, price, quantity, image)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    const values = [
        req.session.user.id,
        name.trim(),
        description.trim(),
        category.trim(),
        itemCondition,
        Number(price),
        Number(quantity),
        req.file ? req.file.filename : null
    ];
    db.query(sql, values, (error) => {
        if (error) {
            deleteUploadedFile(req.file && req.file.filename);
            return handleDatabaseError(res, 'Create product', error);
        }
        req.flash('success', 'Product submitted for administrator approval.');
        res.redirect('/my-products');
    });
});
app.get('/products/:id/edit', isLoggedIn, (req, res) => {
    db.query(
        'SELECT * FROM products WHERE id = ? AND seller_id = ?',
        [req.params.id, req.session.user.id],
        (error, products) => {
            if (error) return handleDatabaseError(res, 'Edit product', error);
            if (products.length === 0) return res.status(404).send('Product not found.');
            res.render('product/form', {
                product: products[0],
                formAction: '/products/' + req.params.id + '/edit'
            });
        }
    );
});
app.post('/products/:id/edit', isLoggedIn, upload.single('image'), (req, res) => {
    const { name, description, category, itemCondition, price, quantity, currentImage } = req.body;
    if (!name || !description || !category || !itemCondition || Number(price) <= 0 || Number(quantity) < 1) {
        deleteUploadedFile(req.file && req.file.filename);
        req.flash('error', 'Please complete every product field correctly.');
        return res.redirect('/products/' + req.params.id + '/edit');
    }
    const image = req.file ? req.file.filename : (currentImage || null);
    const sql = `UPDATE products
                 SET name = ?, description = ?, category = ?, item_condition = ?,
                     price = ?, quantity = ?, image = ?, status = 'pending',
                     rejection_reason = NULL
                 WHERE id = ? AND seller_id = ?`;
    const values = [
        name.trim(),
        description.trim(),
        category.trim(),
        itemCondition,
        Number(price),
        Number(quantity),
        image,
        req.params.id,
        req.session.user.id
    ];
    db.query(sql, values, (error, result) => {
        if (error) {
            deleteUploadedFile(req.file && req.file.filename);
            return handleDatabaseError(res, 'Update product', error);
        }
        if (result.affectedRows === 0) {
            deleteUploadedFile(req.file && req.file.filename);
            return res.status(404).send('Product not found.');
        }
        if (req.file && currentImage) deleteUploadedFile(currentImage);
        req.flash('success', 'Product updated and returned for approval.');
        res.redirect('/my-products');
    });
});
app.post('/products/:id/delete', isLoggedIn, (req, res) => {
    db.query(
        'SELECT image FROM products WHERE id = ? AND seller_id = ?',
        [req.params.id, req.session.user.id],
        (selectError, products) => {
            if (selectError) return handleDatabaseError(res, 'Delete product', selectError);
            if (products.length === 0) return res.status(404).send('Product not found.');
            db.query(
                'DELETE FROM products WHERE id = ? AND seller_id = ?',
                [req.params.id, req.session.user.id],
                (deleteError) => {
                    if (deleteError) {
                        req.flash('error', 'Products with reservation history cannot be deleted.');
                        return res.redirect('/my-products');
                    }
                    deleteUploadedFile(products[0].image);
                    req.flash('success', 'Product deleted.');
                    res.redirect('/my-products');
                }
            );
        }
    );
});

// ==================== Authentication and profiles - Hein Thu Nyi Nyi ====================
app.get('/register', isGuest, (req, res) => {
    res.render('auth/register');
});
app.post('/register', isGuest, (req, res) => {
    const { name, email, password, phone } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!name || !cleanEmail.endsWith('@myrp.edu.sg') || !password || password.length < 6) {
        req.flash('error', 'Use your RP email and a password of at least six characters.');
        return res.redirect('/register');
    }
    const sql = `INSERT INTO users (name, email, password, phone, role)
                 VALUES (?, ?, SHA1(?), ?, 'user')`;
    db.query(sql, [name.trim(), cleanEmail, password, (phone || '').trim()], (error) => {
        if (error) {
            req.flash('error', error.code === 'ER_DUP_ENTRY' ? 'That email is already registered.' : 'Registration failed.');
            return res.redirect('/register');
        }
        req.flash('success', 'Registration successful. You may now log in.');
        res.redirect('/login');
    });
});
app.get('/login', isGuest, (req, res) => {
    res.render('auth/login');
});
app.post('/login', isGuest, (req, res) => {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    const sql = `SELECT id, name, email, phone, role, is_banned, ban_reason
                 FROM users WHERE email = ? AND password = SHA1(?)`;
    db.query(sql, [email, password], (error, users) => {
        if (error) return handleDatabaseError(res, 'Login', error);
        if (users.length === 0) {
            req.flash('error', 'Incorrect email or password.');
            return res.redirect('/login');
        }
        if (users[0].is_banned) {
            req.flash('error', 'This account is banned: ' + (users[0].ban_reason || 'Contact an administrator.'));
            return res.redirect('/login');
        }
        req.session.user = users[0];
        req.flash('success', 'Welcome back, ' + users[0].name + '.');
        res.redirect(users[0].role === 'admin' ? '/admin' : '/');
    });
});
app.post('/logout', isLoggedIn, (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});
app.get('/profile', isLoggedIn, (req, res) => {
    db.query(
        'SELECT id, name, email, phone, role, created_at FROM users WHERE id = ?',
        [req.session.user.id],
        (error, users) => {
            if (error) return handleDatabaseError(res, 'Profile', error);
            res.render('profile', { profile: users[0] });
        }
    );
});
app.post('/profile/update', isLoggedIn, (req, res) => {
    const { name, phone } = req.body;
    if (!name) {
        req.flash('error', 'Name is required.');
        return res.redirect('/profile');
    }
    db.query(
        'UPDATE users SET name = ?, phone = ? WHERE id = ?',
        [name.trim(), (phone || '').trim(), req.session.user.id],
        (error) => {
            if (error) return handleDatabaseError(res, 'Update profile', error);
            refreshSessionUser(req, () => {
                req.flash('success', 'Profile updated.');
                res.redirect('/profile');
            });
        }
    );
});
app.post('/profile/password', isLoggedIn, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
        req.flash('error', 'New password must have at least six characters.');
        return res.redirect('/profile');
    }
    const sql = `UPDATE users SET password = SHA1(?)
                 WHERE id = ? AND password = SHA1(?)`;
    db.query(sql, [newPassword, req.session.user.id, currentPassword], (error, result) => {
        if (error) return handleDatabaseError(res, 'Change password', error);
        req.flash(result.affectedRows ? 'success' : 'error', result.affectedRows ? 'Password changed.' : 'Current password is incorrect.');
        res.redirect('/profile');
    });
});
app.post('/profile/delete', isLoggedIn, (req, res) => {
    db.query(
        'DELETE FROM users WHERE id = ? AND role = ?',
        [req.session.user.id, 'user'],
        (error, result) => {
            if (error) {
                req.flash('error', 'Your account cannot be deleted while reservation history depends on it.');
                return res.redirect('/profile');
            }
            if (!result.affectedRows) return res.status(403).send('Administrator accounts cannot be deleted here.');
            req.session.destroy(() => res.redirect('/'));
        }
    );
});
app.get('/users/:id', (req, res) => {
    const userSql = `SELECT u.id, u.name, u.role, u.created_at,
                            COALESCE(AVG(ra.rating), 0) AS average_rating,
                            COUNT(ra.id) AS review_count
                     FROM users u
                     LEFT JOIN ratings ra ON ra.seller_id = u.id
                     WHERE u.id = ? AND u.is_banned = 0
                     GROUP BY u.id, u.name, u.role, u.created_at`;
    db.query(userSql, [req.params.id], (userError, users) => {
        if (userError) return handleDatabaseError(res, 'Public profile', userError);
        if (users.length === 0) return res.status(404).send('User not found.');
        db.query(
            `SELECT * FROM products
             WHERE seller_id = ? AND status = 'approved' ORDER BY created_at DESC`,
            [req.params.id],
            (productError, products) => {
                if (productError) return handleDatabaseError(res, 'Public products', productError);
                res.render('public-profile', { profileUser: users[0], products });
            }
        );
    });
});

// ==================== Wishlist and cart - Denna Joy ====================
app.get('/wishlist', isLoggedIn, (req, res) => {
    const sql = `SELECT w.id AS wishlist_id, p.*, u.name AS seller_name
                 FROM wishlists w
                 JOIN products p ON p.id = w.product_id
                 JOIN users u ON u.id = p.seller_id
                 WHERE w.user_id = ? ORDER BY w.created_at DESC`;
    db.query(sql, [req.session.user.id], (error, items) => {
        if (error) return handleDatabaseError(res, 'Wishlist', error);
        res.render('wishlist', { items });
    });
});
app.post('/wishlist/add/:productId', isLoggedIn, (req, res) => {
    const sql = `INSERT IGNORE INTO wishlists (user_id, product_id)
                 SELECT ?, id FROM products
                 WHERE id = ? AND seller_id <> ? AND status = 'approved'`;
    db.query(sql, [req.session.user.id, req.params.productId, req.session.user.id], (error, result) => {
        if (error) return handleDatabaseError(res, 'Add wishlist item', error);
        req.flash(result.affectedRows ? 'success' : 'error', result.affectedRows ? 'Added to wishlist.' : 'Unable to add this product.');
        res.redirect(req.get('referer') || '/');
    });
});
app.post('/wishlist/delete/:id', isLoggedIn, (req, res) => {
    db.query(
        'DELETE FROM wishlists WHERE id = ? AND user_id = ?',
        [req.params.id, req.session.user.id],
        (error) => {
            if (error) return handleDatabaseError(res, 'Delete wishlist item', error);
            req.flash('success', 'Wishlist item removed.');
            res.redirect('/wishlist');
        }
    );
});
app.get('/cart', isLoggedIn, (req, res) => {
    const sql = `SELECT c.id AS cart_id, c.quantity AS cart_quantity,
                        p.id AS product_id, p.name, p.price, p.quantity AS available_quantity,
                        p.image, p.status, u.name AS seller_name
                 FROM carts c
                 JOIN products p ON p.id = c.product_id
                 JOIN users u ON u.id = p.seller_id
                 WHERE c.user_id = ? ORDER BY c.created_at DESC`;
    db.query(sql, [req.session.user.id], (error, items) => {
        if (error) return handleDatabaseError(res, 'Cart', error);
        res.render('cart', { items });
    });
});
app.post('/cart/add/:productId', isLoggedIn, (req, res) => {
    const quantity = Number(req.body.quantity || 1);
    if (!Number.isInteger(quantity) || quantity < 1) {
        req.flash('error', 'Enter a valid whole-number quantity.');
        return res.redirect(req.get('referer') || '/');
    }
    const selectSql = `SELECT p.id, p.seller_id, p.quantity, p.status,
                              COALESCE(c.quantity, 0) AS cart_quantity
                       FROM products p
                       LEFT JOIN carts c ON c.product_id = p.id AND c.user_id = ?
                       WHERE p.id = ?`;
    db.query(selectSql, [req.session.user.id, req.params.productId], (selectError, products) => {
        if (selectError) return handleDatabaseError(res, 'Add cart item', selectError);
        if (products.length === 0 || products[0].seller_id === req.session.user.id ||
            products[0].status !== 'approved' ||
            quantity + products[0].cart_quantity > products[0].quantity) {
            req.flash('error', 'You cannot add more than the available product quantity.');
            return res.redirect(req.get('referer') || '/');
        }
        const sql = `INSERT INTO carts (user_id, product_id, quantity)
                      VALUES (?, ?, ?)
                      ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`;
        db.query(sql, [req.session.user.id, req.params.productId, quantity], (error) => {
            if (error) return handleDatabaseError(res, 'Add cart item', error);
            req.flash('success', 'Cart updated.');
            res.redirect('/cart');
        });
    });
});
app.post('/cart/update/:id', isLoggedIn, (req, res) => {
    const quantity = Number(req.body.quantity);
    const selectSql = `SELECT c.id, p.quantity AS available_quantity
                       FROM carts c JOIN products p ON p.id = c.product_id
                       WHERE c.id = ? AND c.user_id = ?`;
    db.query(selectSql, [req.params.id, req.session.user.id], (selectError, items) => {
        if (selectError) return handleDatabaseError(res, 'Update cart', selectError);
        if (items.length === 0 || !Number.isInteger(quantity) || quantity < 1 ||
            quantity > items[0].available_quantity) {
            req.flash('error', 'Enter a quantity that is currently available.');
            return res.redirect('/cart');
        }
        db.query(
            'UPDATE carts SET quantity = ? WHERE id = ? AND user_id = ?',
            [quantity, req.params.id, req.session.user.id],
            (error) => {
                if (error) return handleDatabaseError(res, 'Update cart', error);
                req.flash('success', 'Cart quantity updated.');
                res.redirect('/cart');
            }
        );
    });
});
app.post('/cart/delete/:id', isLoggedIn, (req, res) => {
    db.query(
        'DELETE FROM carts WHERE id = ? AND user_id = ?',
        [req.params.id, req.session.user.id],
        (error) => {
            if (error) return handleDatabaseError(res, 'Delete cart item', error);
            req.flash('success', 'Cart item removed.');
            res.redirect('/cart');
        }
    );
});
app.post('/cart/reserve-all', isLoggedIn, (req, res) => {
    const sql = `SELECT c.id, c.product_id, c.quantity, p.name
                 FROM carts c
                 JOIN products p ON p.id = c.product_id
                 WHERE c.user_id = ? ORDER BY c.created_at`;
    db.query(sql, [req.session.user.id], (error, items) => {
        if (error) return handleDatabaseError(res, 'Reserve all cart items', error);
        if (items.length === 0) {
            req.flash('error', 'Your cart is empty.');
            return res.redirect('/cart');
        }
        let successfulCount = 0;
        const failedProducts = [];
        function reserveNext(index) {
            if (index >= items.length) {
                if (successfulCount > 0) {
                    req.flash('success', successfulCount + ' cart item(s) reserved successfully.');
                }
                if (failedProducts.length > 0) {
                    req.flash('error', 'Could not reserve: ' + failedProducts.join(', ') + '. Check the available quantities.');
                    return res.redirect('/cart');
                }
                return res.redirect('/reservations');
            }
            const item = items[index];
            createReservation(
                req.session.user.id,
                item.product_id,
                item.quantity,
                item.id,
                (createError) => {
                    if (createError) {
                        failedProducts.push(item.name);
                    } else {
                        successfulCount++;
                    }
                    reserveNext(index + 1);
                }
            );
        }
        reserveNext(0);
    });
});
app.post('/cart/reserve/:id', isLoggedIn, (req, res) => {
    db.query(
        'SELECT id, product_id, quantity FROM carts WHERE id = ? AND user_id = ?',
        [req.params.id, req.session.user.id],
        (error, items) => {
            if (error) return handleDatabaseError(res, 'Reserve cart item', error);
            if (items.length === 0) return res.status(404).send('Cart item not found.');
            const item = items[0];
            createReservation(req.session.user.id, item.product_id, item.quantity, item.id, (createError, reservationId) => {
                if (createError) {
                    req.flash('error', createError.message);
                    return res.redirect('/cart');
                }
                req.flash('success', 'Reservation requested.');
                res.redirect('/reservations/' + reservationId);
            });
        }
    );
});

// ==================== Reservations and purchase history - Zhen Cheng Chao ====================
app.post('/reservations/create/:productId', isLoggedIn, (req, res) => {
    createReservation(req.session.user.id, req.params.productId, req.body.quantity || 1, null, (error, reservationId) => {
        if (error) {
            req.flash('error', error.message);
            return res.redirect('/products/' + req.params.productId);
        }
        req.flash('success', 'Reservation requested.');
        res.redirect('/reservations/' + reservationId);
    });
});
app.get('/reservations', isLoggedIn, (req, res) => {
    const sql = `SELECT r.*, p.name AS product_name, p.image,
                        buyer.name AS buyer_name, seller.name AS seller_name,
                        ra.id AS rating_id
                 FROM reservations r
                 JOIN products p ON p.id = r.product_id
                 JOIN users buyer ON buyer.id = r.buyer_id
                 JOIN users seller ON seller.id = r.seller_id
                 LEFT JOIN ratings ra ON ra.reservation_id = r.id
                 WHERE r.buyer_id = ? OR r.seller_id = ?
                 ORDER BY r.created_at DESC`;
    db.query(sql, [req.session.user.id, req.session.user.id], (error, reservations) => {
        if (error) return handleDatabaseError(res, 'Reservations', error);
        res.render('reservation/index', { reservations });
    });
});
app.get('/reservations/:id', isLoggedIn, (req, res) => {
    const sql = `SELECT r.*, p.name AS product_name, p.image,
                        buyer.name AS buyer_name, seller.name AS seller_name
                 FROM reservations r
                 JOIN products p ON p.id = r.product_id
                 JOIN users buyer ON buyer.id = r.buyer_id
                 JOIN users seller ON seller.id = r.seller_id
                 WHERE r.id = ? AND (r.buyer_id = ? OR r.seller_id = ?)`;
    db.query(sql, [req.params.id, req.session.user.id, req.session.user.id], (error, reservations) => {
        if (error) return handleDatabaseError(res, 'Reservation details', error);
        if (reservations.length === 0) return res.status(404).send('Reservation not found.');
        res.render('reservation/details', { reservation: reservations[0] });
    });
});
app.get('/reservations/:id/edit', isLoggedIn, (req, res) => {
    db.query(
        `SELECT r.*, p.name AS product_name FROM reservations r
         JOIN products p ON p.id = r.product_id
         WHERE r.id = ? AND r.seller_id = ? AND r.status IN ('requested', 'proposed')`,
        [req.params.id, req.session.user.id],
        (error, reservations) => {
            if (error) return handleDatabaseError(res, 'Edit reservation', error);
            if (reservations.length === 0) return res.status(404).send('Reservation cannot be edited.');
            res.render('reservation/edit', { reservation: reservations[0] });
        }
    );
});
app.post('/reservations/:id/edit', isLoggedIn, (req, res) => {
    const { appointmentDate, appointmentTime, meetingLocation } = req.body;
    if (!appointmentDate || !appointmentTime || !meetingLocation) {
        req.flash('error', 'Date, time and location are required.');
        return res.redirect('/reservations/' + req.params.id + '/edit');
    }
    const sql = `UPDATE reservations
                 SET appointment_date = ?, appointment_time = ?,
                     meeting_location = ?, status = 'proposed'
                 WHERE id = ? AND seller_id = ? AND status IN ('requested', 'proposed')`;
    db.query(sql, [appointmentDate, appointmentTime, meetingLocation.trim(), req.params.id, req.session.user.id], (error, result) => {
        if (error) return handleDatabaseError(res, 'Propose meetup', error);
        if (!result.affectedRows) return res.status(403).send('Reservation cannot be updated.');
        req.flash('success', 'Meetup details proposed to the buyer.');
        res.redirect('/reservations/' + req.params.id);
    });
});
app.post('/reservations/:id/confirm', isLoggedIn, (req, res) => {
    const sql = `UPDATE reservations SET status = 'confirmed'
                 WHERE id = ? AND buyer_id = ? AND status = 'proposed'`;
    db.query(sql, [req.params.id, req.session.user.id], (error, result) => {
        if (error) return handleDatabaseError(res, 'Confirm reservation', error);
        req.flash(result.affectedRows ? 'success' : 'error', result.affectedRows ? 'Reservation confirmed.' : 'Reservation cannot be confirmed.');
        res.redirect('/reservations/' + req.params.id);
    });
});
app.post('/reservations/:id/cancel', isLoggedIn, (req, res) => {
    cancelAndRestoreReservation(req.params.id, req.session.user.id, 'cancelled', (error) => {
        req.flash(error ? 'error' : 'success', error ? error.message : 'Reservation cancelled and stock restored.');
        res.redirect('/reservations');
    });
});
app.post('/reservations/:id/reject', isLoggedIn, (req, res) => {
    cancelAndRestoreReservation(req.params.id, req.session.user.id, 'rejected', (error) => {
        req.flash(error ? 'error' : 'success', error ? error.message : 'Reservation rejected and stock restored.');
        res.redirect('/reservations');
    });
});
app.post('/reservations/:id/complete', isLoggedIn, (req, res) => {
    const sql = `UPDATE reservations SET status = 'completed', completed_at = CURRENT_TIMESTAMP
                 WHERE id = ? AND seller_id = ? AND status = 'confirmed'`;
    db.query(sql, [req.params.id, req.session.user.id], (error, result) => {
        if (error) return handleDatabaseError(res, 'Complete reservation', error);
        req.flash(result.affectedRows ? 'success' : 'error', result.affectedRows ? 'Exchange completed and saved in history.' : 'Reservation cannot be completed.');
        res.redirect('/reservations/' + req.params.id);
    });
});
app.post('/reservations/:id/delete', isLoggedIn, (req, res) => {
    const sql = `DELETE FROM reservations
                 WHERE id = ? AND (buyer_id = ? OR seller_id = ?)
                   AND status IN ('cancelled', 'rejected')`;
    db.query(sql, [req.params.id, req.session.user.id, req.session.user.id], (error, result) => {
        if (error) return handleDatabaseError(res, 'Delete reservation', error);
        req.flash(result.affectedRows ? 'success' : 'error', result.affectedRows ? 'Reservation record deleted.' : 'Only cancelled or rejected reservations can be deleted.');
        res.redirect('/reservations');
    });
});
app.get('/history', isLoggedIn, (req, res) => {
    const sql = `SELECT r.*, p.name AS product_name,
                        buyer.name AS buyer_name, seller.name AS seller_name,
                        ra.id AS rating_id, ra.rating AS rating_value,
                        ra.comment AS rating_comment, ra.image AS rating_image
                 FROM reservations r
                 JOIN products p ON p.id = r.product_id
                 JOIN users buyer ON buyer.id = r.buyer_id
                 JOIN users seller ON seller.id = r.seller_id
                 LEFT JOIN ratings ra ON ra.reservation_id = r.id
                 WHERE r.status = 'completed' AND (r.buyer_id = ? OR r.seller_id = ?)
                 ORDER BY r.completed_at DESC`;
    db.query(sql, [req.session.user.id, req.session.user.id], (error, reservations) => {
        if (error) return handleDatabaseError(res, 'History', error);
        res.render('reservation/history', { reservations });
    });
});

// ==================== Ratings - Feng Kaiduo ====================
app.get('/reservations/:id/rating', isLoggedIn, (req, res) => {
    const sql = `SELECT r.id, r.product_id, r.seller_id, r.rating_admin_delete_count,
                        p.name AS product_name, ra.id AS rating_id
                 FROM reservations r
                 JOIN products p ON p.id = r.product_id
                 LEFT JOIN ratings ra ON ra.reservation_id = r.id
                 WHERE r.id = ? AND r.buyer_id = ? AND r.status = 'completed'
                       AND r.rating_admin_delete_count < 2`;
    db.query(sql, [req.params.id, req.session.user.id], (error, reservations) => {
        if (error) return handleDatabaseError(res, 'Rating form', error);
        if (reservations.length === 0 || reservations[0].rating_id) {
            req.flash('error', 'This completed reservation cannot be rated.');
            return res.redirect('/history');
        }
        res.render('rating/form', {
            reservation: reservations[0],
            rating: null,
            formAction: '/reservations/' + req.params.id + '/rating'
        });
    });
});
app.post('/reservations/:id/rating', isLoggedIn, upload.single('ratingImage'), (req, res) => {
    const ratingValue = Number(req.body.rating);
    if (ratingValue < 1 || ratingValue > 5) {
        deleteUploadedFile(req.file && req.file.filename);
        req.flash('error', 'Choose a rating from 1 to 5.');
        return res.redirect('/reservations/' + req.params.id + '/rating');
    }
    const sql = `INSERT INTO ratings
        (reservation_id, product_id, buyer_id, seller_id, rating, comment, image)
         SELECT id, product_id, buyer_id, seller_id, ?, ?, ?
         FROM reservations
         WHERE id = ? AND buyer_id = ? AND status = 'completed'
               AND rating_admin_delete_count < 2`;
    const image = req.file ? req.file.filename : null;
    db.query(sql, [ratingValue, (req.body.comment || '').trim(), image, req.params.id, req.session.user.id], (error, result) => {
        if (error) {
            deleteUploadedFile(image);
            req.flash('error', error.code === 'ER_DUP_ENTRY' ? 'You already rated this reservation.' : 'Rating could not be saved.');
            return res.redirect('/history');
        }
        if (!result.affectedRows) deleteUploadedFile(image);
        req.flash(result.affectedRows ? 'success' : 'error', result.affectedRows ? 'Rating submitted.' : 'Rating is not allowed.');
        res.redirect('/history');
    });
});
app.get('/ratings/:id/edit', isLoggedIn, (req, res) => {
    const sql = `SELECT ra.*, p.name AS product_name
                 FROM ratings ra JOIN products p ON p.id = ra.product_id
                 WHERE ra.id = ? AND ra.buyer_id = ?`;
    db.query(sql, [req.params.id, req.session.user.id], (error, ratings) => {
        if (error) return handleDatabaseError(res, 'Edit rating', error);
        if (ratings.length === 0) return res.status(404).send('Rating not found.');
        res.render('rating/form', {
            reservation: { id: ratings[0].reservation_id, product_name: ratings[0].product_name },
            rating: ratings[0],
            formAction: '/ratings/' + req.params.id + '/edit'
        });
    });
});
app.post('/ratings/:id/edit', isLoggedIn, upload.single('ratingImage'), (req, res) => {
    const ratingValue = Number(req.body.rating);
    if (ratingValue < 1 || ratingValue > 5) {
        deleteUploadedFile(req.file && req.file.filename);
        req.flash('error', 'Choose a rating from 1 to 5.');
        return res.redirect('/ratings/' + req.params.id + '/edit');
    }
    db.query('SELECT image FROM ratings WHERE id = ? AND buyer_id = ?',
        [req.params.id, req.session.user.id], (selectError, ratings) => {
            if (selectError) {
                deleteUploadedFile(req.file && req.file.filename);
                return handleDatabaseError(res, 'Find rating image', selectError);
            }
            if (ratings.length === 0) {
                deleteUploadedFile(req.file && req.file.filename);
                return res.status(404).send('Rating not found.');
            }
            const oldImage = ratings[0].image;
            const image = req.file ? req.file.filename : oldImage;
            const sql = `UPDATE ratings SET rating = ?, comment = ?, image = ?
                         WHERE id = ? AND buyer_id = ?`;
            db.query(sql, [ratingValue, (req.body.comment || '').trim(), image, req.params.id, req.session.user.id], (error) => {
                if (error) {
                    deleteUploadedFile(req.file && req.file.filename);
                    return handleDatabaseError(res, 'Update rating', error);
                }
                if (req.file && oldImage) deleteUploadedFile(oldImage);
                req.flash('success', 'Rating updated.');
                res.redirect('/history');
            });
        }
    );
});
app.post('/ratings/:id/delete', isLoggedIn, (req, res) => {
    db.query('SELECT image FROM ratings WHERE id = ? AND buyer_id = ?',
        [req.params.id, req.session.user.id], (selectError, ratings) => {
            if (selectError) return handleDatabaseError(res, 'Find rating image', selectError);
            if (ratings.length === 0) {
                req.flash('error', 'Rating not found.');
                return res.redirect('/history');
            }
            db.query(
                'DELETE FROM ratings WHERE id = ? AND buyer_id = ?',
                [req.params.id, req.session.user.id],
                (error) => {
                    if (error) return handleDatabaseError(res, 'Delete rating', error);
                    deleteUploadedFile(ratings[0].image);
                    req.flash('success', 'Rating deleted.');
                    res.redirect('/history');
                }
            );
        }
    );
});

app.post('/admin/ratings/:id/delete', isAdmin, (req, res) => {
    db.beginTransaction((transactionError) => {
        if (transactionError) return handleDatabaseError(res, 'Start rating moderation', transactionError);

        const selectSql = `SELECT ra.id, ra.reservation_id, ra.buyer_id, ra.product_id, ra.image,
                                  r.rating_admin_delete_count
                           FROM ratings ra
                           JOIN reservations r ON r.id = ra.reservation_id
                           WHERE ra.id = ?
                           FOR UPDATE`;
        db.query(selectSql, [req.params.id], (selectError, ratings) => {
            if (selectError) {
                return db.rollback(() => handleDatabaseError(res, 'Find rating for moderation', selectError));
            }
            if (ratings.length === 0) {
                return db.rollback(() => {
                    req.flash('error', 'Rating was already deleted or could not be found.');
                    res.redirect(req.get('referer') || '/');
                });
            }

            const rating = ratings[0];
            db.query('DELETE FROM ratings WHERE id = ?', [rating.id], (deleteError, deleteResult) => {
                if (deleteError) {
                    return db.rollback(() => handleDatabaseError(res, 'Delete moderated rating', deleteError));
                }
                if (deleteResult.affectedRows === 0) {
                    return db.rollback(() => {
                        req.flash('error', 'Rating was already deleted or could not be found.');
                        res.redirect('/products/' + rating.product_id);
                    });
                }

                const countSql = `UPDATE reservations
                                  SET rating_admin_delete_count = rating_admin_delete_count + 1
                                  WHERE id = ?`;
                db.query(countSql, [rating.reservation_id], (countError) => {
                    if (countError) {
                        return db.rollback(() => handleDatabaseError(res, 'Record rating moderation', countError));
                    }

                    const newDeleteCount = Number(rating.rating_admin_delete_count) + 1;
                    function finishModeration(message) {
                        db.commit((commitError) => {
                            if (commitError) {
                                return db.rollback(() => handleDatabaseError(res, 'Save rating moderation', commitError));
                            }
                            deleteUploadedFile(rating.image);
                            req.flash('success', message);
                            res.redirect('/products/' + rating.product_id);
                        });
                    }

                    if (newDeleteCount < 2) {
                        return finishModeration('Rating deleted. The buyer may submit one replacement rating.');
                    }

                    const banReason = 'Account banned after a replacement rating was removed by an administrator.';
                    db.query(
                        `UPDATE users SET is_banned = 1, ban_reason = ?
                         WHERE id = ? AND role = 'user'`,
                        [banReason, rating.buyer_id],
                        (banError) => {
                            if (banError) {
                                return db.rollback(() => handleDatabaseError(res, 'Ban rating author', banError));
                            }
                            db.query(
                                `UPDATE products SET status = 'rejected',
                                 rejection_reason = 'Seller was banned after repeated rating moderation'
                                 WHERE seller_id = ?`,
                                [rating.buyer_id],
                                (productError) => {
                                    if (productError) {
                                        return db.rollback(() => handleDatabaseError(res, 'Remove banned buyer products', productError));
                                    }
                                    finishModeration('Replacement rating deleted. The buyer was banned and their products were removed.');
                                }
                            );
                        }
                    );
                });
            });
        });
    });
});

// ==================== Reports and resolution messages - Ei Htet Htet Tun ====================
app.get('/reports/product/:productId', isLoggedIn, (req, res) => {
    const sql = `SELECT p.id, p.name, p.seller_id, u.name AS seller_name
                 FROM products p JOIN users u ON u.id = p.seller_id
                 WHERE p.id = ? AND p.seller_id <> ?`;
    db.query(sql, [req.params.productId, req.session.user.id], (error, products) => {
        if (error) return handleDatabaseError(res, 'Report product', error);
        if (products.length === 0) return res.status(404).send('Product cannot be reported.');
        res.render('report/form', {
            targetType: 'product',
            target: products[0],
            report: null,
            formAction: '/reports/product/' + req.params.productId
        });
    });
});
app.post('/reports/product/:productId', isLoggedIn, upload.single('evidenceImage'), (req, res) => {
    if (!req.body.category || !(req.body.description || '').trim()) {
        deleteUploadedFile(req.file && req.file.filename);
        req.flash('error', 'Choose a category and describe the issue.');
        return res.redirect('/reports/product/' + req.params.productId);
    }
    const productSql = 'SELECT id, seller_id FROM products WHERE id = ? AND seller_id <> ?';
    db.query(productSql, [req.params.productId, req.session.user.id], (productError, products) => {
        if (productError) return handleDatabaseError(res, 'Report product', productError);
        if (products.length === 0) {
            deleteUploadedFile(req.file && req.file.filename);
            return res.status(404).send('Product cannot be reported.');
        }
        const sql = `INSERT INTO reports
            (reporter_id, reported_user_id, reported_product_id, category, description, evidence_image)
            VALUES (?, ?, ?, ?, ?, ?)`;
        const values = [
            req.session.user.id,
            products[0].seller_id,
            products[0].id,
            req.body.category,
            (req.body.description || '').trim(),
            req.file ? req.file.filename : null
        ];
        db.query(sql, values, (error) => {
            if (error) return handleDatabaseError(res, 'Submit report', error);
            req.flash('success', 'Report submitted.');
            res.redirect('/my-reports');
        });
    });
});
app.get('/reports/user/:userId', isLoggedIn, (req, res) => {
    db.query(
        'SELECT id, name FROM users WHERE id = ? AND id <> ?',
        [req.params.userId, req.session.user.id],
        (error, users) => {
            if (error) return handleDatabaseError(res, 'Report user', error);
            if (users.length === 0) return res.status(404).send('User cannot be reported.');
            res.render('report/form', {
                targetType: 'user',
                target: users[0],
                report: null,
                formAction: '/reports/user/' + req.params.userId
            });
        }
    );
});
app.post('/reports/user/:userId', isLoggedIn, upload.single('evidenceImage'), (req, res) => {
    if (!req.body.category || !(req.body.description || '').trim()) {
        deleteUploadedFile(req.file && req.file.filename);
        req.flash('error', 'Choose a category and describe the issue.');
        return res.redirect('/reports/user/' + req.params.userId);
    }
    if (Number(req.params.userId) === req.session.user.id) {
        deleteUploadedFile(req.file && req.file.filename);
        return res.status(403).send('You cannot report yourself.');
    }
    const sql = `INSERT INTO reports
        (reporter_id, reported_user_id, category, description, evidence_image)
        SELECT ?, id, ?, ?, ? FROM users WHERE id = ?`;
    const values = [
        req.session.user.id,
        req.body.category,
        (req.body.description || '').trim(),
        req.file ? req.file.filename : null,
        req.params.userId
    ];
    db.query(sql, values, (error, result) => {
        if (error) return handleDatabaseError(res, 'Submit user report', error);
        if (!result.affectedRows) return res.status(404).send('User not found.');
        req.flash('success', 'Report submitted.');
        res.redirect('/my-reports');
    });
});
app.get('/my-reports', isLoggedIn, (req, res) => {
    const sql = `SELECT r.*, u.name AS reported_user_name, p.name AS reported_product_name
                 FROM reports r
                 LEFT JOIN users u ON u.id = r.reported_user_id
                 LEFT JOIN products p ON p.id = r.reported_product_id
                 WHERE r.reporter_id = ? ORDER BY r.created_at DESC`;
    db.query(sql, [req.session.user.id], (error, reports) => {
        if (error) return handleDatabaseError(res, 'My reports', error);
        res.render('report/my-reports', { reports });
    });
});
app.get('/reports/:id/edit', isLoggedIn, (req, res) => {
    db.query(
        `SELECT * FROM reports
         WHERE id = ? AND reporter_id = ? AND status = 'pending'`,
        [req.params.id, req.session.user.id],
        (error, reports) => {
            if (error) return handleDatabaseError(res, 'Edit report', error);
            if (reports.length === 0) return res.status(404).send('Report cannot be edited.');
            const report = reports[0];
            res.render('report/form', {
                targetType: 'existing',
                target: { name: 'Report #' + report.id },
                report,
                formAction: '/reports/' + report.id + '/edit'
            });
        }
    );
});
app.post('/reports/:id/edit', isLoggedIn, (req, res) => {
    if (!req.body.category || !(req.body.description || '').trim()) {
        req.flash('error', 'Choose a category and describe the issue.');
        return res.redirect('/reports/' + req.params.id + '/edit');
    }
    const sql = `UPDATE reports SET category = ?, description = ?
                 WHERE id = ? AND reporter_id = ? AND status = 'pending'`;
    db.query(sql, [req.body.category, (req.body.description || '').trim(), req.params.id, req.session.user.id], (error, result) => {
        if (error) return handleDatabaseError(res, 'Update report', error);
        req.flash(result.affectedRows ? 'success' : 'error', result.affectedRows ? 'Report updated.' : 'Report cannot be updated.');
        res.redirect('/my-reports');
    });
});
app.post('/reports/:id/delete', isLoggedIn, (req, res) => {
    db.query(
        `SELECT evidence_image FROM reports
         WHERE id = ? AND reporter_id = ? AND status = 'pending'`,
        [req.params.id, req.session.user.id],
        (selectError, reports) => {
            if (selectError) return handleDatabaseError(res, 'Delete report', selectError);
            if (reports.length === 0) {
                req.flash('error', 'Report cannot be deleted.');
                return res.redirect('/my-reports');
            }
            db.query(
                `DELETE FROM reports WHERE id = ? AND reporter_id = ? AND status = 'pending'`,
                [req.params.id, req.session.user.id],
                (deleteError) => {
                    if (deleteError) return handleDatabaseError(res, 'Delete report', deleteError);
                    deleteUploadedFile(reports[0].evidence_image);
                    req.flash('success', 'Report deleted.');
                    res.redirect('/my-reports');
                }
            );
        }
    );
});

// ==================== Administrator ====================
app.get('/admin', isAdmin, (req, res) => {
    const sql = `SELECT
        (SELECT COUNT(*) FROM products WHERE status = 'pending') AS pending_products,
        (SELECT COUNT(*) FROM reports WHERE status = 'pending') AS pending_reports,
        (SELECT COUNT(*) FROM users WHERE role = 'user') AS users,
        (SELECT COUNT(*) FROM reservations WHERE status = 'completed') AS completed_reservations`;
    db.query(sql, (error, results) => {
        if (error) return handleDatabaseError(res, 'Admin dashboard', error);
        res.render('admin/index', { counts: results[0] });
    });
});
app.get('/admin/products', isAdmin, (req, res) => {
    db.query(
        `SELECT p.*, u.name AS seller_name FROM products p
         JOIN users u ON u.id = p.seller_id ORDER BY p.created_at DESC`,
        (error, products) => {
            if (error) return handleDatabaseError(res, 'Admin products', error);
            res.render('admin/products', { products });
        }
    );
});
app.post('/admin/products/:id/approve', isAdmin, (req, res) => {
    db.query(
        `UPDATE products SET status = IF(quantity > 0, 'approved', 'sold_out'),
         rejection_reason = NULL WHERE id = ?`,
        [req.params.id],
        (error) => {
            if (error) return handleDatabaseError(res, 'Approve product', error);
            req.flash('success', 'Product approved.');
            res.redirect('/admin/products');
        }
    );
});
app.post('/admin/products/:id/reject', isAdmin, (req, res) => {
    db.query(
        `UPDATE products SET status = 'rejected', rejection_reason = ? WHERE id = ?`,
        [(req.body.reason || 'Product does not meet marketplace requirements.').trim(), req.params.id],
        (error) => {
            if (error) return handleDatabaseError(res, 'Reject product', error);
            req.flash('success', 'Product rejected.');
            res.redirect('/admin/products');
        }
    );
});
app.get('/admin/reports', isAdmin, (req, res) => {
    const sql = `SELECT r.*, reporter.name AS reporter_name,
                        target.name AS reported_user_name, p.name AS reported_product_name
                 FROM reports r
                 JOIN users reporter ON reporter.id = r.reporter_id
                 LEFT JOIN users target ON target.id = r.reported_user_id
                 LEFT JOIN products p ON p.id = r.reported_product_id
                 ORDER BY r.created_at DESC`;
    db.query(sql, (error, reports) => {
        if (error) return handleDatabaseError(res, 'Admin reports', error);
        res.render('admin/reports', { reports });
    });
});
app.post('/admin/reports/:id/resolve', isAdmin, (req, res) => {
    const { decision, action, resolutionMessage } = req.body;
    const cleanResolution = (resolutionMessage || '').trim();
    const allowedActions = ['none', 'remove_product', 'ban_and_remove'];
    if (!['approved', 'dismissed'].includes(decision) || !cleanResolution ||
        (decision === 'approved' && !allowedActions.includes(action))) {
        req.flash('error', 'Choose a valid decision and enter a resolution message.');
        return res.redirect('/admin/reports');
    }
    db.query('SELECT * FROM reports WHERE id = ? AND status = ?', [req.params.id, 'pending'], (selectError, reports) => {
        if (selectError) return handleDatabaseError(res, 'Resolve report', selectError);
        if (reports.length === 0) {
            req.flash('error', 'Report was already resolved.');
            return res.redirect('/admin/reports');
        }
        const report = reports[0];
        const chosenAction = decision === 'approved' ? action : 'none';
        function saveResolution() {
            const updateSql = `UPDATE reports
                               SET status = ?, admin_action = ?, resolution_message = ?,
                                   resolved_by = ?, resolved_at = CURRENT_TIMESTAMP
                               WHERE id = ? AND status = 'pending'`;
            db.query(updateSql, [decision, chosenAction, cleanResolution, req.session.user.id, report.id], (updateError) => {
                if (updateError) return handleDatabaseError(res, 'Save report resolution', updateError);
                req.flash('success', 'Report resolved. The reporter can see the resolution message.');
                res.redirect('/admin/reports');
            });
        }
        if (decision === 'approved' && chosenAction === 'remove_product') {
            const removeSql = report.reported_product_id
                ? `UPDATE products SET status = 'rejected',
                   rejection_reason = 'Removed after an approved report' WHERE id = ?`
                : `UPDATE products SET status = 'rejected',
                   rejection_reason = 'Removed after an approved user report' WHERE seller_id = ?`;
            const removeId = report.reported_product_id || report.reported_user_id;
            if (!removeId) {
                req.flash('error', 'The reported product or user no longer exists.');
                return res.redirect('/admin/reports');
            }
            return db.query(
                removeSql,
                [removeId],
                (productError) => {
                    if (productError) return handleDatabaseError(res, 'Remove reported product', productError);
                    saveResolution();
                }
            );
        }
        if (decision === 'approved' && chosenAction === 'ban_and_remove') {
            if (!report.reported_user_id) {
                req.flash('error', 'The reported user no longer exists.');
                return res.redirect('/admin/reports');
            }
            return db.query(
                'UPDATE users SET is_banned = 1, ban_reason = ? WHERE id = ?',
                [cleanResolution, report.reported_user_id],
                (userError) => {
                    if (userError) return handleDatabaseError(res, 'Ban reported user', userError);
                    db.query(
                        `UPDATE products SET status = 'rejected',
                         rejection_reason = 'Seller was banned after an approved report'
                         WHERE seller_id = ?`,
                        [report.reported_user_id],
                        (productError) => {
                            if (productError) return handleDatabaseError(res, 'Remove banned user products', productError);
                            saveResolution();
                        }
                    );
                }
            );
        }
        saveResolution();
    });
});
app.get('/admin/users', isAdmin, (req, res) => {
    db.query(
        `SELECT id, name, email, phone, is_banned, ban_reason, created_at
         FROM users WHERE role = 'user' ORDER BY created_at DESC`,
        (error, users) => {
            if (error) return handleDatabaseError(res, 'Admin users', error);
            res.render('admin/users', { users });
        }
    );
});
app.post('/admin/users/:id/ban', isAdmin, (req, res) => {
    db.query(
        `UPDATE users SET is_banned = 1, ban_reason = ?
         WHERE id = ? AND role = 'user'`,
        [(req.body.reason || 'Account suspended by an administrator.').trim(), req.params.id],
        (error) => {
            if (error) return handleDatabaseError(res, 'Ban user', error);
            req.flash('success', 'User banned.');
            res.redirect('/admin/users');
        }
    );
});
app.post('/admin/users/:id/unban', isAdmin, (req, res) => {
    db.query(
        `UPDATE users SET is_banned = 0, ban_reason = NULL
         WHERE id = ? AND role = 'user'`,
        [req.params.id],
        (error) => {
            if (error) return handleDatabaseError(res, 'Unban user', error);
            req.flash('success', 'User unbanned.');
            res.redirect('/admin/users');
        }
    );
});

// ==================== Error handling ====================
app.use((req, res) => {
    res.status(404).render('404');
});
app.use((error, req, res, next) => {
    console.error('Application error:', error.message);
    if (error instanceof multer.MulterError || error.message === 'Only image uploads are allowed.') {
        req.flash('error', error.message);
        return res.redirect(req.get('referer') || '/');
    }
    res.status(500).send('An application error occurred.');
});
app.listen(PORT, () => {
    console.log('CampusCycle_2 started on http://localhost:' + PORT);
});
