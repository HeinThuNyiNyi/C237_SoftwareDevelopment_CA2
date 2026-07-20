const db = require('../config/db');

// Ratings: main fields (product_id/buyer_id/seller_id) follow Thiha-Aung's
// existing table. This feature only adds an anonymous flag, an updated_at
// timestamp, and media attachments (rating_media).

// Average rating + review count for one product, counting only reviews from
// buyers who actually completed a purchase of that product.
function getSummaryByProductId(productId, callback) {
    const sql = `SELECT
                    COALESCE(ROUND(AVG(r.rating), 1), 0) AS average_rating,
                    COUNT(*) AS review_count
                 FROM ratings r
                 WHERE r.product_id = ?
                   AND EXISTS (
                        SELECT 1
                        FROM purchases p
                        WHERE p.buyer_id = r.buyer_id
                          AND p.product_id = r.product_id
                   )`;
    db.query(sql, [productId], (error, rows) => {
        if (error) {
            return callback(error);
        }
        callback(null, {
            averageRating: Number(rows[0].average_rating),
            reviewCount: Number(rows[0].review_count)
        });
    });
}

// Same summary, batched for a list of products (homepage / browse grids).
// Returns a Map keyed by numeric product id.
function getSummariesByProductIds(productIds, callback) {
    if (!productIds.length) {
        return callback(null, new Map());
    }

    const placeholders = productIds.map(() => '?').join(', ');
    const sql = `SELECT
                    r.product_id,
                    ROUND(AVG(r.rating), 1) AS average_rating,
                    COUNT(*) AS review_count
                 FROM ratings r
                 WHERE r.product_id IN (${placeholders})
                   AND EXISTS (
                        SELECT 1
                        FROM purchases p
                        WHERE p.buyer_id = r.buyer_id
                          AND p.product_id = r.product_id
                   )
                 GROUP BY r.product_id`;
    db.query(sql, productIds, (error, rows) => {
        if (error) {
            return callback(error);
        }
        const summaries = new Map(rows.map((row) => [Number(row.product_id), {
            averageRating: Number(row.average_rating),
            reviewCount: Number(row.review_count)
        }]));
        callback(null, summaries);
    });
}

// Public reviews for the "ratings & reviews" page, newest-updated first,
// with each review's media grouped into an array.
function getPublicReviewsByProductId(productId, callback) {
    const sql = `SELECT
                    r.id,
                    r.rating,
                    r.comment,
                    r.is_anonymous,
                    r.created_at,
                    r.updated_at,
                    u.name AS buyer_name,
                    m.id AS media_id,
                    m.media_type,
                    m.file_path,
                    m.original_name
                 FROM ratings r
                 JOIN users u ON u.id = r.buyer_id
                 LEFT JOIN rating_media m ON m.rating_id = r.id
                 WHERE r.product_id = ?
                   AND EXISTS (
                        SELECT 1
                        FROM purchases p
                        WHERE p.buyer_id = r.buyer_id
                          AND p.product_id = r.product_id
                   )
                 ORDER BY r.updated_at DESC, m.id`;
    db.query(sql, [productId], (error, rows) => {
        if (error) {
            return callback(error);
        }

        const reviewsById = new Map();

        for (const row of rows) {
            if (!reviewsById.has(row.id)) {
                reviewsById.set(row.id, {
                    id: row.id,
                    rating: Number(row.rating),
                    comment: row.comment,
                    isAnonymous: Boolean(row.is_anonymous),
                    authorLabel: row.is_anonymous ? 'Anonymous student' : row.buyer_name,
                    createdAt: row.created_at,
                    updatedAt: row.updated_at,
                    media: []
                });
            }

            if (row.media_id) {
                reviewsById.get(row.id).media.push({
                    id: row.media_id,
                    mediaType: row.media_type,
                    filePath: row.file_path,
                    originalName: row.original_name
                });
            }
        }

        callback(null, [...reviewsById.values()]);
    });
}

