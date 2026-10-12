-- Agrega costo y utilidad al reporte semanal, y la lista de stock bajo.
--
-- Contexto: la RPC ya calculaba el bloque `credit` completo (vendido a
-- crédito, abonos recibidos, por cobrar, vencido, clientes morosos) pero el
-- correo lo ignoraba por completo. Esta migracion no toca eso: ya estaba.
--
-- Lo que agrega:
--   1. Costo de productos, costo de domicilio y utilidad, con la MISMA
--      formula que ya usa el dashboard: ventas cobradas - costo productos
--      - costo domicilio - gastos - costo del fiado no cobrado. Si las dos
--      pantallas dicen numeros distintos, ninguna de las dos sirve.
--   2. El mismo bloque para la semana anterior, para poder comparar.
--   3. `missing_cost_items`: cuantos items de la semana NO tienen
--      `unit_cost_snapshot`. Si son > 0 la utilidad no es confiable y el
--      correo lo dice en vez de mostrar un numero inventado.
--   4. `low_stock_products`: la lista con nombre y stock, no solo el total.
--
-- Zona horaria: America/Bogota, igual que el resto del proyecto.
-- Las ventas se reconocen por `paid_at`, no por `created_at`: el mismo
-- criterio del dashboard, para que el correo y el panel no se contradigan.

create or replace function public.weekly_sales_report()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  local_today date := (now() at time zone 'America/Bogota')::date;
  this_week_start date := date_trunc('week', local_today)::date;
  report_week_start date := this_week_start - 7;
  report_week_end date := this_week_start - 1;
  previous_week_start date := report_week_start - 7;
  this_month_start date := date_trunc('month', local_today)::date;
  last_month_start date := (this_month_start - interval '1 month')::date;

  -- Semana reportada
  current_week_sales numeric;
  current_week_orders integer;
  current_week_items integer;
  current_week_cost numeric;
  current_week_delivery numeric;
  current_week_missing_cost integer;
  current_week_credit_cost numeric;

  -- Semana anterior
  previous_week_sales numeric;
  previous_week_orders integer;
  previous_week_cost numeric;
  previous_week_delivery numeric;
  previous_week_expenses numeric;

  -- Mes
  last_month_sales numeric;

  -- Producto mas vendido
  best_product_this_week text;
  best_product_last_month text;
  best_product_week_qty integer;
  best_product_month_qty integer;

  new_customers_count integer;
  low_stock_count integer;
  pending_orders_count integer;

  weekly_expenses numeric;
  monthly_expenses numeric;

  -- Credito (ya existia; se conserva tal cual)
  credit_week_sales numeric;
  credit_week_orders integer;
  credit_week_collected numeric;
  credit_outstanding_balance numeric;
  credit_overdue_balance numeric;
  credit_customers_overdue integer;
  credit_outstanding_cost numeric;

  avg_order_value numeric;

  -- Lista de stock bajo
  low_stock_list jsonb;
  -- Top 5 de la semana, util si vendes poco y siempre hay un ganador
  top_products jsonb;

  result jsonb;

  -- v_from / v_to acotan un rango semanal reutilizable
  v_from date;
  v_to date;
