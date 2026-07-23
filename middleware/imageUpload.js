const fs = require('fs');
const path = require('path');
const multer = require('multer');

const imageRoot = path.join(__dirname, '..', 'public', 'images');
const defaultMaxFileSize = 5 * 1024 * 1024;
const allowedImageTypes = new Map([
    ['image/jpeg', '.jpg'],
    ['image/png', '.png'],
    ['image/gif', '.gif'],
    ['image/webp', '.webp']
]);

// Build a feature-specific image uploader from one shared configuration.
function createImageUpload(folderName, options = {}) {
    const uploadDirectory = path.join(imageRoot, folderName);
    const maxFileSize = options.maxFileSize || defaultMaxFileSize;

    fs.mkdirSync(uploadDirectory, { recursive: true });

    const storage = multer.diskStorage({
        destination: (req, file, callback) => {
            callback(null, uploadDirectory);
        },
        filename: (req, file, callback) => {
            const extension = allowedImageTypes.get(file.mimetype);
            const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;
            callback(null, uniqueName);
        }
    });

    const upload = multer({
        storage,
        limits: { fileSize: maxFileSize },
        fileFilter: (req, file, callback) => {
            if (!allowedImageTypes.has(file.mimetype)) {
                return callback(new Error('Only JPEG, PNG, GIF, and WebP images are allowed'));
            }
            callback(null, true);
        }
    });

    return { upload, uploadDirectory };
}

const productImages = createImageUpload('products');
const reportImages = createImageUpload('reports');
const ratingImages = createImageUpload('ratings');

module.exports = {
    createImageUpload,
    productUpload: productImages.upload,
    reportUpload: reportImages.upload,
    ratingUpload: ratingImages.upload.single('image'),
    ratingUploadDirectory: ratingImages.uploadDirectory
};
