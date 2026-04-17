-- Tracks when a user was last active so the super admin dashboard can show
-- a real "Active Today" count instead of always 0.
-- The column is updated client-side in AuthContext whenever a session loads.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at timestamptz;
