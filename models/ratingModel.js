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

// Verified reviews received by one seller, shown on their public profile.
// Anonymous reviews keep their buyer relationship in the database while only
// exposing a neutral label to the view.
function getPublicReviewsBySellerId(sellerId, callback) {
    const sql = `SELECT
                    r.id,
                    r.product_id,
                    r.rating,
                    r.comment,
                    r.is_anonymous,
                    r.created_at,
                    r.updated_at,
                    products.name AS product_name,
                    users.name AS buyer_name
                 FROM ratings r
                 JOIN products ON products.id = r.product_id
                 JOIN users ON users.id = r.buyer_id
                 WHERE r.seller_id = ?
                   AND EXISTS (
                        SELECT 1
                        FROM purchases p
                        WHERE p.buyer_id = r.buyer_id
                          AND p.product_id = r.product_id
                   )
                 ORDER BY r.updated_at DESC, r.id DESC`;

    db.query(sql, [sellerId], (error, rows) => {
        if (error) {
            return callback(error);
        }

        callback(null, rows.map((row) => ({
            id: row.id,
            productId: row.product_id,
            productName: row.product_name,
            rating: Number(row.rating),
            comment: row.comment,
            isAnonymous: Boolean(row.is_anonymous),
            authorLabel: row.is_anonymous ? 'Anonymous student' : row.buyer_name,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        })));
    });
}

function runInTransaction(operation, callback) {
    db.getTransactionConnection((connectionError, connection) => {
        if (connectionError) {
            return callback(connectionError);
        }

        connection.beginTransaction((transactionError) => {
            if (transactionError) {
                connection.release();
                return callback(transactionError);
            }

            let finished = false;
            const finish = (error, result) => {
                if (finished) {
                    return;
                }
                finished = true;

                if (error) {
                    return connection.rollback(() => {
                        connection.release();
                        callback(error);
                    });
                }

                connection.commit((commitError) => {
                    if (commitError) {
                        return connection.rollback(() => {
                            connection.release();
                            callback(commitError);
                        });
                    }

                    connection.release();
                    callback(null, result);
                });
            };

            try {
                operation(connection, finish);
            } catch (error) {
                finish(error);
            }
        });
    });
}

// Create or update a buyer's rating for a product, replacing its media when
// new files were uploaded or the buyer asked to remove existing media.
// Returns { ratingId, oldMediaPaths } - oldMediaPaths are the media files
// that were just replaced, for the caller to delete from disk.
function upsert({ productId, buyerId, sellerId, rating, comment, isAnonymous, mediaFiles, replaceMedia }, callback) {
    runInTransaction((connection, finish) => {
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

        connection.query(upsertSql, upsertParams, (upsertError, result) => {
            if (upsertError) {
                return finish(upsertError);
            }

            const ratingId = result.insertId;

            if (!replaceMedia) {
                return finish(null, { ratingId, oldMediaPaths: [] });
            }

            connection.query('SELECT file_path FROM rating_media WHERE rating_id = ? FOR UPDATE', [ratingId], (selectError, oldMediaRows) => {
                if (selectError) {
                    return finish(selectError);
                }

                const oldMediaPaths = oldMediaRows.map((row) => row.file_path);

                connection.query('DELETE FROM rating_media WHERE rating_id = ?', [ratingId], (deleteError) => {
                    if (deleteError) {
                        return finish(deleteError);
                    }

                    insertMediaFiles(connection, ratingId, mediaFiles, (insertError) => {
                        if (insertError) {
                            return finish(insertError);
                        }
                        finish(null, { ratingId, oldMediaPaths });
                    });
                });
            });
        });
    }, callback);
}

// Delete only the current buyer's review and return its media paths so the
// route can remove files after the database transaction commits.
function deleteByProductAndBuyer(productId, buyerId, callback) {
    runInTransaction((connection, finish) => {
        const findSql = `SELECT id
                         FROM ratings
                         WHERE product_id = ? AND buyer_id = ?
                         FOR UPDATE`;

        connection.query(findSql, [productId, buyerId], (findError, ratingRows) => {
            if (findError) {
                return finish(findError);
            }
            if (!ratingRows.length) {
                return finish(null, { deleted: false, oldMediaPaths: [] });
            }

            const ratingId = ratingRows[0].id;
            connection.query('SELECT file_path FROM rating_media WHERE rating_id = ?', [ratingId], (mediaError, mediaRows) => {
                if (mediaError) {
                    return finish(mediaError);
                }

                connection.query('DELETE FROM ratings WHERE id = ? AND buyer_id = ?', [ratingId, buyerId], (deleteError, result) => {
                    if (deleteError) {
                        return finish(deleteError);
                    }
                    finish(null, {
                        deleted: result.affectedRows === 1,
                        oldMediaPaths: mediaRows.map((row) => row.file_path)
                    });
                });
            });
        });
    }, callback);
}

// Inserts each uploaded media file one at a time, in order, so the whole
// batch can still be rolled back together on the first failure.
function insertMediaFiles(connection, ratingId, mediaFiles, callback) {
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

        connection.query(insertSql, params, (error) => {
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
    getPublicReviewsBySellerId,
    findByProductAndBuyer,
    upsert,
    deleteByProductAndBuyer
};
