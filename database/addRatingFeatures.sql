-- 在 Thiha-Aung 原始 schema 上增加本地评分功能。
-- 当前数据库若已运行过此文件，不要重复执行 ALTER 部分。

ALTER TABLE ratings
    ADD COLUMN is_anonymous BOOLEAN NOT NULL DEFAULT FALSE AFTER comment,
    ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP AFTER created_at,
    ADD UNIQUE KEY uq_rating_buyer_product (buyer_id, product_id);

CREATE TABLE rating_media (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    rating_id INT NOT NULL,
    media_type ENUM('image', 'video') NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes INT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_rating_media_rating_id (rating_id),
    CONSTRAINT fk_rating_media_rating FOREIGN KEY (rating_id)
        REFERENCES ratings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
