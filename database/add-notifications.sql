-- ============================================================
-- Notifications for report outcomes (Ei Htet Htet Tun)
--
-- Run this once against an existing CampusCycle database:
--   mysql -h <host> -u <user> -p <database> < database/add-notifications.sql
--
-- Lets a reporter be notified when an admin approves or dismisses the
-- report they filed. Nothing else is altered.
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    message VARCHAR(255) NOT NULL,
    link VARCHAR(255) NULL,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
