CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Runs as postgres (SECURITY DEFINER) so it bypasses the prevent_tier_change trigger.
-- Finds every Pro user whose paid period has passed and downgrades them to free.
CREATE OR REPLACE FUNCTION expire_subscriptions()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT id FROM public.users
    WHERE tier = 'pro'
      AND subscription_ends_at IS NOT NULL
      AND subscription_ends_at < NOW()
  LOOP
    UPDATE public.users
    SET
      tier                    = 'free',
      subscription_status     = NULL,
      subscription_ends_at    = NULL,
      subscription_portal_url = NULL,
      dodo_subscription_id    = NULL
      -- dodo_customer_id intentionally kept so re-subscribing users are recognised by Dodo
    WHERE id = rec.id;
  END LOOP;
END;
$$;

-- Daily at 02:00 UTC
SELECT cron.schedule(
  'expire-subscriptions',
  '0 2 * * *',
  $$ SELECT expire_subscriptions(); $$
);
