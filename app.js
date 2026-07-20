require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const productModel = require('./models/productModel');
const categoryModel = require('./models/categoryModel');
const reportModel = require('./models/reportModel');
const userModel = require('./models/userModel');
const reservationModel = require('./models/reservationModel');
const ratingModel = require('./models/ratingModel');
const purchaseModel = require('./models/purchaseModel');
const { ratingUpload, uploadDirectory } = require('./middleware/ratingUpload');
const { isLoggedIn, isAdmin, isGuest, validateLogin } = require('./middleware/auth');

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
    cookie: { maxAge: 1000 * 60 * 60 } // Session expires after 1 hour
}));

app.use(flash());

// Setting up EJS
app.set('view engine', 'ejs');

// ==================== Thiha Aung's routes ====================

// Homepage - the listings page is now Browse, so "/" just goes straight there.
app.get('/', (req, res) => {
    res.redirect('/browse');
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
            ratingModel.getSummariesByProductIds(results.map((product) => product.id), (ratingError, summaries) => {
                if (ratingError) {
                    console.error('Database query error:', ratingError.message);
                    return res.send('Error retrieving ratings');
                }
                const products = results.map((product) => ({
                    ...product,
                    ratingSummary: summaries.get(Number(product.id)) || { averageRating: 0, reviewCount: 0 }
                }));
                res.render('browse', {
                    products: products,
                    categories: categories,
                    selectedCategory: categoryId,
                    search: search
                });
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

        const product = results[0];

        // ---- Seller bar data (added by Hein Thu Nyi Nyi) ----
        // Loads the seller's public details and stats for the strip at the
        // top of the page. If either lookup fails the page still renders,
        // just without the bar, so a profile problem cannot break a listing.
        userModel.findPublicById(product.seller_id, (sellerError, sellerResults) => {
            const seller = (!sellerError && sellerResults.length > 0) ? sellerResults[0] : null;

            userModel.getPublicStats(product.seller_id, (statsError, statsResults) => {
                const sellerStats = (!statsError && statsResults.length > 0) ? statsResults[0] : null;

                let sellerInfo = null;
                if (seller && sellerStats) {
                    const positivePercent = sellerStats.reviewCount > 0
                        ? Math.round((sellerStats.goodRatings / sellerStats.reviewCount) * 100)
                        : 0;

                    sellerInfo = {
                        id: seller.id,
                        name: seller.name,
                        initials: getInitials(seller.name),
                        lastSeen: describeLastSeen(seller.last_active),
                        membershipLength: describeMembership(seller.created_at),
                        itemsSold: sellerStats.itemsSold,
                        reviewCount: sellerStats.reviewCount,
                        averageRating: sellerStats.averageRating,
                        positivePercent: positivePercent,
                        isGoodSeller: sellerStats.reviewCount >= 3 && positivePercent >= 90
                    };
                }

                ratingModel.getSummaryByProductId(product.id, (ratingError, ratingSummary) => {
                    if (ratingError) {
                        console.error('Database query error:', ratingError.message);
                        return res.send('Error retrieving ratings');
                    }

                    res.render('productDetails', {
                        product: product,
                        currentUser: req.session.user || null,
                        sellerInfo: sellerInfo,
                        ratingSummary: ratingSummary,
                        errors: req.flash('error'),
                        success: req.flash('success')
                    });
                });
            });
        });
    });
});

// Sell page - show the add-product form
app.get('/sell', isLoggedIn, (req, res) => {
    categoryModel.getAllCategories((error, categories) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.send('Error retrieving categories');
        }
        res.render('sell', { categories: categories });
    });
});

