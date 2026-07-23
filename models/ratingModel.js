const db = require('../config/db');
const fs = require('fs');
const path = require('path');
const { ratingUploadDirectory } = require('../middleware/imageUpload');

// Ratings: a buyer leaves a 1-5 star rating, a written comment, and one
// optional photo, for a product they actually bought.

// Average rating + review count for one product, counting only reviews from
// buyers who actually completed a purchase of that product.
function getSummaryByProductId(productId, callback) {
    getSummariesByProductIds([productId], (error, summaries) => {
        if (error) {
            return callback(error);
        }
        callback(null, summaries.get(Number(productId)) || {
            averageRating: 0,
            reviewCount: 0
        });
    });
}

// Same summary, batched for a list of products (browse page grid).
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
                        SELECT 1 FROM purchases p
                        WHERE p.buyer_id = r.buyer_id AND p.product_id = r.product_id
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

// Every review for one product, newest-updated first - for the product's
// "ratings & reviews" page.
function getPublicReviewsByProductId(productId, callback) {
    const sql = `SELECT r.id, r.rating, r.comment, r.image, r.is_anonymous, r.updated_at,
                        u.name AS buyer_name
                 FROM ratings r
                 JOIN users u ON u.id = r.buyer_id
                 WHERE r.product_id = ?
                   AND EXISTS (
                        SELECT 1 FROM purchases p
                        WHERE p.buyer_id = r.buyer_id AND p.product_id = r.product_id
                   )
                 ORDER BY r.updated_at DESC`;
    db.query(sql, [productId], (error, rows) => {
        if (error) {
            return callback(error);
        }
        callback(null, rows.map(toReviewView));
    });
}

// All of a seller's reviews (across every product they sold), newest-updated
// first - used on the public profile "Reviews" section and its "view all" page.
function getReviewsBySellerId(sellerId, callback) {
    const sql = `SELECT r.id, r.rating, r.comment, r.image, r.is_anonymous, r.updated_at,
                        u.name AS buyer_name,
                        p.id AS product_id, p.name AS product_name
                 FROM ratings r
                 JOIN users u ON u.id = r.buyer_id
                 JOIN products p ON p.id = r.product_id
                 WHERE r.seller_id = ?
                   AND EXISTS (
                        SELECT 1 FROM purchases pu
                        WHERE pu.buyer_id = r.buyer_id AND pu.product_id = r.product_id
                   )
                 ORDER BY r.updated_at DESC`;
    db.query(sql, [sellerId], (error, rows) => {
        if (error) {
            return callback(error);
        }
        callback(null, rows.map((row) => ({
            ...toReviewView(row),
            productId: row.product_id,
            productName: row.product_name
        })));
    });
}

function toReviewView(row) {
    return {
        id: row.id,
        rating: Number(row.rating),
        comment: row.comment,
        authorLabel: row.is_anonymous ? 'Anonymous student' : row.buyer_name,
        image: row.image ? `/images/ratings/${row.image}` : null,
        updatedAt: row.updated_at
    };
}

// This buyer's own rating for this product (if any) - used to pre-fill the
// "write/edit a review" form.
function findByProductAndBuyer(productId, buyerId, callback) {
    const sql = `SELECT id, rating, comment, image, is_anonymous
                 FROM ratings
                 WHERE product_id = ? AND buyer_id = ?
                 LIMIT 1`;
    db.query(sql, [productId, buyerId], (error, rows) => {
        if (error) {
            return callback(error);
        }
        callback(null, rows[0] || null);
    });
}

// Create or update a buyer's rating for a product. Keeps the existing photo
// unless a new one was uploaded.
function upsert({ productId, buyerId, sellerId, rating, comment, isAnonymous, image }, callback) {
    findByProductAndBuyer(productId, buyerId, (findError, existingRating) => {
        if (findError) {
            return callback(findError);
        }

        const newImage = image || (existingRating && existingRating.image) || null;

        const sql = `INSERT INTO ratings (product_id, buyer_id, seller_id, rating, comment, is_anonymous, image)
                     VALUES (?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                        rating = VALUES(rating),
                        comment = VALUES(comment),
                        is_anonymous = VALUES(is_anonymous),
                        image = VALUES(image),
                        updated_at = CURRENT_TIMESTAMP`;
        db.query(sql, [productId, buyerId, sellerId, rating, comment, isAnonymous ? 1 : 0, newImage], (error) => {
            if (error) {
                return callback(error);
            }

            // A replaced photo's old file is no longer referenced, so remove it.
            if (image && existingRating && existingRating.image && existingRating.image !== image) {
                fs.unlink(path.join(ratingUploadDirectory, existingRating.image), () => {});
            }

            callback(null);
        });
    });
}

// Delete only the current buyer's review for this product. The same lookup
// used by the edit form is reused here so the attached photo can be removed
// after the database row has been deleted successfully.
function deleteByProductAndBuyer(productId, buyerId, callback) {
    findByProductAndBuyer(productId, buyerId, (findError, existingRating) => {
        if (findError) {
            return callback(findError);
        }
        if (!existingRating) {
            return callback(null, { deleted: false });
        }

        const sql = `DELETE FROM ratings
                     WHERE product_id = ? AND buyer_id = ?`;
        db.query(sql, [productId, buyerId], (error, result) => {
            if (error) {
                return callback(error);
            }
            if (result.affectedRows === 0) {
                return callback(null, { deleted: false });
            }

            if (!existingRating.image) {
                return callback(null, { deleted: true });
            }

            fs.unlink(path.join(ratingUploadDirectory, existingRating.image), (unlinkError) => {
                if (unlinkError && unlinkError.code !== 'ENOENT') {
                    console.error('Unable to remove rating image:', unlinkError.message);
                }
                callback(null, { deleted: true });
            });
        });
    });
}

module.exports = {
    getSummaryByProductId,
    getSummariesByProductIds,
    getPublicReviewsByProductId,
    getReviewsBySellerId,
    findByProductAndBuyer,
    upsert,
    deleteByProductAndBuyer
};
