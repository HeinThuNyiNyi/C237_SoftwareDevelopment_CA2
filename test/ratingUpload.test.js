const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { getUploadedFiles, uploadDirectory } = require('../middleware/ratingUpload');

test('getUploadedFiles combines image and video fields', () => {
    const image = { filename: 'image.jpg' };
    const video = { filename: 'video.mp4' };

    assert.deepEqual(getUploadedFiles({
        files: { images: [image], videos: [video] }
    }), [image, video]);
});

test('getUploadedFiles accepts requests without attachments', () => {
    assert.deepEqual(getUploadedFiles({}), []);
});

test('rating upload directory is created inside public/uploads', () => {
    assert.equal(fs.existsSync(uploadDirectory), true);
    assert.equal(path.basename(uploadDirectory), 'ratings');
    assert.equal(path.basename(path.dirname(uploadDirectory)), 'uploads');
});
