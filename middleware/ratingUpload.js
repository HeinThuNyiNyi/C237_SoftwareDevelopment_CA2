const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const uploadDirectory = path.join(
    __dirname,
    '..',
    'public',
    'uploads',
    'ratings'
);

// 只允许浏览器可安全展示的常见格式；SVG 和任意压缩包不会进入公开目录。
const allowedMimeExtensions = new Map([
    ['image/jpeg', '.jpg'],
    ['image/png', '.png'],
    ['image/webp', '.webp'],
    ['image/gif', '.gif'],
    ['video/mp4', '.mp4'],
    ['video/webm', '.webm'],
    ['video/quicktime', '.mov']
]);

// 第一次启动时自动建立上传目录，避免服务器因目录不存在而失败。
fs.mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, callback) => {
        callback(null, uploadDirectory);
    },
    filename: (req, file, callback) => {
        // 扩展名由允许的 MIME 类型决定，不信任用户提供的原始文件名。
        const extension = allowedMimeExtensions.get(file.mimetype);
        const safeName = `${Date.now()}-${crypto.randomUUID()}${extension}`;
        callback(null, safeName);
    }
});

const upload = multer({
    storage,
    limits: {
        files: 5,
        // 单个文件最大 25 MB，足够短视频，同时防止过大的请求占满服务器磁盘。
        fileSize: 25 * 1024 * 1024
    },
    fileFilter: (req, file, callback) => {
        if (!allowedMimeExtensions.has(file.mimetype)) {
            return callback(new Error('Only JPG, PNG, WebP, GIF, MP4, WebM and MOV files are allowed'));
        }

        callback(null, true);
    }
});

// 图片最多 4 张，短视频最多 1 个。
const parseRatingUpload = upload.fields([
    { name: 'images', maxCount: 4 },
    { name: 'videos', maxCount: 1 }
]);

function getUploadedFiles(req) {
    return Object.values(req.files || {}).flat();
}

function discardUploadedFiles(req) {
    for (const file of getUploadedFiles(req)) {
        fs.unlink(file.path, () => {});
    }
}

// Convert expected upload failures into a useful form message instead of a
// generic 500 response. Multer may already have written earlier files when a
// later file fails, so remove those partial uploads before returning.
function ratingUpload(req, res, next) {
    parseRatingUpload(req, res, (error) => {
        if (!error) {
            return next();
        }

        discardUploadedFiles(req);

        let message = 'The attachments could not be uploaded.';
        if (error.code === 'LIMIT_FILE_SIZE') {
            message = 'Each attachment must be 25 MB or smaller.';
        } else if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
            message = 'You can upload up to four images and one video.';
        } else if (
            error.message === 'Only image and video files are allowed'
            || error.message.startsWith('Only JPG, PNG, WebP')
        ) {
            message = error.message;
        }

        req.flash('error', message);
        return res.redirect(`/details/${req.params.id}/rating/new`);
    });
}

module.exports = {
    ratingUpload,
    uploadDirectory,
    getUploadedFiles,
    allowedMimeExtensions
};