// Sell page - submit a new product (always starts as 'pending' until admin approves it)
app.post('/sell', isLoggedIn, upload.single('image'), (req, res) => {
    const { name, categoryId, description, price, condition, quantity, contactInfo } = req.body;

    let image;
    if (req.file) {
        image = req.file.filename; // Save only the filename
    } else {
        image = null;
    }

    productModel.createProduct({
        sellerId: req.session.user.id,
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

// Edit a listing - show the pre-filled form. Only the seller can edit their
// own post, and only while it's still 'selling' (not pending/reserved/sold out).
app.get('/products/:id/edit', isLoggedIn, (req, res) => {
    productModel.getProductById(req.params.id, (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.send('Error retrieving product');
        }
        if (results.length === 0) {
            return res.status(404).send('Product not found');
        }

        const product = results[0];
        if (product.seller_id !== req.session.user.id || product.status !== 'selling') {
            req.flash('error', 'You can only edit your own listings while they are selling.');
            return res.redirect('/sales-history');
        }

        categoryModel.getAllCategories((catError, categories) => {
            if (catError) {
                console.error('Database query error:', catError.message);
                return res.send('Error retrieving categories');
            }
            res.render('editProduct', { product: product, categories: categories });
        });
    });
});

// Edit a listing - save the changes
app.post('/products/:id/edit', isLoggedIn, upload.single('image'), (req, res) => {
    const productId = req.params.id;

    productModel.getProductById(productId, (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.send('Error retrieving product');
        }
        if (results.length === 0) {
            return res.status(404).send('Product not found');
        }

        const product = results[0];
        if (product.seller_id !== req.session.user.id || product.status !== 'selling') {
            req.flash('error', 'You can only edit your own listings while they are selling.');
            return res.redirect('/sales-history');
        }

        const { name, categoryId, description, price, condition, quantity, contactInfo } = req.body;
        const image = req.file ? req.file.filename : product.image; // keep the old image unless a new one was uploaded

        productModel.updateProduct(productId, {
            categoryId: categoryId,
            name: name,
            description: description,
            price: price,
            condition: condition,
            quantity: quantity,
            image: image,
            contactInfo: contactInfo
        }, (updateError) => {
            if (updateError) {
                console.error('Error updating product:', updateError.message);
                return res.send('Error updating product');
            }
            req.flash('success', 'Listing updated.');
            res.redirect('/sales-history');
        });
    });
});

// Delete a listing - only the seller, and only while it's still 'selling'
app.post('/products/:id/delete', isLoggedIn, (req, res) => {
    const productId = req.params.id;

    productModel.getProductById(productId, (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.send('Error retrieving product');
        }
        if (results.length === 0) {
            return res.status(404).send('Product not found');
        }

        const product = results[0];
        if (product.seller_id !== req.session.user.id || product.status !== 'selling') {
            req.flash('error', 'You can only delete your own listings while they are selling.');
            return res.redirect('/sales-history');
        }

        productModel.deleteProduct(productId, (deleteError) => {
            if (deleteError) {
                console.error('Error deleting product:', deleteError.message);
                return res.send('Error deleting product');
            }
            req.flash('success', 'Listing deleted.');
            res.redirect('/sales-history');
        });
    });
});

// Admin dashboard - stats overview (real counts) plus the products still
// waiting for approval.
app.get('/admin', (req, res) => {
    productModel.getPendingProducts((error, pendingProducts) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.send('Error retrieving pending products');
        }
        userModel.countAllUsers((userError, userRows) => {
            if (userError) {
                console.error('Database query error:', userError.message);
                return res.send('Error retrieving user count');
            }
            reportModel.getAllReports('pending', (reportError, openReports) => {
                if (reportError) {
                    console.error('Database query error:', reportError.message);
                    return res.send('Error retrieving reports');
                }
                reservationModel.getAllReservationsForAdmin('all', (reservationError, reservations) => {
                    if (reservationError) {
                        console.error('Database query error:', reservationError.message);
                        return res.send('Error retrieving reservations');
                    }
                    const activeReservations = reservations.filter((reservation) =>
                        ['pending', 'proposed', 'confirmed'].includes(reservation.status)
                    );
                    res.render('admin/index', {
                        pendingProducts: pendingProducts,
                        totalUsers: userRows[0].total,
                        openReportsCount: openReports.length,
                        activeReservationsCount: activeReservations.length
                    });
                });
            });
        });
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

// Purchase History - everything the logged-in user has bought
app.get('/purchase-history', isLoggedIn, (req, res) => {
    purchaseModel.getPurchasesByBuyer(req.session.user.id, (error, purchases) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.send('Error retrieving purchase history');
        }
        res.render('purchaseHistory', { purchases: purchases });
    });
});

// Sales History - the seller's own listings (pending/selling/reserved),
// filterable by status, plus everything they've completed selling
app.get('/sales-history', isLoggedIn, (req, res) => {
    const status = req.query.status || 'all';

    productModel.getSellerListings(req.session.user.id, status, (listingsError, listings) => {
        if (listingsError) {
            console.error('Database query error:', listingsError.message);
            return res.send('Error retrieving your listings');
        }

        purchaseModel.getSalesBySeller(req.session.user.id, (error, sales) => {
            if (error) {
                console.error('Database query error:', error.message);
                return res.send('Error retrieving sales history');
            }
            res.render('salesHistory', {
                listings: listings,
                sales: sales,
                selectedStatus: status,
                errors: req.flash('error'),
                success: req.flash('success')
            });
        });
    });
});


// ==================== Kaido's routes ====================
// Buyer ratings & reviews (with photo/video media) on a completed purchase.

function toItemView(product) {
    return {
        id: product.id,
        name: product.name,
        price: Number(product.price),
        category: product.categoryName || 'Other',
        image: product.image ? `/images/${product.image}` : null
    };
}

function getUploadedFiles(req) {
    return [
        ...(req.files?.images || []),
        ...(req.files?.videos || [])
    ];
}

function removeUploadedFiles(files) {
    for (const file of files) {
        fs.unlink(file.path, () => {});
    }
}

function removeStoredMedia(mediaPaths) {
    for (const mediaPath of mediaPaths) {
        const fileName = path.basename(mediaPath);
        fs.unlink(path.join(uploadDirectory, fileName), () => {});
    }
}

// Writing a review requires an account that actually completed a purchase
// of this product.
function requirePurchasedProduct(req, res, next) {
    const productId = Number(req.params.id);
    const buyerId = req.session.user?.id || null;

    if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).send('Invalid product ID');
    }

    if (!buyerId) {
        req.flash('error', 'Sign in with the account that purchased this item to write a review');
        return res.redirect(`/details/${productId}/ratings`);
    }

    purchaseModel.findCompletedPurchase(buyerId, productId, (error, purchase) => {
        if (error) {
            return next(error);
        }
        if (!purchase) {
            req.flash('error', 'Only verified buyers can review this item');
            return res.redirect(`/details/${productId}/ratings`);
        }

        req.ratingBuyerId = buyerId;
        req.ratingPurchase = purchase;
        next();
    });
}

