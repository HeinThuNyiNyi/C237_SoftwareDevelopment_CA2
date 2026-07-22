const assert = require('node:assert/strict');
const test = require('node:test');

const dbPath = require.resolve('../config/db');
const ratingModelPath = require.resolve('../models/ratingModel');

function loadRatingModel(connection, sharedQuery) {
    const previousDbModule = require.cache[dbPath];
    const previousRatingModule = require.cache[ratingModelPath];
    const db = {
        query(...args) {
            if (sharedQuery) {
                return sharedQuery(...args);
            }
            throw new Error('Transactional writes must not use the shared connection');
        },
        getTransactionConnection(callback) {
            callback(null, connection);
        }
    };

    require.cache[dbPath] = {
        id: dbPath,
        filename: dbPath,
        loaded: true,
        exports: db
    };
    delete require.cache[ratingModelPath];
    const ratingModel = require('../models/ratingModel');

    return {
        ratingModel,
        restore() {
            delete require.cache[ratingModelPath];
            if (previousRatingModule) {
                require.cache[ratingModelPath] = previousRatingModule;
            }
            if (previousDbModule) {
                require.cache[dbPath] = previousDbModule;
            } else {
                delete require.cache[dbPath];
            }
        }
    };
}

test('seller profile reviews expose verified public fields and preserve anonymity', async () => {
    const rows = [{
        id: 12,
        product_id: 7,
        product_name: 'USB-C charger',
        rating: 4,
        comment: 'Works well',
        is_anonymous: 1,
        buyer_name: 'Hidden Buyer',
        created_at: new Date('2026-07-01T00:00:00Z'),
        updated_at: new Date('2026-07-02T00:00:00Z')
    }];
    let capturedSql;
    const loaded = loadRatingModel({}, (sql, params, callback) => {
        capturedSql = sql;
        assert.deepEqual(params, [9]);
        callback(null, rows);
    });

    try {
        const reviews = await new Promise((resolve, reject) => {
            loaded.ratingModel.getPublicReviewsBySellerId(9, (error, value) =>
                error ? reject(error) : resolve(value));
        });

        assert.match(capturedSql, /EXISTS/);
        assert.match(capturedSql, /p\.buyer_id = r\.buyer_id/);
        assert.equal(reviews[0].authorLabel, 'Anonymous student');
        assert.equal(reviews[0].productName, 'USB-C charger');
        assert.equal(reviews[0].buyerId, undefined);
    } finally {
        loaded.restore();
    }
});

test('upsert commits on an isolated connection and releases it', async () => {
    const events = [];
    const connection = {
        beginTransaction(callback) { events.push('begin'); callback(null); },
        query(sql, params, callback) {
            events.push('upsert');
            callback(null, { insertId: 42 });
        },
        commit(callback) { events.push('commit'); callback(null); },
        rollback(callback) { events.push('rollback'); callback(); },
        release() { events.push('release'); }
    };
    const loaded = loadRatingModel(connection);

    try {
        const result = await new Promise((resolve, reject) => {
            loaded.ratingModel.upsert({
                productId: 7,
                buyerId: 8,
                sellerId: 9,
                rating: 5,
                comment: 'Great condition',
                isAnonymous: false,
                mediaFiles: [],
                replaceMedia: false
            }, (error, value) => error ? reject(error) : resolve(value));
        });

        assert.deepEqual(result, { ratingId: 42, oldMediaPaths: [] });
        assert.deepEqual(events, ['begin', 'upsert', 'commit', 'release']);
    } finally {
        loaded.restore();
    }
});

test('delete removes only the buyer-owned review and returns media paths', async () => {
    const events = [];
    let queryIndex = 0;
    const responses = [
        [{ id: 42 }],
        [{ file_path: '/uploads/ratings/photo.jpg' }],
        { affectedRows: 1 }
    ];
    const connection = {
        beginTransaction(callback) { events.push('begin'); callback(null); },
        query(sql, params, callback) {
            events.push({ sql, params });
            callback(null, responses[queryIndex++]);
        },
        commit(callback) { events.push('commit'); callback(null); },
        rollback(callback) { events.push('rollback'); callback(); },
        release() { events.push('release'); }
    };
    const loaded = loadRatingModel(connection);

    try {
        const result = await new Promise((resolve, reject) => {
            loaded.ratingModel.deleteByProductAndBuyer(7, 8, (error, value) =>
                error ? reject(error) : resolve(value));
        });

        assert.deepEqual(result, {
            deleted: true,
            oldMediaPaths: ['/uploads/ratings/photo.jpg']
        });
        assert.deepEqual(events.at(-2), 'commit');
        assert.deepEqual(events.at(-1), 'release');
        assert.match(events[3].sql, /buyer_id = \?/);
        assert.deepEqual(events[3].params, [42, 8]);
    } finally {
        loaded.restore();
    }
});

test('upsert rolls back and releases when media persistence fails', async () => {
    const events = [];
    let queryIndex = 0;
    const connection = {
        beginTransaction(callback) { events.push('begin'); callback(null); },
        query(sql, params, callback) {
            queryIndex += 1;
            events.push(`query-${queryIndex}`);
            if (queryIndex === 1) return callback(null, { insertId: 42 });
            if (queryIndex === 2) return callback(null, []);
            if (queryIndex === 3) return callback(null, { affectedRows: 0 });
            return callback(new Error('media insert failed'));
        },
        commit(callback) { events.push('commit'); callback(null); },
        rollback(callback) { events.push('rollback'); callback(); },
        release() { events.push('release'); }
    };
    const loaded = loadRatingModel(connection);

    try {
        await assert.rejects(new Promise((resolve, reject) => {
            loaded.ratingModel.upsert({
                productId: 7,
                buyerId: 8,
                sellerId: 9,
                rating: 4,
                comment: null,
                isAnonymous: true,
                mediaFiles: [{
                    filename: 'photo.jpg',
                    originalname: 'photo.jpg',
                    mimetype: 'image/jpeg',
                    size: 100
                }],
                replaceMedia: true
            }, (error, value) => error ? reject(error) : resolve(value));
        }), /media insert failed/);

        assert.deepEqual(events.slice(-2), ['rollback', 'release']);
        assert.equal(events.includes('commit'), false);
    } finally {
        loaded.restore();
    }
});
