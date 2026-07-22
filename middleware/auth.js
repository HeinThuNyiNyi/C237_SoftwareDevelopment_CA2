// Route guards for the login / profile feature.
// Import these in app.js and put them in front of any route that
// should not be reachable by just typing the URL.

const RP_DOMAIN = '@myrp.edu.sg';

// Blocks anyone who is not logged in.
function isLoggedIn(req, res, next) {
    if (req.session.user) {
        return next();
    }
    req.flash('error', 'Please log in to continue.');
    res.redirect('/login');
}

// Blocks anyone who is not an admin. Checks the role stored in the
// session at login time, so a normal user cannot reach /admin pages.
function isAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    }

    if (!req.session.user) {
        req.flash('error', 'Please log in as an admin to continue.');
        return res.redirect('/login');
    }

    req.flash('error', 'You do not have permission to view that page.');
    res.redirect('/');
}

// Sends an already-logged-in person away from the login page instead of
// showing them the form again.
function isGuest(req, res, next) {
    if (!req.session.user) {
        return next();
    }
    const destination = req.session.user.role === 'admin' ? '/admin' : '/';
    res.redirect(destination);
}

// Server-side check of the login form. The HTML form validates too, but a
// browser check can be bypassed, so the real check has to happen here.
function validateLogin(req, res, next) {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';

    if (!email || !password) {
        req.flash('error', 'Please enter both your school email and password.');
        req.flash('email', email);
        return res.redirect('/login');
    }

    if (!email.endsWith(RP_DOMAIN)) {
        req.flash('error', 'Please use your RP school email (must end with ' + RP_DOMAIN + ').');
        req.flash('email', email);
        return res.redirect('/login');
    }

    // Hand the cleaned-up values to the route so it does not repeat the work.
    req.body.email = email;
    next();
}

module.exports = {
    isLoggedIn,
    isAdmin,
    isGuest,
    validateLogin,
    RP_DOMAIN
};
