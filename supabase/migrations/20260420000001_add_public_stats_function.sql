-- Exposes aggregate platform stats to anonymous (unauthenticated) visitors.
--
-- Why SECURITY DEFINER?
-- RLS on table_snapshots and users blocks anon users from reading those tables.
-- SECURITY DEFINER makes this function run as its owner (postgres), which can
-- bypass RLS. The function only returns two COUNT values — no raw rows, no
-- emails, no user data — so exposing it publicly is completely safe.
--
-- Why SET search_path = public?
-- Prevents search_path injection attacks where a malicious user could create
-- a schema with the same table names and trick the function into querying them.

CREATE OR REPLACE FUNCTION get_public_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN json_build_object(
    'total_tables', (SELECT COUNT(*) FROM table_snapshots),
    'total_users',  (SELECT COUNT(*) FROM users)
  );
END;
$$;

-- Let unauthenticated visitors (landing page) and logged-in users call this
GRANT EXECUTE ON FUNCTION get_public_stats() TO anon;
GRANT EXECUTE ON FUNCTION get_public_stats() TO authenticated;
