-- SECURITY DEFINER functions that run as the postgres superuser.
-- This lets the webhook (service_role) update the tier column even though
-- the prevent_tier_change trigger blocks non-postgres users.
-- We grant EXECUTE only to service_role so nothing else can call these.

CREATE OR REPLACE FUNCTION upgrade_user_tier(target_user_id uuid, new_tier text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF new_tier NOT IN ('free', 'pro') THEN
    RAISE EXCEPTION 'Invalid tier: %', new_tier;
  END IF;
  UPDATE public.users SET tier = new_tier WHERE id = target_user_id;
END;
$$;

-- Revoke from everyone, then grant only to service_role
REVOKE EXECUTE ON FUNCTION upgrade_user_tier(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION upgrade_user_tier(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION upgrade_user_tier(uuid, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION upgrade_user_tier(uuid, text) TO service_role;
