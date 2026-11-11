-- Migration: Programar recordatorio diario de pedidos a las 8:00 AM (13:00 UTC)
-- Envía un correo con los pedidos que deben prepararse y entregarse en el día.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'daily-orders-reminder') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'daily-orders-reminder';
  end if;
end $$;

select cron.schedule(
  'daily-orders-reminder',
  '0 13 * * *',
  $daily_orders$
    select net.http_post(
      url := 'https://elfkbytvuatjlhzhdsmy.supabase.co/functions/v1/daily-orders-reminder',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'weekly_report_service_role_key'), ''),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $daily_orders$
);
