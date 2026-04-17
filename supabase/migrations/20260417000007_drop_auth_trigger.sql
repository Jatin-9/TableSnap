-- The handle_new_user trigger on auth.users causes "Database error saving new
-- user" because triggers on auth.users run in a restricted context that can
-- block the entire signup transaction when they fail.
-- The race condition is handled client-side instead (see AuthContext.tsx).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();
