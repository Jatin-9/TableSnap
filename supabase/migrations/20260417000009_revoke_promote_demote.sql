-- SECURITY: REVOKE execute permission on the role-promotion helpers from PUBLIC.
--
-- The problem:
--   `promote_to_super_admin` and `demote_from_super_admin` are SECURITY DEFINER
--   functions — they run as postgres and bypass RLS. By default, Postgres grants
--   EXECUTE on new functions to PUBLIC, which means any authenticated user could
--   call them via the Supabase REST API (POST /rest/v1/rpc/promote_to_super_admin).
--   The role-immutability trigger (migration 008) stops a direct UPDATE, but
--   calling these functions is a separate, unguarded path.
--
-- The fix:
--   1. REVOKE EXECUTE from PUBLIC (and the anon / authenticated roles) so no
--      Supabase client or API caller can invoke these functions.
--   2. Add an explicit superuser guard inside each function body as defence in
--      depth — even if EXECUTE is accidentally re-granted, a non-superuser call
--      will be rejected with a clear error.
--
-- After this migration the only way to promote/demote is via the Supabase
-- SQL Editor (which connects as a postgres superuser).

REVOKE EXECUTE ON FUNCTION promote_to_super_admin(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION promote_to_super_admin(text) FROM anon;
REVOKE EXECUTE ON FUNCTION promote_to_super_admin(text) FROM authenticated;

REVOKE EXECUTE ON FUNCTION demote_from_super_admin(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION demote_from_super_admin(text) FROM anon;
REVOKE EXECUTE ON FUNCTION demote_from_super_admin(text) FROM authenticated;

-- Recreate the functions with an added superuser-only guard.
-- The REVOKE above is the primary defence; this guard is a safety net.

CREATE OR REPLACE FUNCTION promote_to_super_admin(user_email text)
RETURNS boolean AS $$
DECLARE
  rows_updated integer;
BEGIN
  -- Only postgres superusers may call this function.
  -- Under normal Supabase operation current_user is 'postgres' only when
  -- running from the SQL Editor / service-role context.
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Permission denied: only a database superuser can promote roles';
  END IF;

  UPDATE users
  SET role = 'super_admin'
  WHERE email = user_email;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;

  IF rows_updated > 0 THEN
    RETURN true;
  ELSE
    RAISE NOTICE 'No user found with email: %', user_email;
    RETURN false;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION demote_from_super_admin(user_email text)
RETURNS boolean AS $$
DECLARE
  rows_updated integer;
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Permission denied: only a database superuser can demote roles';
  END IF;

  UPDATE users
  SET role = 'user'
  WHERE email = user_email;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;

  IF rows_updated > 0 THEN
    RETURN true;
  ELSE
    RAISE NOTICE 'No user found with email: %', user_email;
    RETURN false;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
