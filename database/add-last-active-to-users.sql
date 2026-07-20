-- ============================================================
-- Adds "last_active" to the existing users table.  (Hein Thu Nyi Nyi)
--
-- Run this once against an existing CampusCycle database:
--   mysql -h <host> -u <user> -p <database> < database/add-last-active-to-users.sql
--
-- Editing schema.sql alone does not change a table that already exists,
-- so this ALTER is needed for databases that were already created.
--
-- The column is filled in by the login route each time a user signs in.
-- It is NULL for accounts that have never logged in, which is why the
-- public profile shows "New member" instead of a date in that case.
-- ============================================================

ALTER TABLE users
ADD COLUMN last_active DATETIME NULL AFTER created_at;
