-- ============================================================
-- Student self-registration + account deactivation
--                                        (Hein Thu Nyi Nyi)
--
-- Run this once against an existing CampusCycle database:
--   mysql -h <host> -u <user> -p <database> < database/add-registration-and-active.sql
--
-- It creates ONE new table and adds ONE column to users.
-- No other table is altered, dropped or touched.
-- ============================================================


-- ------------------------------------------------------------
-- 1. pending_registrations
--
-- A student signing up does NOT go straight into users. The sign-up
-- waits here until an admin approves it, and only then is a real row
-- created in users. Keeping them apart means an unapproved person
-- cannot log in at all, because the login route only ever looks in
-- the users table.
--
-- The password is already bcrypt hashed before it reaches this table,
-- so a pending sign-up never stores a readable password.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pending_registrations (
    id               INT AUTO_INCREMENT PRIMARY KEY,

    name             VARCHAR(100) NOT NULL,
    email            VARCHAR(150) NOT NULL UNIQUE,
    password         VARCHAR(255) NOT NULL,   -- bcrypt hash, 60 chars
    phone            VARCHAR(20) NULL,

    -- pending  : waiting for an admin to decide
    -- rejected : admin said no, kept so the student can be told why
    status           ENUM('pending', 'rejected') NOT NULL DEFAULT 'pending',
    rejection_reason VARCHAR(255) NULL,

    -- Which admin handled it. FK to users.
    -- ON DELETE SET NULL so removing an admin does not delete the record.
    reviewed_by      INT NULL,

    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at      DATETIME NULL,

    CONSTRAINT fk_pending_reviewer
        FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ------------------------------------------------------------
-- 2. users.is_active
--
-- Used when a student closes their own account. The row is kept so
-- that their listings, ratings and purchase history stay intact for
-- the other students who took part in them - every foreign key to
-- users is ON DELETE CASCADE, so actually deleting the row would
-- wipe other people's records too.
--
-- is_active = 0 means the account is closed: login is refused and the
-- profile is hidden.
-- ------------------------------------------------------------
ALTER TABLE users
ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER role;
