-- Run this once against an existing CampusCycle database.
-- Editing schema.sql alone does not change a table that already exists.
ALTER TABLE reservations
MODIFY status ENUM(
    'pending',
    'proposed',
    'confirmed',
    'completed',
    'cancelled'
) NOT NULL DEFAULT 'pending';
