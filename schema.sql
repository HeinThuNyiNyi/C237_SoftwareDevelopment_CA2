-- CampusCycle Database Setup Script for CA2
-- Execute this SQL script in MySQL Workbench or phpMyAdmin to initialize the required tables.

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    description TEXT,
    image_symbol VARCHAR(50) DEFAULT '📦',
    category VARCHAR(100),
    stock INT DEFAULT 10,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wishlist (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_product_wishlist (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS cart (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cart_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cart_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cart_id) REFERENCES cart(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE KEY unique_cart_product (cart_id, product_id)
);

-- Initial Seed Data for Testing
INSERT INTO users (id, username, email, password) VALUES
(1, 'alex_student', 'alex@campus.edu.sg', 'hashedpassword123')
ON DUPLICATE KEY UPDATE username=VALUES(username);

INSERT INTO products (id, name, price, description, image_symbol, category, stock) VALUES
(1, 'Dell Latitude 5420 Laptop', 320.00, 'i5, 16GB RAM, 512GB SSD. Perfect for coding assignments.', '💻', 'electronics', 5),
(2, 'C237 Software Development Textbook', 45.00, 'Comprehensive guide to web app development with Express & MySQL.', '📚', 'books', 12),
(3, 'Ergonomic Desk Chair', 85.00, 'Adjustable mesh office chair in great condition.', '🪑', 'furniture', 2),
(4, 'Campus Hoodie (Size M)', 25.00, 'Soft fleece pullover hoodie, barely worn.', '🧥', 'clothing', 8)
ON DUPLICATE KEY UPDATE name=VALUES(name);
