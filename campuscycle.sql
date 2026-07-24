-- CampusCycle
-- Select an empty MySQL database before running this file.
-- The script intentionally contains exactly seven application tables.

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password CHAR(40) NOT NULL,
    phone VARCHAR(20),
    role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
    is_banned TINYINT(1) NOT NULL DEFAULT 0,
    ban_reason VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    seller_id INT NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(50) NOT NULL,
    item_condition ENUM('new', 'like_new', 'used') NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    image VARCHAR(255),
    status ENUM('pending', 'approved', 'rejected', 'sold_out') NOT NULL DEFAULT 'pending',
    rejection_reason VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE wishlists (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_wishlist_item (user_id, product_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE carts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_cart_item (user_id, product_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE reservations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    buyer_id INT NOT NULL,
    seller_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    appointment_date DATE,
    appointment_time TIME,
    meeting_location VARCHAR(255),
    status ENUM('requested', 'proposed', 'confirmed', 'completed', 'cancelled', 'rejected') NOT NULL DEFAULT 'requested',
    stock_restored TINYINT(1) NOT NULL DEFAULT 0,
    rating_admin_delete_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE ratings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reservation_id INT NOT NULL UNIQUE,
    product_id INT NOT NULL,
    buyer_id INT NOT NULL,
    seller_id INT NOT NULL,
    rating INT NOT NULL,
    comment VARCHAR(500),
    image VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CHECK (rating BETWEEN 1 AND 5),
    FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reporter_id INT NOT NULL,
    reported_user_id INT,
    reported_product_id INT,
    category VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    evidence_image VARCHAR(255),
    status ENUM('pending', 'approved', 'dismissed') NOT NULL DEFAULT 'pending',
    admin_action ENUM('none', 'remove_product', 'ban_and_remove') NOT NULL DEFAULT 'none',
    resolution_message VARCHAR(255),
    resolved_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,
    FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reported_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (reported_product_id) REFERENCES products(id) ON DELETE SET NULL,
    FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================
-- SAMPLE DATA
-- Import into an empty selected database.
-- =====================================================

-- 1. USERS
INSERT INTO users
    (id, name, email, password, phone, role, is_banned, ban_reason)
VALUES
    (1, 'CampusCycle Admin', 'admin@myrp.edu.sg',
     SHA1('Admin123'), '60000001', 'admin', 0, NULL),
    (2, 'Ben Lim', 'ben@myrp.edu.sg',
     SHA1('Ben123'), '91234567', 'user', 0, NULL),
    (3, 'Alice Tan', 'alice@myrp.edu.sg',
     SHA1('Alice123'), '92345678', 'user', 0, NULL),
    (4, 'Clara Lee', 'clara@myrp.edu.sg',
     SHA1('Clara123'), '93456789', 'user', 0, NULL),
    (5, 'Banned Test User', 'banned@myrp.edu.sg',
     SHA1('Banned123'), '94567890', 'user', 1,
     'Repeated misleading product listings');

-- 2. PRODUCTS
INSERT INTO products
    (id, seller_id, name, description, category,
     item_condition, price, quantity, image, status, rejection_reason)
VALUES
    (1, 2, 'Adjustable Laptop Stand',
     'Aluminium laptop stand suitable for study desks.',
     'Electronics', 'like_new', 15.00, 3, NULL, 'approved', NULL),
    (2, 2, 'Scientific Calculator',
     'Working scientific calculator suitable for school.',
     'Stationery', 'used', 8.00, 1, NULL, 'approved', NULL),
    (3, 4, 'Bicycle Helmet',
     'New medium-sized bicycle helmet.',
     'Sports', 'new', 20.00, 1, NULL, 'pending', NULL),
    (4, 5, 'Wireless Headphones',
     'Used wireless headphones.',
     'Electronics', 'used', 30.00, 1, NULL, 'rejected',
     'Seller account was banned'),
    (5, 4, 'Programming Textbook',
     'Introduction to programming course textbook.',
     'Textbooks', 'used', 12.00, 0, NULL, 'sold_out', NULL),
    (6, 2, 'Study Chair',
     'Comfortable chair suitable for a study table.',
     'Furniture', 'used', 25.00, 2, NULL, 'approved', NULL);

-- 3. WISHLISTS
INSERT INTO wishlists (user_id, product_id)
VALUES
    (3, 2),
    (3, 6),
    (4, 1);

-- 4. CARTS
INSERT INTO carts (user_id, product_id, quantity)
VALUES
    (3, 1, 1),
    (4, 2, 1);

-- 5. RESERVATIONS
INSERT INTO reservations
    (id, product_id, buyer_id, seller_id,
     quantity, unit_price, total_price,
     appointment_date, appointment_time,
     meeting_location, status, stock_restored, completed_at)
VALUES
    -- Completed and rated
    (1, 2, 3, 2,
     1, 8.00, 8.00,
     '2026-07-20', '14:00:00', 'RP Library Entrance',
     'completed', 0, '2026-07-20 14:20:00'),

    -- Seller proposed meetup details
    (2, 1, 4, 2,
     1, 15.00, 15.00,
     '2026-08-01', '11:30:00', 'South Food Court',
     'proposed', 0, NULL),

    -- Waiting for seller response
    (3, 6, 3, 2,
     1, 25.00, 25.00,
     NULL, NULL, NULL,
     'requested', 0, NULL),

    -- Cancelled with stock restored
    (4, 1, 3, 2,
     1, 15.00, 15.00,
     NULL, NULL, NULL,
     'cancelled', 1, NULL),

    -- Completed but not rated
    (5, 6, 4, 2,
     1, 25.00, 25.00,
     '2026-07-21', '15:00:00', 'W6 Entrance',
     'completed', 0, '2026-07-21 15:15:00'),

    -- Buyer confirmed the proposed meetup
    (6, 1, 3, 2,
     1, 15.00, 15.00,
     '2026-08-03', '10:00:00', 'RP Library Level 2',
     'confirmed', 0, NULL),

    -- Seller rejected request
    (7, 6, 4, 2,
     1, 25.00, 25.00,
     NULL, NULL, NULL,
     'rejected', 1, NULL);

-- 6. RATINGS
INSERT INTO ratings
    (reservation_id, product_id, buyer_id, seller_id,
     rating, comment, image)
VALUES
    (1, 2, 3, 2,
     5,
     'The calculator works well and the seller was punctual.',
     NULL);

-- 7. REPORTS
INSERT INTO reports
    (reporter_id, reported_user_id, reported_product_id,
     category, description, evidence_image, status, admin_action,
     resolution_message, resolved_by, resolved_at)
VALUES
    -- Pending product report
    (3, 2, 1,
     'Misleading information',
     'The buyer believes some product information is unclear.',
     NULL, 'pending', 'none',
     NULL, NULL, NULL),

    -- Dismissed user report
    (4, 3, NULL,
     'Other',
     'Report submitted after a disagreement about meetup time.',
     NULL, 'dismissed', 'none',
     'No violation was found.',
     1, CURRENT_TIMESTAMP),

    -- Approved product removal
    (3, 5, 4,
     'Misleading information',
     'The product was listed by a problematic account.',
     NULL, 'approved', 'remove_product',
     'The reported product was removed.',
     1, CURRENT_TIMESTAMP),

    -- Approved account ban
    (4, 5, NULL,
     'Scam or fraud',
     'The user repeatedly submitted misleading products.',
     NULL, 'approved', 'ban_and_remove',
     'The user was banned and all products were removed.',
     1, CURRENT_TIMESTAMP);