// Public "ratings & reviews" list. Clicking a product's star rating lands
// here first, not straight into the write-a-review form.
app.get('/details/:id/ratings', (req, res, next) => {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).send('Invalid product ID');
    }

    productModel.getProductById(productId, (error, results) => {
        if (error) {
            return next(error);
        }
        if (results.length === 0) {
            return res.status(404).send('Product not found');
        }
        const product = results[0];
        const buyerId = req.session.user?.id || null;

        ratingModel.getSummaryByProductId(productId, (summaryError, ratingSummary) => {
            if (summaryError) {
                return next(summaryError);
            }

            ratingModel.getPublicReviewsByProductId(productId, (reviewsError, reviews) => {
                if (reviewsError) {
                    return next(reviewsError);
                }

                if (!buyerId) {
                    return res.render('details/ratings', {
                        item: toItemView(product),
                        itemId: productId,
                        ratingSummary,
                        reviews,
                        isLoggedIn: false,
                        canReview: false,
                        hasExistingReview: false,
                        success: req.flash('success')[0] || null,
                        error: req.flash('error')[0] || null
                    });
                }

                purchaseModel.findCompletedPurchase(buyerId, productId, (purchaseError, purchase) => {
                    if (purchaseError) {
                        return next(purchaseError);
                    }

                    ratingModel.findByProductAndBuyer(productId, buyerId, (ratingError, existingRating) => {
                        if (ratingError) {
                            return next(ratingError);
                        }

                        res.render('details/ratings', {
                            item: toItemView(product),
                            itemId: productId,
                            ratingSummary,
                            reviews,
                            isLoggedIn: true,
                            canReview: Boolean(purchase),
                            hasExistingReview: Boolean(existingRating),
                            success: req.flash('success')[0] || null,
                            error: req.flash('error')[0] || null
                        });
                    });
                });
            });
        });
    });
});

