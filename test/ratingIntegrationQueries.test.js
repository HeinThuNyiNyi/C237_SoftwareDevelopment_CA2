const assert = require('node:assert/strict');
const test = require('node:test');

function loadModelWithQuery(modelPath, query) {
    const dbPath = require.resolve('../config/db');
    const resolvedModelPath = require.resolve(modelPath);
    const previousDbModule = require.cache[dbPath];
    const previousModelModule = require.cache[resolvedModelPath];

    require.cache[dbPath] = {
        id: dbPath,
        filename: dbPath,
        loaded: true,
        exports: { query }
    };
    delete require.cache[resolvedModelPath];
    const model = require(modelPath);

    return {
        model,
        restore() {
            delete require.cache[resolvedModelPath];
            if (previousModelModule) require.cache[resolvedModelPath] = previousModelModule;
            if (previousDbModule) require.cache[dbPath] = previousDbModule;
            else delete require.cache[dbPath];
        }
    };
}

test('purchase history includes whether each product has an existing review', async () => {
    let capturedSql;
    const loaded = loadModelWithQuery('../models/purchaseModel', (sql, params, callback) => {
        capturedSql = sql;
        assert.deepEqual(params, [8]);
        callback(null, []);
    });

    try {
        await new Promise((resolve, reject) => {
            loaded.model.getPurchasesByBuyer(8, (error) => error ? reject(error) : resolve());
        });
        assert.match(capturedSql, /LEFT JOIN ratings/);
        assert.match(capturedSql, /ratings\.buyer_id = purchases\.buyer_id/);
        assert.match(capturedSql, /ratings\.id AS ratingId/);
    } finally {
        loaded.restore();
    }
});

test('seller statistics count only ratings backed by a completed purchase', async () => {
    let capturedSql;
    const loaded = loadModelWithQuery('../models/userModel', (sql, params, callback) => {
        capturedSql = sql;
        assert.deepEqual(params, [9, 9, 9, 9, 9]);
        callback(null, [{ reviewCount: 0, averageRating: null, goodRatings: 0 }]);
    });

    try {
        await new Promise((resolve, reject) => {
            loaded.model.getPublicStats(9, (error) => error ? reject(error) : resolve());
        });
        assert.equal((capturedSql.match(/EXISTS/g) || []).length, 3);
        assert.equal((capturedSql.match(/p\.buyer_id = r\.buyer_id/g) || []).length, 3);
        assert.equal((capturedSql.match(/p\.product_id = r\.product_id/g) || []).length, 3);
    } finally {
        loaded.restore();
    }
});
