-- Allows super admins to read all rows in users and table_snapshots.
-- Without these, RLS limits every authenticated user (including super_admin)
-- to their own rows, so the admin dashboard counts would always return 1.
-- Postgres ORs multiple SELECT policies together, so regular users are
-- unaffected — they still only see their own data via the existing policies.

CREATE POLICY "Super admins can view all users"
  ON users FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY "Super admins can view all snapshots"
  ON table_snapshots FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );
