ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS dodo_customer_id      text,
  ADD COLUMN IF NOT EXISTS subscription_status   text,
  ADD COLUMN IF NOT EXISTS subscription_ends_at  timestamptz;
