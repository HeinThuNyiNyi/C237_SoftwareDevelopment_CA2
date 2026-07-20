// ============================================================
// Password hashing with SHA-1  (Hein Thu Nyi Nyi)
//
// SHA-1 is the algorithm covered in the module, so it is the one used
// here. It is a ONE-WAY function: a password can be hashed and the
// hashes compared, but a stored hash can never be turned back into the
// original password. That is why the profile page shows dots instead of
// the real password, and why a forgotten password has to be reset
// rather than looked up.
//
// crypto is built into Node, so nothing extra needs installing.
//
// Note for the report: SHA-1 is fast by design, which makes it easy to
// brute-force, and it is no longer recommended for real password
// storage. Purpose-built password hashes such as bcrypt are slow on
// purpose to make guessing expensive. SHA-1 is used here because it is
// the algorithm required by the module.
// ============================================================

const crypto = require('crypto');

// Turn a plain password into a 40 character SHA-1 hex string.
//   "Student@123"  ->  "9b8b1c...e4f2"
function hashPassword(password) {
    return crypto
        .createHash('sha1')
        .update(password)
        .digest('hex');
}

// Check a typed password against a stored hash.
//
// The typed password is hashed and the two hashes are compared, because
// the stored hash cannot be reversed.
//
// timingSafeEqual is used instead of === so that the comparison always
// takes the same amount of time. A plain === stops early at the first
// wrong character, and that tiny timing difference can leak information
// about the stored hash.
function verifyPassword(password, storedHash) {
    if (!storedHash) {
        return false;
    }

    const typedHash = hashPassword(password);

    // Different lengths mean it cannot be a match, and timingSafeEqual
    // throws if the two buffers are not the same size.
    if (typedHash.length !== storedHash.length) {
        return false;
    }

    return crypto.timingSafeEqual(
        Buffer.from(typedHash),
        Buffer.from(storedHash)
    );
}

module.exports = {
    hashPassword,
    verifyPassword
};
