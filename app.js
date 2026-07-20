require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const path = require('path');
const productModel = require('./models/productModel');
const categoryModel = require('./models/categoryModel');
const reportModel = require('./models/reportModel');
const userModel = require('./models/userModel');

const app = express();

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images'); // Directory to save uploaded files
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

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
app.post('/sell', upload.single('image'), (req, res) => {
    const { name, categoryId, description, price, condition, quantity, contactInfo } = req.body;

    let image;
    if (req.file) {
        image = req.file.filename; // Save only the filename
    } else {
        image = null;
    }

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
// Reporting products & users, and the admin review process that resolves those reports.

// TODO: replace these with req.session.user.id once the login feature is done.
const TEMP_REPORTER_ID = 1; // seeded normal user account making the report
const TEMP_ADMIN_ID = 1;    // seeded admin account resolving the report

// ---------- Reporting a product ----------

// Show the "report this product" form
app.get('/user_report/:productId', (req, res) => {
    const productId = req.params.productId;
    productModel.getProductById(productId, (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.send('Error retrieving product');
        }
        if (results.length === 0) {
            return res.status(404).send('Product not found');
        }
        res.render('user_report', { product: results[0] });
    });
});

// Submit a product report
app.post('/user_report', upload.single('evidenceImage'), (req, res) => {
    const { reported_product_id, reported_user_id, category, description } = req.body;

    let evidenceImage;
    if (req.file) {
        evidenceImage = req.file.filename; // Save only the filename
    } else {
        evidenceImage = null;
    }

    reportModel.createReport({
        reporterId: TEMP_REPORTER_ID,
        reportedUserId: reported_user_id,
        reportedProductId: reported_product_id,
        category: category,
        description: description,
        evidenceImage: evidenceImage
    }, (error) => {
        if (error) {
            console.error('Error submitting report:', error.message);
            return res.send('Error submitting report');
        }
        req.flash('success', 'Report submitted. Thank you for helping keep CampusCycle safe!');
        res.redirect('/products/' + reported_product_id);
    });
});

// ---------- Reporting a user ----------

// Show the "report this user" form
app.get('/report_user/:userId', (req, res) => {
    const userId = req.params.userId;
    userModel.getUserById(userId, (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.send('Error retrieving user');
        }
        if (results.length === 0) {
            return res.status(404).send('User not found');
        }
        res.render('report_user', { reportedUser: results[0] });
    });
});

// Submit a user report
app.post('/report_user', upload.single('evidenceImage'), (req, res) => {
    const { reported_user_id, category, description } = req.body;

    let evidenceImage;
    if (req.file) {
        evidenceImage = req.file.filename;
    } else {
        evidenceImage = null;
    }

    reportModel.createReport({
        reporterId: TEMP_REPORTER_ID,
        reportedUserId: reported_user_id,
        reportedProductId: null,
        category: category,
        description: description,
        evidenceImage: evidenceImage
    }, (error) => {
        if (error) {
            console.error('Error submitting report:', error.message);
            return res.send('Error submitting report');
        }
        req.flash('success', 'Report submitted. Thank you for helping keep CampusCycle safe!');
        res.redirect('/');
    });
});

// ---------- Reporter's own report history ----------

// A user's own submitted reports and their current status
app.get('/my_reports', (req, res) => {
    reportModel.getReportsByReporter(TEMP_REPORTER_ID, (error, reports) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.send('Error retrieving your reports');
        }
        res.render('my_reports', { reports: reports });
    });
});

// ---------- Admin: review reports ----------

// List of reports, filterable by status (defaults to the ones still needing review)
app.get('/admin/admin_report', (req, res) => {
    const status = req.query.status || 'pending';
    reportModel.getAllReports(status, (error, reports) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.send('Error retrieving reports');
        }
        userModel.getBannedUsers((banError, bannedUsers) => {
            if (banError) {
                console.error('Database query error:', banError.message);
                return res.send('Error retrieving banned users');
            }
            res.render('admin/admin_report', {
                reports: reports,
                selectedStatus: status,
                bannedUsers: bannedUsers
            });
        });
    });
});

// Alias for the "Reports" navbar link
app.get('/admin/reports', (req, res) => {
    res.redirect('/admin/admin_report');
});

// One report in full - reporter, reported user/product, evidence - with the resolution form
app.get('/admin/admin_report/:id', (req, res) => {
    reportModel.getReportById(req.params.id, (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.send('Error retrieving report');
        }
        if (results.length === 0) {
            return res.status(404).send('Report not found');
        }
        res.render('admin/report_details', { report: results[0] });
    });
});

// Admin approves a report - take action against the reported product and/or user
app.post('/admin/admin_report/:id/approve', (req, res) => {
    const reportId = req.params.id;
    const { reportedProductId, reportedUserId, action, banDuration, adminNote } = req.body;

    // Step 1: remove the reported listing, if that action was chosen
    const removeProductIfNeeded = (next) => {
        if ((action === 'remove_product' || action === 'ban_and_remove') && reportedProductId) {
            productModel.rejectProduct(reportedProductId, 'Removed by admin following a user report', next);
        } else {
            next(null);
        }
    };

    // Step 2: ban the reported user, if that action was chosen
    const banUserIfNeeded = (next) => {
        if ((action === 'ban_user' || action === 'ban_and_remove') && reportedUserId) {
            userModel.banUser(reportedUserId, banDuration, adminNote || 'Banned following a user report', TEMP_ADMIN_ID, next);
        } else {
            next(null);
        }
    };

    removeProductIfNeeded((error) => {
        if (error) {
            console.error('Error removing product:', error.message);
            return res.send('Error removing product');
        }
        banUserIfNeeded((error2) => {
            if (error2) {
                console.error('Error banning user:', error2.message);
                return res.send('Error banning user');
            }
            const summary = adminNote || ('Action taken: ' + action);
            reportModel.approveReport(reportId, summary, (error3) => {
                if (error3) {
                    console.error('Error approving report:', error3.message);
                    return res.send('Error approving report');
                }
                req.flash('success', 'Report approved and action taken.');
                res.redirect('/admin/admin_report');
            });
        });
    });
});

// Admin dismisses a report - no action needed against the product/user
app.post('/admin/admin_report/:id/dismiss', (req, res) => {
    reportModel.dismissReport(req.params.id, 'Dismissed - no action needed', (error) => {
        if (error) {
            console.error('Error dismissing report:', error.message);
            return res.send('Error dismissing report');
        }
        req.flash('success', 'Report dismissed.');
        res.redirect('/admin/admin_report');
    });
});

// ---------- Admin: lift a ban early ----------

app.post('/admin/users/:id/unban', (req, res) => {
    userModel.unbanUser(req.params.id, (error) => {
        if (error) {
            console.error('Error removing ban:', error.message);
            return res.send('Error removing ban');
        }
        req.flash('success', 'Ban removed.');
        res.redirect('/admin/admin_report');
    });
});

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
