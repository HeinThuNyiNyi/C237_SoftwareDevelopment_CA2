const fs = require('fs');
const multer = require('multer');

const uploadDirectory = 'public/images/products';

// Created once on startup so the app doesn't fail if the folder is missing.
fs.mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, callback) => {
        callback(null, uploadDirectory);
    },
    filename: (req, file, callback) => {
        callback(null, file.originalname);
    }
});

const productUpload = multer({ storage: storage });

module.exports = { productUpload, uploadDirectory };
