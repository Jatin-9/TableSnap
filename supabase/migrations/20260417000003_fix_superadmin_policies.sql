-- The previous migration (20260417000002) created policies on the `users`
-- table that queried `users` again inside their USING clause. Postgres
-- evaluates that inner query under RLS too, causing a recursive loop that
-- breaks fetchUserProfile for every user on login.
--
-- Fix: use a SECURITY DEFINER function. It runs as the DB owner (postgres),
-- which bypasses RLS, so the inner SELECT on `users` never triggers policies
-- and the recursion is eliminated.

-- Drop the broken policies first
DROP POLICY IF EXISTS "Super admins can view all users" ON users;
DROP POLICY IF EXISTS "Super admins can view all snapshots" ON table_snapshots;

-- Helper function — runs as postgres (no RLS), safe to call from any policy
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role = 'super_admin'
  );
$$;

-- Recreate the policies using the helper instead of an inline subquery
CREATE POLICY "Super admins can view all users"
  ON users FOR SELECT
  TO authenticated
  USING (is_super_admin() OR auth.uid() = id);

CREATE POLICY "Super admins can view all snapshots"
  ON table_snapshots FOR SELECT
  TO authenticated
  USING (is_super_admin() OR auth.uid() = user_id);