// Legacy/singular URL - redirect straight to the reviews list.
app.get('/details/:id/rating', (req, res) => {
    res.redirect(301, `/details/${req.params.id}/ratings`);
});

// Write/edit a review form.
app.get('/details/:id/rating/new', requirePurchasedProduct, (req, res, next) => {
    const productId = Number(req.params.id);

    productModel.getProductById(productId, (error, results) => {
        if (error) {
            return next(error);
        }
        if (results.length === 0) {
            return res.status(404).send('Product not found');
        }
        const product = results[0];

        ratingModel.findByProductAndBuyer(productId, req.ratingBuyerId, (ratingError, existingRating) => {
            if (ratingError) {
                return next(ratingError);
            }

            res.render('details/rating', {
                pageTitle: existingRating ? 'Update your review' : 'Share your experience',
                item: toItemView(product),
                itemId: productId,
                selectedRating: existingRating?.rating || 0,
                comment: existingRating?.comment || '',
                isAnonymous: existingRating?.is_anonymous || false,
                existingMedia: existingRating?.media || [],
                success: null,
                error: req.flash('error')[0] || null
            });
        });
    });
});

// Submit a new or updated review.
app.post('/details/:id/rating/new', requirePurchasedProduct, ratingUpload, (req, res, next) => {
    const productId = Number(req.params.id);
    const rating = Number(req.body.rating);
    const comment = req.body.comment?.trim() || null;
    const isAnonymous = req.body.isAnonymous === '1';
    const removeMedia = req.body.removeMedia === '1';
    const mediaFiles = getUploadedFiles(req);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        removeUploadedFiles(mediaFiles);
        req.flash('error', 'Please choose a rating from 1 to 5 stars');
        return res.redirect(`/details/${productId}/rating/new`);
    }

    if (comment && comment.length > 500) {
        removeUploadedFiles(mediaFiles);
        req.flash('error', 'Your review must be 500 characters or fewer');
        return res.redirect(`/details/${productId}/rating/new`);
    }

    ratingModel.upsert({
        productId,
        buyerId: req.ratingBuyerId,
        sellerId: req.ratingPurchase.seller_id,
        rating,
        comment,
        isAnonymous,
        mediaFiles,
        replaceMedia: mediaFiles.length > 0 || removeMedia
    }, (error, result) => {
        if (error) {
            removeUploadedFiles(mediaFiles);
            return next(error);
        }

        removeStoredMedia(result.oldMediaPaths);
        req.flash('success', 'Your rating has been saved');
        res.redirect(`/details/${productId}/ratings`);
    });
});

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

// ---- Small display helpers used by the profile pages ----

// "Hein Thu Nyi Nyi" -> "HT". Used for the circle avatar.
function getInitials(name) {
    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(word => word.charAt(0).toUpperCase())
        .join('');
}

// Turns last_active into "Active 3 hours ago". NULL means they have never
// logged in, which is possible because accounts are created by the school.
function describeLastSeen(lastActive) {
    if (!lastActive) {
        return 'New member';
    }

    const minutes = Math.floor((Date.now() - new Date(lastActive).getTime()) / 60000);

    if (minutes < 1)      return 'Active now';
    if (minutes < 60)     return 'Active ' + minutes + ' minute' + (minutes === 1 ? '' : 's') + ' ago';

    const hours = Math.floor(minutes / 60);
    if (hours < 24)       return 'Active ' + hours + ' hour' + (hours === 1 ? '' : 's') + ' ago';

    const days = Math.floor(hours / 24);
    if (days < 30)        return 'Active ' + days + ' day' + (days === 1 ? '' : 's') + ' ago';

    const months = Math.floor(days / 30);
    if (months < 12)      return 'Active ' + months + ' month' + (months === 1 ? '' : 's') + ' ago';

    return 'Active over a year ago';
}

