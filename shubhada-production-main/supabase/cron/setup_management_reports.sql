-- Replace the placeholders below before running this script.
-- You can also configure these schedules from the Supabase Dashboard Cron UI.

select cron.schedule(
  'daily-management-report',
  '15 7 * * *',
  $$
  select
    net.http_post(
      url := 'https://YOUR_PROJECT_REF.functions.supabase.co/management-report',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
      ),
      body := jsonb_build_object(
        'kind', 'daily',
        'force', false,
        'triggerSource', 'cron'
      )
    );
  $$
);

select cron.schedule(
  'monthly-management-report',
  '0 8 1 * *',
  $$
  select
    net.http_post(
      url := 'https://YOUR_PROJECT_REF.functions.supabase.co/management-report',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
      ),
      body := jsonb_build_object(
        'kind', 'monthly',
        'force', false,
        'triggerSource', 'cron'
      )
    );
  $$
);
