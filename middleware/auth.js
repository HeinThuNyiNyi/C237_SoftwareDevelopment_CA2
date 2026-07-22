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
//
// The two failure cases are treated differently on purpose. Sending a
// logged-out admin to "/" was confusing, because "/" redirects to
// /browse - so a session that had quietly expired looked like the admin
// link had dumped them on the products page with no explanation.
function isAdmin(req, res, next) {
    // Not logged in at all, most often an expired session. Send them to
    // the login page so they can get straight back in.
    if (!req.session.user) {
        req.flash('error', 'Your session has ended. Please log in again to open the admin pages.');
        return res.redirect('/login');
    }

    // Logged in, but as a student. They stay on the site, with a reason.
    if (req.session.user.role !== 'admin') {
        req.flash('error', 'You do not have permission to view that page.');
        return res.redirect('/');
    }

    next();
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

// Server-side check of the registration form, following the same
// validateRegistration middleware pattern taught in the module: check the
// required fields, check the password length, flash an error together with
// the submitted values and redirect back to the form; otherwise call next()
// so the request carries on to the route handler.
//
// The RP domain rule is the one extra check this application needs, and it
// belongs here rather than in the HTML, because a check in the browser can
// be bypassed by sending the request directly.
function validateRegistration(req, res, next) {
    const name = (req.body.name || '').trim();
    const username = (req.body.username || '').trim().toLowerCase();
    const phone = (req.body.phone || '').trim();
    const password = req.body.password || '';
    const confirmPassword = req.body.confirmPassword || '';

    // Sends the user back to the form with the message, keeping what they
    // already typed so they do not have to fill it in again.
    const reject = (message) => {
        req.flash('error', message);
        req.flash('formData', { name: name, username: username, phone: phone });
        return res.redirect('/register');
    };

    if (!name || !username || !password) {
        return reject('All fields are required.');
    }

    if (password.length < 6) {
        return reject('Password should be at least 6 or more characters long.');
    }

    if (password !== confirmPassword) {
        return reject('The two passwords do not match.');
    }

    // Only the characters an RP school email actually uses.
    if (!/^[a-z0-9._-]+$/.test(username)) {
        return reject('Your school email can only contain letters, numbers, dots, dashes and underscores.');
    }

    if (phone && !/^[0-9+\s-]{6,20}$/.test(phone)) {
        return reject('Please enter a valid contact number.');
    }

    // Build the full school email on the SERVER, so a non-RP address cannot
    // be submitted even if someone edits the page.
    req.body.name = name;
    req.body.email = username + RP_DOMAIN;
    req.body.phone = phone;

    // All validations passed, so next() lets the request proceed to the
    // route handler that inserts the new user.
    next();
}

module.exports = {
    isLoggedIn,
    isAdmin,
    isGuest,
    validateLogin,
    validateRegistration,
    RP_DOMAIN
};
