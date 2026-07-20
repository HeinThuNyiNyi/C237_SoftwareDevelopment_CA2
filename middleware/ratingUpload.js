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

// 第一次启动时自动建立上传目录，避免服务器因目录不存在而失败。
fs.mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, callback) => {
        callback(null, uploadDirectory);
    },
    filename: (req, file, callback) => {
        const extension = path.extname(file.originalname).toLowerCase();
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
        const isImage = file.mimetype.startsWith('image/');
        const isVideo = file.mimetype.startsWith('video/');

        if (!isImage && !isVideo) {
            return callback(new Error('Only image and video files are allowed'));
        }

        callback(null, true);
    }
});

// 图片最多 4 张，短视频最多 1 个。
const ratingUpload = upload.fields([
    { name: 'images', maxCount: 4 },
    { name: 'videos', maxCount: 1 }
]);

module.exports = {
    ratingUpload,
    uploadDirectory
};
