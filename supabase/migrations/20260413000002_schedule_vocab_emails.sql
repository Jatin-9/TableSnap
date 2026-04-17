-- Schedule the daily vocab email function using pg_cron + pg_net.
-- pg_cron runs SQL on a schedule; pg_net makes the HTTP call to our edge function.
--
-- HOW TO RUN:
-- 1. Go to Supabase dashboard → SQL Editor
-- 2. Generate a random secret (e.g. openssl rand -hex 32) and:
--    a. Set it as a Supabase edge function secret:
--       supabase secrets set CRON_SECRET=<your-secret>
--    b. Replace YOUR_CRON_SECRET below with the same value
-- 3. Run this SQL in the Supabase SQL Editor

-- Enable the HTTP extension if not already active
create extension if not exists pg_net with schema extensions;

-- Remove any existing schedule with this name so re-running is safe
select cron.unschedule('send-daily-vocab-emails')
where exists (
  select 1 from cron.job where jobname = 'send-daily-vocab-emails'
);

-- Schedule: fires at 8am UTC every day.
-- The function itself checks the day — daily users get email every day,
-- weekly users only on Mondays.
--
-- Authentication: we send a dedicated cron secret in x-cron-secret rather
-- than the service role key, so a leaked cron job definition cannot be used
-- to bypass RLS on the Supabase REST API.
select cron.schedule(
  'send-daily-vocab-emails',
  '0 8 * * *',
  $$
  select net.http_post(
    url     := 'https://nmuiueuoolvkssueutyq.supabase.co/functions/v1/send-vocab-email',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', 'YOUR_CRON_SECRET'
    ),
    body    := '{}'::jsonb
  );
  $$
);
