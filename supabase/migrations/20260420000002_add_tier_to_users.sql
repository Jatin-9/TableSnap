-- Add a tier column to distinguish free vs pro users.
-- Defaults to 'free' for all existing and new users.
ALTER TABLE public.users
  ADD COLUMN tier text NOT NULL DEFAULT 'free'
  CHECK (tier IN ('free', 'pro'));

-- Block users from changing their own tier via the REST API.
-- Only a DB superuser (i.e. direct SQL / service-role) can change it.
-- This is the same pattern used for the role column.
CREATE OR REPLACE FUNCTION prevent_tier_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tier IS DISTINCT FROM OLD.tier THEN
    IF current_user <> 'postgres' THEN
      RAISE EXCEPTION 'Permission denied: tier cannot be changed directly';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_tier_immutable
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION prevent_tier_change();

-- Admin helper: run from SQL Editor only (not callable via REST API).
-- Usage: SELECT set_user_tier('user@example.com', 'pro');
CREATE OR REPLACE FUNCTION set_user_tier(user_email text, new_tier text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Permission denied: only a database superuser can change tier';
  END IF;
  UPDATE public.users SET tier = new_tier WHERE email = user_email;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_user_tier(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION set_user_tier(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION set_user_tier(text, text) FROM authenticated;