begin
  -- ============================================================
  -- SEMANA REPORTADA
  -- ============================================================
  v_from := report_week_start;
  v_to   := this_week_start;

  select coalesce(sum(o.total), 0),
         count(*),
         coalesce(sum((select sum(oi.quantity) from public.order_items oi where oi.order_id = o.id)), 0),
         coalesce(sum(o.delivery_cost), 0)
  into current_week_sales, current_week_orders, current_week_items, current_week_delivery
  from public.orders o
  where o.payment_status = 'paid'
    and o.paid_at >= v_from::timestamp at time zone 'America/Bogota'
    and o.paid_at <  v_to::timestamp at time zone 'America/Bogota';

  -- Costo de productos. Si algun item no tiene costo registrado se cuenta
  -- aparte: es preferible decir "incompleta" a mostrar una utilidad inflada.
  select coalesce(sum(oi.unit_cost_snapshot * oi.quantity)
                   filter (where oi.unit_cost_snapshot is not null), 0),
         count(*) filter (where oi.unit_cost_snapshot is null)
  into current_week_cost, current_week_missing_cost
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.payment_status = 'paid'
    and o.paid_at >= v_from::timestamp at time zone 'America/Bogota'
    and o.paid_at <  v_to::timestamp at time zone 'America/Bogota';

  -- Costo del fiado vendido ESTA semana y aun no cobrado. Se resta de la
  -- utilidad: ya le pagaste al proveedor y ese dinero no es tuyo hasta que
  -- te lo paguen.
  --
  -- OJO: va acotado por created_at a la semana reportada. Sin ese filtro
  -- traia el costo de TODO el fiado pendiente desde siempre y lo restaba de
  -- una sola semana, lo que hangue la utilidad en negativo por ventas a
  -- credito de meses anteriores. El saldo total va aparte, en credit.
  select coalesce(sum(oi.unit_cost_snapshot * oi.quantity), 0)
  into current_week_credit_cost
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.payment_status in ('credit', 'partial')
    and o.created_at >= v_from::timestamp at time zone 'America/Bogota'
    and o.created_at <  v_to::timestamp at time zone 'America/Bogota'
    and oi.unit_cost_snapshot is not null;

  -- ============================================================
  -- SEMANA ANTERIOR (para comparar)
  -- ============================================================
  v_from := previous_week_start;
  v_to   := report_week_start;

  select coalesce(sum(o.total), 0), count(*), coalesce(sum(o.delivery_cost), 0)
  into previous_week_sales, previous_week_orders, previous_week_delivery
  from public.orders o
  where o.payment_status = 'paid'
    and o.paid_at >= v_from::timestamp at time zone 'America/Bogota'
    and o.paid_at <  v_to::timestamp at time zone 'America/Bogota';

  select coalesce(sum(oi.unit_cost_snapshot * oi.quantity)
                   filter (where oi.unit_cost_snapshot is not null), 0)
  into previous_week_cost
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.payment_status = 'paid'
    and o.paid_at >= v_from::timestamp at time zone 'America/Bogota'
    and o.paid_at <  v_to::timestamp at time zone 'America/Bogota';

  select coalesce(sum(amount), 0)
  into previous_week_expenses
  from public.expenses
  where expense_date >= previous_week_start and expense_date < report_week_start;

  -- ============================================================
  -- MES ANTERIOR
  -- ============================================================
  select coalesce(sum(o.total), 0)
  into last_month_sales
  from public.orders o
  where o.payment_status = 'paid'
    and o.paid_at >= last_month_start::timestamp at time zone 'America/Bogota'
    and o.paid_at <  this_month_start::timestamp at time zone 'America/Bogota';

  -- ============================================================
  -- PRODUCTO MAS VENDIDO
  -- ============================================================
  select oi.product_name_snapshot, sum(oi.quantity)
  into best_product_this_week, best_product_week_qty
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.payment_status = 'paid'
    and o.paid_at >= report_week_start::timestamp at time zone 'America/Bogota'
    and o.paid_at <  this_week_start::timestamp at time zone 'America/Bogota'
  group by oi.product_name_snapshot
  order by sum(oi.quantity) desc
  limit 1;

  select oi.product_name_snapshot, sum(oi.quantity)
  into best_product_last_month, best_product_month_qty
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.payment_status = 'paid'
    and o.paid_at >= last_month_start::timestamp at time zone 'America/Bogota'
    and o.paid_at <  this_month_start::timestamp at time zone 'America/Bogota'
  group by oi.product_name_snapshot
  order by sum(oi.quantity) desc
  limit 1;

  -- Top 5 de la semana: util cuando se venden pocas unidades
  select coalesce(jsonb_agg(t), '[]'::jsonb)
  into top_products
  from (
    select oi.product_name_snapshot as name,
           sum(oi.quantity) as quantity,
           sum(oi.subtotal) as revenue
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.payment_status = 'paid'
      and o.paid_at >= report_week_start::timestamp at time zone 'America/Bogota'
      and o.paid_at <  this_week_start::timestamp at time zone 'America/Bogota'
    group by oi.product_name_snapshot
    order by sum(oi.quantity) desc, sum(oi.subtotal) desc
    limit 5
  ) t;

  -- ============================================================
  -- CLIENTES, STOCK, PEDIDOS
  -- ============================================================
  select count(*)
  into new_customers_count
  from public.customers
  where created_at >= report_week_start::timestamp at time zone 'America/Bogota'
    and created_at <  this_week_start::timestamp at time zone 'America/Bogota';

  select count(*)
  into low_stock_count
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  where pv.active = true and p.active = true and pv.stock <= pv.min_stock;

  -- Lista concreta: el total solo no dice que se compre nada
  select coalesce(jsonb_agg(t order by t.stock asc), '[]'::jsonb)
  into low_stock_list
  from (
    select p.name as name, pv.stock as stock, pv.min_stock as min_stock
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.active = true and p.active = true and pv.stock <= pv.min_stock
    order by pv.stock asc
    limit 10
  ) t;

  select count(*)
  into pending_orders_count
  from public.orders
  where payment_status = 'pending' and status = 'confirmed';

  -- ============================================================
  -- GASTOS
  -- ============================================================
  select coalesce(sum(amount), 0)
  into weekly_expenses
  from public.expenses
  where expense_date >= report_week_start and expense_date < this_week_start;

  select coalesce(sum(amount), 0)
  into monthly_expenses
  from public.expenses
  where expense_date >= this_month_start and expense_date < (this_month_start + interval '1 month')::date;

  -- ============================================================
  -- CREDITO (bloque preexistente, conservado)
  -- ============================================================
  select coalesce(sum(o.total), 0), count(*)
  into credit_week_sales, credit_week_orders
  from public.orders o
  where o.payment_status in ('credit', 'partial')
    and o.status in ('confirmed', 'shipped', 'delivered')
    and o.created_at >= report_week_start::timestamp at time zone 'America/Bogota'
    and o.created_at <  this_week_start::timestamp at time zone 'America/Bogota';

  select coalesce(sum(cp.amount), 0)
  into credit_week_collected
  from public.customer_credit_payments cp
  join public.orders o on o.id = cp.order_id
  where cp.paid_at >= report_week_start::timestamp at time zone 'America/Bogota'
    and cp.paid_at <  this_week_start::timestamp at time zone 'America/Bogota';

  select coalesce(sum(credit_amount), 0)
  into credit_outstanding_balance
  from public.orders
  where payment_status in ('credit', 'partial');

  select coalesce(sum(credit_amount), 0)
  into credit_overdue_balance
  from public.orders
  where payment_status in ('credit', 'partial')
    and credit_due_date < current_date;

  select count(distinct customer_id)
  into credit_customers_overdue
  from public.orders
  where payment_status in ('credit', 'partial')
    and credit_due_date < current_date;

  -- Costo de producto de todo el fiado pendiente. NO entra en la utilidad
  -- semanal (esa solo descuenta el fiado de la semana), pero conviene
  -- mostrarlo: es plata que ya invertiste y todavia no te devolvieron.
  select coalesce(sum(oi.unit_cost_snapshot * oi.quantity), 0)
  into credit_outstanding_cost
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.payment_status in ('credit', 'partial')
    and oi.unit_cost_snapshot is not null;

  avg_order_value := case when current_week_orders > 0
                          then current_week_sales / current_week_orders
                          else 0 end;

  -- ============================================================
  -- RESULTADO
  -- ============================================================
  result := jsonb_build_object(
    'report_date', local_today,
    'week_start', report_week_start,
    'week_end', report_week_end,
    'current_week', jsonb_build_object(
      'sales', current_week_sales,
      'orders', current_week_orders,
      'items_sold', current_week_items,
      'average_order_value', avg_order_value,
      'product_cost', current_week_cost,
      'delivery_cost', current_week_delivery,
      'credit_cost', current_week_credit_cost,
      'expenses', weekly_expenses,
      'missing_cost_items', current_week_missing_cost,
      -- Utilidad con la misma formula del dashboard:
      --   ventas - costo productos - domicilio - gastos - costo del fiado
      'net_profit', current_week_sales - current_week_cost
                      - current_week_delivery - weekly_expenses
                      - current_week_credit_cost
    ),
    'previous_week', jsonb_build_object(
      'sales', previous_week_sales,
      'orders', previous_week_orders,
      'product_cost', previous_week_cost,
      'delivery_cost', previous_week_delivery,
      'expenses', previous_week_expenses,
      'net_profit', previous_week_sales - previous_week_cost
                      - previous_week_delivery - previous_week_expenses
    ),
    'last_month', jsonb_build_object(
      'sales', last_month_sales
    ),
    'best_product_this_week', jsonb_build_object(
      'name', coalesce(best_product_this_week, 'N/A'),
      'quantity', coalesce(best_product_week_qty, 0)
    ),
    'best_product_last_month', jsonb_build_object(
      'name', coalesce(best_product_last_month, 'N/A'),
      'quantity', coalesce(best_product_month_qty, 0)
    ),
    'top_products', top_products,
    'new_customers', new_customers_count,
    'low_stock_count', low_stock_count,
    'low_stock_products', low_stock_list,
    'pending_orders', pending_orders_count,
    'expenses', jsonb_build_object(
      'weekly', weekly_expenses,
      'monthly', monthly_expenses
    ),
    'credit', jsonb_build_object(
      'week_sales', credit_week_sales,
      'week_orders', credit_week_orders,
      'week_collected', credit_week_collected,
      'outstanding_balance', credit_outstanding_balance,
      'overdue_balance', credit_overdue_balance,
      'customers_overdue', credit_customers_overdue,
      -- Costo de lo vendido a fiado y aun no cobrado. Se muestra aparte a
      -- proposito: es plata tuya que esta afuera, no una perdida de la semana.
      'outstanding_cost', credit_outstanding_cost
    )
  );

  return result;
end;
$$;

revoke all on function public.weekly_sales_report() from public;
revoke all on function public.weekly_sales_report() from anon, authenticated;
grant execute on function public.weekly_sales_report() to authenticated, service_role;

-- ============================================
-- CRON: verificar/reprogramar el envio de los domingos 8am Colombia
-- ============================================
-- 1pm UTC = 8am America/Bogota. pg_cron trabaja en UTC siempre.
--
-- Se mantiene pg_cron y NO n8n/Make: la llave service_role quedaria
-- expuesta en un tercero sin necesidad. pg_cron ya vive en el proyecto.
create extension if not exists pg_cron with schema extensions;

select cron.unschedule(jobid)
from cron.job
where jobname = 'weekly-sales-report';

select cron.schedule(
  'weekly-sales-report',
  '0 13 * * 0',
  $weekly$
    select net.http_post(
      url := 'https://' || current_setting('app.settings.supabase_url', true) || '/functions/v1/weekly-report',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key', true),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $weekly$
);