// Turns created_at into "8 months" / "2 years" for the "Member for" line.
function describeMembership(createdAt) {
    if (!createdAt) {
        return 'a while';
    }

    const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);

    if (days < 1)   return 'less than a day';
    if (days < 30)  return days + ' day' + (days === 1 ? '' : 's');

    const months = Math.floor(days / 30);
    if (months < 12) return months + ' month' + (months === 1 ? '' : 's');

    const years = Math.floor(months / 12);
    return years + ' year' + (years === 1 ? '' : 's');
}

// Show the login page. isGuest sends people who are already logged in
// straight to their home page instead of showing the form again.
app.get('/login', isGuest, (req, res) => {
    res.render('auth/login', {
        errors: req.flash('error'),
        success: req.flash('success'),
        oldEmail: req.flash('email')[0] || ''  // keeps the typed email after a failed attempt
    });
});

// Handle the login form.
// validateLogin runs first and checks the email is filled in and is an RP address.
app.post('/login', validateLogin, (req, res) => {
    const { email, password } = req.body;

    userModel.findByEmail(email, (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            req.flash('error', 'Something went wrong. Please try again.');
            return res.redirect('/login');
        }

        // Deliberately the same message whether the email does not exist or the
        // password is wrong - telling them which one is wrong would let someone
        // work out which emails have accounts.
        if (results.length === 0) {
            req.flash('error', 'Incorrect email or password.');
            req.flash('email', email);
            return res.redirect('/login');
        }

        const user = results[0];

        // Compare the typed password against the stored bcrypt hash.
        bcrypt.compare(password, user.password, (compareError, isMatch) => {
            if (compareError) {
                console.error('Error checking password:', compareError.message);
                req.flash('error', 'Something went wrong. Please try again.');
                return res.redirect('/login');
            }

            if (!isMatch) {
                req.flash('error', 'Incorrect email or password.');
                req.flash('email', email);
                return res.redirect('/login');
            }

            // Banned users are stopped here, after the password check.
            // banned_until = NULL means the ban is permanent.
            if (user.is_banned) {
                const stillBanned = !user.banned_until || new Date(user.banned_until) > new Date();
                if (stillBanned) {
                    const until = user.banned_until
                        ? ' until ' + new Date(user.banned_until).toLocaleDateString()
                        : ' permanently';
                    req.flash('error', 'This account has been suspended' + until + '. Reason: ' + (user.ban_reason || 'Not stated') + '.');
                    return res.redirect('/login');
                }
            }

            // Record the sign-in time for the "Last seen" line on public
            // profiles. If it fails the login still goes ahead - it is only
            // a display detail, so it must not block anyone getting in.
            userModel.touchLastActive(user.id, (touchError) => {
                if (touchError) {
                    console.error('Could not update last_active:', touchError.message);
                }
            });

            // Store only what the pages actually need - never the password hash.
            req.session.user = {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            };

            // Admins and normal users land on different home pages.
            const destination = user.role === 'admin' ? '/admin' : '/';
            res.redirect(destination);
        });
    });
});

// My Account page. isLoggedIn stops anyone reaching it by typing the URL.
app.get('/profile', isLoggedIn, (req, res) => {
    // Read the user fresh from the database rather than trusting the session,
    // so an admin editing someone's details shows up straight away.
    userModel.findById(req.session.user.id, (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.send('Error retrieving your profile');
        }

        if (results.length === 0) {
            // The account was deleted while they were still logged in.
            return req.session.destroy(() => res.redirect('/login'));
        }

        const user = results[0];

        // Display-only values worked out from what the users table stores.
        const username = user.email.split('@')[0];

        const initials = user.name
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map(word => word.charAt(0).toUpperCase())
            .join('');

        const memberSince = new Date(user.created_at).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'long', year: 'numeric'
        });

        res.render('profile', {
            user: user,
            username: username,
            initials: initials,
            memberSince: memberSince
        });
    });
});

