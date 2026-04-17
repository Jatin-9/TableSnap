-- When a new auth user is created, automatically insert their row into the
-- public users table. This eliminates the race condition where onAuthStateChange
-- fires before the client-side INSERT completes, leaving user = null in the app.
--
-- SECURITY DEFINER lets the function write to public.users as the DB owner,
-- bypassing RLS on the insert (the client is not yet authenticated at this point).

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, role)
  VALUES (NEW.id, NEW.email, 'user')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
