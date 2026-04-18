-- SECURITY: Prevent role escalation via direct INSERT on the users table.
--
-- The problem:
--   The existing INSERT policy only checks `auth.uid() = id`. It does NOT
--   check the `role` column. This means an authenticated user can call:
--
--     POST /rest/v1/users  body: { id: <their-uid>, email: '...', role: 'super_admin' }
--
--   and the row will be accepted — because the policy passes and there is no
--   INSERT trigger to block it. The `prevent_role_change` trigger (migration 008)
--   only fires on UPDATE, so it does not protect the INSERT path.
--
-- The fix:
--   Drop the loose INSERT policy and replace it with one that additionally
--   enforces `role = 'user'`. This means the only role a user can ever assign
--   themselves on INSERT is the baseline 'user' role. Promotion to 'super_admin'
--   can only happen via the SQL Editor (postgres superuser) calling
--   promote_to_super_admin(), which is now also restricted by migration 009.

DROP POLICY IF EXISTS "Users can insert own profile" ON users;

CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id AND role = 'user');