// Public profile of any member, e.g. /users/12
//
// This is the page a buyer lands on when they click a seller's name, and the
// same page a seller lands on when they click a buyer's name - it is one page
// used in both directions, the viewer just changes.
app.get('/users/:id', isLoggedIn, (req, res) => {
    const profileId = req.params.id;

    // Reject anything that is not a number before it reaches the database.
    if (!/^\d+$/.test(profileId)) {
        return res.status(404).send('Error: Member not found.');
    }

    // findPublicById only selects the safe columns - no password, email,
    // phone or ban reason - because anyone logged in can view this page.
    userModel.findPublicById(profileId, (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.send('Error retrieving member profile');
        }

        if (results.length === 0) {
            return res.status(404).send('Error: Member not found.');
        }

        const profile = results[0];

        userModel.getPublicStats(profileId, (statsError, statsResults) => {
            if (statsError) {
                console.error('Database query error:', statsError.message);
                return res.send('Error retrieving member statistics');
            }

            const stats = statsResults[0];

            // Percentage of reviews that were 4 stars or better.
            const positivePercent = stats.reviewCount > 0
                ? Math.round((stats.goodRatings / stats.reviewCount) * 100)
                : 0;

            // This member's currently-selling products, for the "Listings by X" section.
            productModel.getSellingProductsBySeller(profileId, (productsError, sellingProducts) => {
                if (productsError) {
                    console.error('Database query error:', productsError.message);
                    return res.send('Error retrieving member listings');
                }

                res.render('publicProfile', {
                    profile: profile,
                    stats: stats,
                    sellingProducts: sellingProducts,
                    username: profile.name.trim().toLowerCase().replace(/\s+/g, '.'),
                    initials: getInitials(profile.name),
                    firstName: profile.name.trim().split(/\s+/)[0],
                    lastSeen: describeLastSeen(profile.last_active),
                    membershipLength: describeMembership(profile.created_at),
                    positivePercent: positivePercent,
                    isGoodSeller: stats.reviewCount >= 3 && positivePercent >= 90,
                    isMe: req.session.user.id === profile.id
                });
            });
        });
    });
});

// Log out - clears the session and returns to the login page.
app.get('/logout', (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error('Error logging out:', error.message);
            return res.redirect('/');
        }
        res.redirect('/login');
    });
});


// ==================== Denna's routes ====================


// ==================== Zhen Cheng Chao's routes ====================

function getAppointmentFromBody(body) {
    return {
        appointmentDate: (body.appointmentDate || '').trim(),
        appointmentTime: (body.appointmentTime || '').trim(),
        meetingLocation: (body.meetingLocation || '').trim()
    };
}

function isValidAppointment(appointment) {
    return Boolean(
        appointment.appointmentDate &&
        appointment.appointmentTime &&
        appointment.meetingLocation &&
        appointment.meetingLocation.length <= 255
    );
}

// Display reservations where the logged-in user is either the buyer or seller.
app.get('/reservations', isLoggedIn, (req, res) => {
    reservationModel.getReservationsForUser(req.session.user.id, (error, reservations) => {
        if (error) {
            console.error('Error retrieving reservations:', error.message);
            return res.status(500).send('Error retrieving reservations');
        }

        res.render('reservations/index', {
            reservations,
            currentUser: req.session.user,
            errors: req.flash('error'),
            success: req.flash('success')
        });
    });
});

// Show the appointment form before creating a reservation.
app.get('/reservations/add/:productId', isLoggedIn, (req, res) => {
    productModel.getProductById(req.params.productId, (error, products) => {
        if (error) {
            console.error('Error retrieving product:', error.message);
            return res.status(500).send('Error retrieving product');
        }
        if (products.length === 0) {
            return res.status(404).send('Product not found');
        }

        const product = products[0];
        if (product.seller_id === req.session.user.id) {
            req.flash('error', 'You cannot reserve your own product.');
            return res.redirect('/products/' + product.id);
        }
        if (product.status !== 'selling' || product.quantity < 1) {
            req.flash('error', 'This product is not currently available for reservation.');
            return res.redirect('/products/' + product.id);
        }

        res.render('reservations/create', {
            product,
            currentUser: req.session.user,
            errors: req.flash('error'),
            formData: {}
        });
    });
});

