-- The existing active_users column in global_analytics is updated by a trigger
-- that counts users who *created a table* today — so it's almost always 0.
-- This migration adds a new trigger that fires whenever last_active_at is
-- updated (i.e. on every login) and recalculates active_users for today.
--
-- SECURITY DEFINER lets the function query users without hitting RLS,
-- so it always sees the full user table — same pattern as is_super_admin().

CREATE OR REPLACE FUNCTION update_active_users_on_login()
RETURNS TRIGGER AS $$
BEGIN
  -- Only act when last_active_at actually changed to a real value
  IF NEW.last_active_at IS NOT NULL THEN
    INSERT INTO global_analytics (date, active_users)
    VALUES (
      CURRENT_DATE,
      (SELECT COUNT(*) FROM users WHERE date(last_active_at) = CURRENT_DATE)
    )
    ON CONFLICT (date)
    DO UPDATE SET
      active_users = (SELECT COUNT(*) FROM users WHERE date(last_active_at) = CURRENT_DATE),
      updated_at   = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fire after every UPDATE that touches last_active_at, once per row
CREATE TRIGGER trigger_update_active_users
AFTER UPDATE OF last_active_at ON users
FOR EACH ROW
EXECUTE FUNCTION update_active_users_on_login();
