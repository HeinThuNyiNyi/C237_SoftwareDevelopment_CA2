const pool = require('../config/database');

/**
 * 评分模型。
 * 主字段完全跟随 Thiha-Aung：product_id、buyer_id、seller_id。
 * 本地功能只额外增加匿名标记、更新时间和媒体附件。
 */
const Rating = {
    async getSummaryByProductId(productId) {
        const [rows] = await pool.execute(
            `SELECT
                COALESCE(ROUND(AVG(r.rating), 1), 0) AS average_rating,
                COUNT(*) AS review_count
             FROM ratings r
             WHERE r.product_id = ?
               AND EXISTS (
                    SELECT 1
                    FROM purchases p
                    WHERE p.buyer_id = r.buyer_id
                      AND p.product_id = r.product_id
               )`,
            [productId]
        );

        return {
            averageRating: Number(rows[0].average_rating),
            reviewCount: Number(rows[0].review_count)
        };
    },

    async getSummariesByProductIds(productIds) {
        if (!productIds.length) {
            return new Map();
        }

        const placeholders = productIds.map(() => '?').join(', ');
        const [rows] = await pool.execute(
            `SELECT
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
             GROUP BY r.product_id`,
            productIds
        );

        return new Map(rows.map((row) => [Number(row.product_id), {
            averageRating: Number(row.average_rating),
            reviewCount: Number(row.review_count)
        }]));
    },

    async getPublicReviewsByProductId(productId) {
        const [rows] = await pool.execute(
            `SELECT
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
             ORDER BY r.updated_at DESC, m.id`,
            [productId]
        );

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

        return [...reviewsById.values()];
    },

    async findByProductAndBuyer(productId, buyerId) {
        const [ratingRows] = await pool.execute(
            `SELECT id, product_id, buyer_id, seller_id, rating, comment,
                    is_anonymous, created_at, updated_at
             FROM ratings
             WHERE product_id = ? AND buyer_id = ?
             LIMIT 1`,
            [productId, buyerId]
        );

        if (!ratingRows.length) {
            return null;
        }

        const currentRating = ratingRows[0];
        const [mediaRows] = await pool.execute(
            `SELECT id, media_type, file_path, original_name, mime_type, size_bytes
             FROM rating_media
             WHERE rating_id = ?
             ORDER BY id`,
            [currentRating.id]
        );

        return {
            ...currentRating,
            is_anonymous: Boolean(currentRating.is_anonymous),
            media: mediaRows
        };
    },

    async upsert({
        productId,
        buyerId,
        sellerId,
        rating,
        comment,
        isAnonymous,
        mediaFiles,
        replaceMedia
    }) {
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            const [result] = await connection.execute(
                `INSERT INTO ratings
                    (product_id, buyer_id, seller_id, rating, comment, is_anonymous)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    id = LAST_INSERT_ID(id),
                    seller_id = VALUES(seller_id),
                    rating = VALUES(rating),
                    comment = VALUES(comment),
                    is_anonymous = VALUES(is_anonymous),
                    updated_at = CURRENT_TIMESTAMP`,
                [
                    productId,
                    buyerId,
                    sellerId,
                    rating,
                    comment,
                    isAnonymous ? 1 : 0
                ]
            );

            const ratingId = result.insertId;
            let oldMediaPaths = [];

            if (replaceMedia) {
                const [oldMediaRows] = await connection.execute(
                    'SELECT file_path FROM rating_media WHERE rating_id = ? FOR UPDATE',
                    [ratingId]
                );
                oldMediaPaths = oldMediaRows.map((row) => row.file_path);

                await connection.execute('DELETE FROM rating_media WHERE rating_id = ?', [ratingId]);

                for (const file of mediaFiles) {
                    const mediaType = file.mimetype.startsWith('image/') ? 'image' : 'video';
                    await connection.execute(
                        `INSERT INTO rating_media
                            (rating_id, media_type, file_path, original_name, mime_type, size_bytes)
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [
                            ratingId,
                            mediaType,
                            `/uploads/ratings/${file.filename}`,
                            file.originalname,
                            file.mimetype,
                            file.size
                        ]
                    );
                }
            }

            await connection.commit();
            return { ratingId, oldMediaPaths };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
};

module.exports = Rating;