// Create a pending reservation using the buyer's proposed appointment details.
app.post('/reservations/add/:productId', isLoggedIn, (req, res) => {
    const appointment = getAppointmentFromBody(req.body);
    if (!isValidAppointment(appointment)) {
        req.flash('error', 'Please provide a valid date, time and meeting location.');
        return res.redirect('/reservations/add/' + req.params.productId);
    }

    productModel.getProductById(req.params.productId, (productError, products) => {
        if (productError) {
            console.error('Error retrieving product:', productError.message);
            return res.status(500).send('Error retrieving product');
        }
        if (products.length === 0) {
            return res.status(404).send('Product not found');
        }

        const product = products[0];
        if (product.seller_id === req.session.user.id) {
            req.flash('error', 'You cannot reserve your own product.');
            return res.redirect('/products/' + product.id);
        }
        if (product.status !== 'selling' || product.quantity < 1) {
            req.flash('error', 'This product is no longer available.');
            return res.redirect('/products/' + product.id);
        }

        reservationModel.findActiveReservation(product.id, req.session.user.id, (duplicateError, existing) => {
            if (duplicateError) {
                console.error('Error checking reservation:', duplicateError.message);
                return res.status(500).send('Error checking reservation');
            }
            if (existing.length > 0) {
                req.flash('error', 'You already have an active reservation for this product.');
                return res.redirect('/reservations');
            }

            reservationModel.createReservation({
                productId: product.id,
                buyerId: req.session.user.id,
                sellerId: product.seller_id,
                ...appointment
            }, (createError) => {
                if (createError) {
                    console.error('Error creating reservation:', createError.message);
                    return res.status(500).send('Error creating reservation');
                }
                req.flash('success', 'Reservation request sent to the seller.');
                res.redirect('/reservations');
            });
        });
    });
});

// Show one reservation. Only its buyer or seller may view it.
app.get('/reservations/:id', isLoggedIn, (req, res) => {
    reservationModel.getReservationById(req.params.id, (error, reservations) => {
        if (error) {
            console.error('Error retrieving reservation:', error.message);
            return res.status(500).send('Error retrieving reservation');
        }
        if (reservations.length === 0) {
            return res.status(404).send('Reservation not found');
        }

        const reservation = reservations[0];
        const userId = req.session.user.id;
        if (reservation.buyer_id !== userId && reservation.seller_id !== userId) {
            return res.status(403).send('You do not have permission to view this reservation.');
        }

        res.render('reservations/details', {
            reservation,
            currentUser: req.session.user,
            errors: req.flash('error'),
            success: req.flash('success')
        });
    });
});

// Buyer edit form for a pending request or a seller's proposed appointment.
app.get('/reservations/:id/edit', isLoggedIn, (req, res) => {
    reservationModel.getReservationById(req.params.id, (error, reservations) => {
        if (error) {
            console.error('Error retrieving reservation:', error.message);
            return res.status(500).send('Error retrieving reservation');
        }
        if (reservations.length === 0) {
            return res.status(404).send('Reservation not found');
        }

        const reservation = reservations[0];
        if (reservation.buyer_id !== req.session.user.id || !['pending', 'proposed'].includes(reservation.status)) {
            req.flash('error', 'Only the buyer can edit a pending or proposed reservation.');
            return res.redirect('/reservations/' + reservation.id);
        }

        res.render('reservations/edit', {
            reservation,
            currentUser: req.session.user,
            errors: req.flash('error')
        });
    });
});

// Buyer updates their appointment request; a counter-proposal returns to pending.
app.post('/reservations/:id/update', isLoggedIn, (req, res) => {
    const appointment = getAppointmentFromBody(req.body);
    if (!isValidAppointment(appointment)) {
        req.flash('error', 'Please provide a valid date, time and meeting location.');
        return res.redirect('/reservations/' + req.params.id + '/edit');
    }

    reservationModel.updateBuyerProposal(req.params.id, req.session.user.id, appointment, (error, result) => {
        if (error) {
            console.error('Error updating reservation:', error.message);
            return res.status(500).send('Error updating reservation');
        }
        if (result.affectedRows === 0) {
            req.flash('error', 'The reservation could not be updated.');
        } else {
            req.flash('success', 'Your appointment request was updated.');
        }
        res.redirect('/reservations/' + req.params.id);
    });
});