// This buyer's own rating for this product (if any), with its media - used
// to pre-fill the "write/edit a review" form.
function findByProductAndBuyer(productId, buyerId, callback) {
    const ratingSql = `SELECT id, product_id, buyer_id, seller_id, rating, comment,
                               is_anonymous, created_at, updated_at
                        FROM ratings
                        WHERE product_id = ? AND buyer_id = ?
                        LIMIT 1`;
    db.query(ratingSql, [productId, buyerId], (error, ratingRows) => {
        if (error) {
            return callback(error);
        }
        if (!ratingRows.length) {
            return callback(null, null);
        }

        const currentRating = ratingRows[0];
        const mediaSql = `SELECT id, media_type, file_path, original_name, mime_type, size_bytes
                           FROM rating_media
                           WHERE rating_id = ?
                           ORDER BY id`;
        db.query(mediaSql, [currentRating.id], (mediaError, mediaRows) => {
            if (mediaError) {
                return callback(mediaError);
            }
            callback(null, {
                ...currentRating,
                is_anonymous: Boolean(currentRating.is_anonymous),
                media: mediaRows
            });
        });
    });
}

// Create or update a buyer's rating for a product, replacing its media when
// new files were uploaded or the buyer asked to remove existing media.
// Returns { ratingId, oldMediaPaths } - oldMediaPaths are the media files
// that were just replaced, for the caller to delete from disk.
function upsert({ productId, buyerId, sellerId, rating, comment, isAnonymous, mediaFiles, replaceMedia }, callback) {
    db.beginTransaction((transactionError) => {
        if (transactionError) {
            return callback(transactionError);
        }

        const upsertSql = `INSERT INTO ratings
                                (product_id, buyer_id, seller_id, rating, comment, is_anonymous)
                            VALUES (?, ?, ?, ?, ?, ?)
                            ON DUPLICATE KEY UPDATE
                                id = LAST_INSERT_ID(id),
                                seller_id = VALUES(seller_id),
                                rating = VALUES(rating),
                                comment = VALUES(comment),
                                is_anonymous = VALUES(is_anonymous),
                                updated_at = CURRENT_TIMESTAMP`;
        const upsertParams = [productId, buyerId, sellerId, rating, comment, isAnonymous ? 1 : 0];

        db.query(upsertSql, upsertParams, (upsertError, result) => {
            if (upsertError) {
                return db.rollback(() => callback(upsertError));
            }

            const ratingId = result.insertId;

            if (!replaceMedia) {
                return db.commit((commitError) => {
                    if (commitError) {
                        return db.rollback(() => callback(commitError));
                    }
                    callback(null, { ratingId, oldMediaPaths: [] });
                });
            }

            db.query('SELECT file_path FROM rating_media WHERE rating_id = ? FOR UPDATE', [ratingId], (selectError, oldMediaRows) => {
                if (selectError) {
                    return db.rollback(() => callback(selectError));
                }

                const oldMediaPaths = oldMediaRows.map((row) => row.file_path);

                db.query('DELETE FROM rating_media WHERE rating_id = ?', [ratingId], (deleteError) => {
                    if (deleteError) {
                        return db.rollback(() => callback(deleteError));
                    }

                    insertMediaFiles(ratingId, mediaFiles, (insertError) => {
                        if (insertError) {
                            return db.rollback(() => callback(insertError));
                        }

                        db.commit((commitError) => {
                            if (commitError) {
                                return db.rollback(() => callback(commitError));
                            }
                            callback(null, { ratingId, oldMediaPaths });
                        });
                    });
                });
            });
        });
    });
}

// Inserts each uploaded media file one at a time, in order, so the whole
// batch can still be rolled back together on the first failure.
function insertMediaFiles(ratingId, mediaFiles, callback) {
    const insertSql = `INSERT INTO rating_media
                            (rating_id, media_type, file_path, original_name, mime_type, size_bytes)
                        VALUES (?, ?, ?, ?, ?, ?)`;

    const insertNext = (index) => {
        if (index >= mediaFiles.length) {
            return callback(null);
        }

        const file = mediaFiles[index];
        const mediaType = file.mimetype.startsWith('image/') ? 'image' : 'video';
        const params = [
            ratingId,
            mediaType,
            `/uploads/ratings/${file.filename}`,
            file.originalname,
            file.mimetype,
            file.size
        ];

        db.query(insertSql, params, (error) => {
            if (error) {
                return callback(error);
            }
            insertNext(index + 1);
        });
    };

    insertNext(0);
}

module.exports = {
    getSummaryByProductId,
    getSummariesByProductIds,
    getPublicReviewsByProductId,
    findByProductAndBuyer,
    upsert
};
