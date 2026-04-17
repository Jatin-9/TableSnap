-- The users UPDATE policy allows auth.uid() = id, meaning a user can update
-- any column on their own row — including role. A malicious user could call
-- the Supabase API directly and set role = 'super_admin' on themselves.
--
-- This trigger fires before every UPDATE on users and blocks any change to
-- the role column unless the caller is a database superuser (i.e. the
-- promote_to_super_admin / demote_from_super_admin SECURITY DEFINER functions,
-- which run as postgres). Regular authenticated users are rejected.

CREATE OR REPLACE FUNCTION prevent_role_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- current_user is 'postgres' when called from a SECURITY DEFINER function
    -- owned by postgres (our promote/demote helpers). Allow that case only.
    IF current_user NOT IN ('postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'Permission denied: role cannot be changed directly';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_role_immutable
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION prevent_role_change();