// Seller proposes a different appointment to the buyer.
app.post('/reservations/:id/propose', isLoggedIn, (req, res) => {
    const appointment = getAppointmentFromBody(req.body);
    if (!isValidAppointment(appointment)) {
        req.flash('error', 'Please provide a valid proposed date, time and meeting location.');
        return res.redirect('/reservations/' + req.params.id);
    }

    reservationModel.proposeAppointment(req.params.id, req.session.user.id, appointment, (error, result) => {
        if (error) {
            console.error('Error proposing appointment:', error.message);
            return res.status(500).send('Error proposing appointment');
        }
        if (result.affectedRows === 0) {
            req.flash('error', 'Only the seller can propose an appointment for an active request.');
        } else {
            req.flash('success', 'Your appointment proposal was sent to the buyer.');
        }
        res.redirect('/reservations/' + req.params.id);
    });
});

// Seller accepts the buyer's pending appointment request.
app.post('/reservations/:id/confirm', isLoggedIn, (req, res) => {
    reservationModel.confirmReservation(req.params.id, req.session.user.id, (error) => {
        if (error) {
            console.error('Error confirming reservation:', error.message);
            req.flash('error', error.code === 'INVALID_RESERVATION_STATE'
                ? error.message
                : 'The reservation could not be confirmed.');
        } else {
            req.flash('success', 'Reservation confirmed. The product is now reserved.');
        }
        res.redirect('/reservations/' + req.params.id);
    });
});

// Buyer accepts the seller's proposed appointment.
app.post('/reservations/:id/accept', isLoggedIn, (req, res) => {
    reservationModel.acceptProposal(req.params.id, req.session.user.id, (error) => {
        if (error) {
            console.error('Error accepting proposal:', error.message);
            req.flash('error', error.code === 'INVALID_RESERVATION_STATE'
                ? error.message
                : 'The proposal could not be accepted.');
        } else {
            req.flash('success', 'Appointment accepted. The product is now reserved.');
        }
        res.redirect('/reservations/' + req.params.id);
    });
});

// Buyer or seller cancels an active reservation.
app.post('/reservations/:id/cancel', isLoggedIn, (req, res) => {
    reservationModel.cancelReservation(req.params.id, req.session.user.id, (error) => {
        if (error) {
            console.error('Error cancelling reservation:', error.message);
            req.flash('error', error.code === 'INVALID_RESERVATION_STATE'
                ? error.message
                : 'The reservation could not be cancelled.');
        } else {
            req.flash('success', 'Reservation cancelled.');
        }
        res.redirect('/reservations/' + req.params.id);
    });
});

// Buyer permanently deletes a pending or cancelled reservation (CRUD Delete).
app.post('/reservations/:id/delete', isLoggedIn, (req, res) => {
    reservationModel.deleteReservation(req.params.id, req.session.user.id, (error, result) => {
        if (error) {
            console.error('Error deleting reservation:', error.message);
            return res.status(500).send('Error deleting reservation');
        }
        if (result.affectedRows === 0) {
            req.flash('error', 'Only the buyer can delete a pending or cancelled reservation.');
        } else {
            req.flash('success', 'Reservation deleted.');
        }
        res.redirect('/reservations');
    });
});

// Seller completes a confirmed reservation. The model records the purchase and updates stock atomically.
app.post('/reservations/:id/complete', isLoggedIn, (req, res) => {
    reservationModel.completeReservation(req.params.id, req.session.user.id, (error) => {
        if (error) {
            console.error('Error completing reservation:', error.message);
            req.flash('error', error.code === 'INVALID_RESERVATION_STATE'
                ? error.message
                : 'The reservation could not be completed.');
        } else {
            req.flash('success', 'Reservation completed and purchase recorded.');
        }
        res.redirect('/reservations/' + req.params.id);
    });
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
    console.log(`Server started on http://localhost:${PORT}`);
});
