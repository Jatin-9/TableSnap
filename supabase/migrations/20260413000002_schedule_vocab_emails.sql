-- Schedule the daily vocab email function using pg_cron + pg_net.
-- pg_cron runs SQL on a schedule; pg_net makes the HTTP call to our edge function.
--
-- HOW TO RUN:
-- 1. Go to Supabase dashboard → SQL Editor
-- 2. Replace YOUR_SERVICE_ROLE_KEY below with the key from Settings → API → service_role
-- 3. Run the query

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
select cron.schedule(
  'send-daily-vocab-emails',
  '0 8 * * *',
  $$
  select net.http_post(
    url     := 'https://nmuiueuoolvkssueutyq.supabase.co/functions/v1/send-vocab-email',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body    := '{}'::jsonb
  );
  $$
);
