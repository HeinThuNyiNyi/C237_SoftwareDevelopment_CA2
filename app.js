require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const bcrypt = require('bcrypt');
const productModel = require('./models/productModel');
const categoryModel = require('./models/categoryModel');
const userModel = require('./models/userModel');
const reservationModel = require('./models/reservationModel');
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
        res.render('productDetails', {
            product: results[0],
            currentUser: req.session.user || null,
            errors: req.flash('error'),
            success: req.flash('success')
        });
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

        // The navbar dropdown needs the category list, same as the other pages.
        categoryModel.getAllCategories((catError, categories) => {
            if (catError) {
                console.error('Database query error:', catError.message);
                return res.send('Error retrieving categories');
            }

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
                categories: categories,
                username: username,
                initials: initials,
                memberSince: memberSince
            });
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

            categoryModel.getAllCategories((catError, categories) => {
                if (catError) {
                    console.error('Database query error:', catError.message);
                    return res.send('Error retrieving categories');
                }

                // Percentage of reviews that were 4 stars or better.
                const positivePercent = stats.reviewCount > 0
                    ? Math.round((stats.goodRatings / stats.reviewCount) * 100)
                    : 0;

                res.render('publicProfile', {
                    profile: profile,
                    stats: stats,
                    categories: categories,
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
