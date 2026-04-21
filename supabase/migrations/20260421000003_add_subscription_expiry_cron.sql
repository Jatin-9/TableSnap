-- Enable pg_cron extension (already available in Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Daily job at 02:00 UTC — downgrades any Pro user whose subscription period has passed.
-- This is a safety net for missed or delayed webhooks from Dodo Payments.
SELECT cron.schedule(
  'expire-subscriptions',
  '0 2 * * *',
  $$
    UPDATE public.users
    SET
      tier                  = 'free',
      subscription_status   = NULL,
      subscription_ends_at  = NULL,
      subscription_portal_url = NULL
    WHERE
      tier = 'pro'
      AND subscription_ends_at IS NOT NULL
      AND subscription_ends_at < NOW();
  $$
);
