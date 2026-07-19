require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const productModel = require('./models/productModel');
const categoryModel = require('./models/categoryModel');

const app = express();

// Database connection (Azure MySQL Database Server)
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: true }
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to the database:', err.message);
        return;
    }
    console.log('Connected to database');
});

app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 60000 } // Session expires after 1 minute
}));

app.use(flash());

// Setting up EJS
app.set('view engine', 'ejs');

// ==================== Thiha Aung's routes ====================

// TODO: replace with req.session.user.id once the login feature is done.
// Using the seeded 'Thiha Aung' user (id 2) as the seller for now.
const TEMP_SELLER_ID = 2;

// Homepage - shows the most recently approved listings
app.get('/', (req, res) => {
    productModel.getRecentApproved(3, (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.send('Error retrieving products');
        }
        categoryModel.getAllCategories((catError, categories) => {
            if (catError) {
                console.error('Database query error:', catError.message);
                return res.send('Error retrieving categories');
            }
            res.render('index', { products: results, categories: categories });
        });
    });
});

// Browse page - approved listings only, filterable by category and searchable by name
app.get('/browse', (req, res) => {
    const categoryId = req.query.category || '';
    const search = req.query.q || '';

    categoryModel.getAllCategories((catError, categories) => {
        if (catError) {
            console.error('Database query error:', catError.message);
            return res.send('Error retrieving categories');
        }

        productModel.getApprovedProducts({ categoryId, search }, (error, results) => {
            if (error) {
                console.error('Database query error:', error.message);
                return res.send('Error retrieving products');
            }
            res.render('browse', {
                products: results,
                categories: categories,
                selectedCategory: categoryId,
                search: search
            });
        });
    });
});

// Product details page
app.get('/products/:id', (req, res) => {
    const productId = req.params.id;
    productModel.getProductById(productId, (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.send('Error retrieving product');
        }
        if (results.length === 0) {
            return res.status(404).send('Product not found');
        }
        res.render('productDetails', { product: results[0] });
    });
});

// Sell page - show the add-product form
app.get('/sell', (req, res) => {
    categoryModel.getAllCategories((error, categories) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.send('Error retrieving categories');
        }
        res.render('sell', { categories: categories });
    });
});

// Sell page - submit a new product (always starts as 'pending' until admin approves it)
app.post('/sell', (req, res) => {
    const { name, categoryId, description, price, condition, quantity, image, contactInfo } = req.body;

    productModel.createProduct({
        sellerId: TEMP_SELLER_ID,
        categoryId: categoryId,
        name: name,
        description: description,
        price: price,
        condition: condition,
        quantity: quantity,
        image: image,
        contactInfo: contactInfo
    }, (error) => {
        if (error) {
            console.error('Error adding product:', error.message);
            return res.send('Error adding product');
        }
        req.flash('success', 'Product submitted! It will appear on Browse once approved by an admin.');
        res.redirect('/browse');
    });
});

// Admin dashboard - shows products waiting for approval
app.get('/admin', (req, res) => {
    productModel.getPendingProducts((error, pendingProducts) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.send('Error retrieving pending products');
        }
        res.render('admin/index', { pendingProducts: pendingProducts });
    });
});

// Admin approves a pending product
app.post('/admin/products/:id/approve', (req, res) => {
    productModel.approveProduct(req.params.id, (error) => {
        if (error) {
            console.error('Error approving product:', error.message);
            return res.send('Error approving product');
        }
        res.redirect('/admin');
    });
});

// Admin rejects a pending product and stores the reason
app.post('/admin/products/:id/reject', (req, res) => {
    const reason = req.body.reason || 'No reason provided';
    productModel.rejectProduct(req.params.id, reason, (error) => {
        if (error) {
            console.error('Error rejecting product:', error.message);
            return res.send('Error rejecting product');
        }
        res.redirect('/admin');
    });
});


// ==================== Kaido's routes ====================


// ==================== Ei Htet Htet Tun's routes ====================


// ==================== Hein Thu Nyi Nyi's routes ====================


// ==================== Denna's routes ====================


// ==================== Zhen Cheng Chao's routes ====================


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
    console.log(`Server started on http://localhost:${PORT}`);
});
