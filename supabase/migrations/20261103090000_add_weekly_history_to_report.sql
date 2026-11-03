-- Agrega historial de 8 semanas al reporte para alimentar el grafico de barras del correo ejecutivo
create or replace function public.weekly_sales_report(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  local_today date := (now() at time zone 'America/Bogota')::date;
  this_week_start date := date_trunc('week', local_today)::date;

  v_from date;
  v_to date;
  v_prev_from date;
  v_prev_to date;

  current_week_sales numeric;
  current_week_orders integer;
  current_week_items integer;
  current_week_cost numeric;
  current_week_delivery numeric;
  current_week_missing_cost integer;
  current_week_credit_cost numeric;
  current_week_credit_collected numeric;
  current_week_cash_collected numeric;

  previous_week_sales numeric;
  previous_week_orders integer;
  previous_week_cost numeric;
  previous_week_delivery numeric;
  previous_week_expenses numeric;
  previous_week_credit_collected numeric;
  previous_week_cash_collected numeric;

  last_month_sales numeric;

  best_product_this_week text;
  best_product_last_month text;
  best_product_week_qty integer;
  best_product_month_qty integer;

  new_customers_count integer;
  low_stock_count integer;
  pending_orders_count integer;

  weekly_expenses numeric;
  monthly_expenses numeric;

  credit_week_sales numeric;
  credit_week_orders integer;
  credit_week_collected numeric;
  credit_outstanding_balance numeric;
  credit_overdue_balance numeric;
  credit_customers_overdue integer;
  credit_outstanding_cost numeric;

  avg_order_value numeric;
  net_margin numeric;
  low_stock_list jsonb;
  top_products jsonb;
  channel_list jsonb;
  new_buyers integer;
  returning_buyers integer;
  weekly_history jsonb;
  result jsonb;
begin
  -- ============================================================
  -- RANGO
  -- ============================================================
  if p_from is null then
    v_from := this_week_start - 7;
    v_to   := this_week_start;
  else
    v_from := p_from;
    v_to   := coalesce(p_to, local_today + 1);
  end if;

  if v_to <= v_from then
    raise exception 'El rango del reporte no es válido: la fecha final debe ser posterior a la inicial.';
  end if;
  if v_from > local_today then
    raise exception 'No se puede generar un reporte de una fecha futura.';
  end if;
  if v_to > local_today + 1 then
    v_to := local_today + 1;
  end if;

  v_prev_to   := v_from;
  v_prev_from := v_from - (v_to - v_from);

  -- ============================================================
  -- PERIODO ELEGIDO
  -- ============================================================
  select coalesce(sum(o.total), 0),
         count(*),
         coalesce(sum((select sum(oi.quantity) from public.order_items oi where oi.order_id = o.id)), 0),
         coalesce(sum(o.delivery_cost), 0)
  into current_week_sales, current_week_orders, current_week_items, current_week_delivery
  from public.orders o
  where o.payment_status = 'paid'
    and o.paid_at >= v_from::timestamp at time zone 'America/Bogota'
    and o.paid_at <  v_to::timestamp at time zone 'America/Bogota';

  select coalesce(sum(oi.unit_cost_snapshot * oi.quantity)
                   filter (where oi.unit_cost_snapshot is not null), 0),
         count(*) filter (where oi.unit_cost_snapshot is null)
  into current_week_cost, current_week_missing_cost
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.payment_status = 'paid'
    and o.paid_at >= v_from::timestamp at time zone 'America/Bogota'
    and o.paid_at <  v_to::timestamp at time zone 'America/Bogota';

  select coalesce(sum(oi.unit_cost_snapshot * oi.quantity), 0)
  into current_week_credit_cost
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.payment_status in ('credit', 'partial')
    and o.created_at >= v_from::timestamp at time zone 'America/Bogota'
    and o.created_at <  v_to::timestamp at time zone 'America/Bogota'
    and oi.unit_cost_snapshot is not null;

  select coalesce(sum(cp.amount), 0)
  into current_week_credit_collected
  from public.customer_credit_payments cp
  join public.orders o on o.id = cp.order_id
  where o.payment_status in ('credit', 'partial')
    and cp.paid_at >= v_from::timestamp at time zone 'America/Bogota'
    and cp.paid_at <  v_to::timestamp at time zone 'America/Bogota'
    and cp.paid_at <= now();

  -- ============================================================
  -- PERIODO ANTERIOR
  -- ============================================================
  select coalesce(sum(o.total), 0),
         count(*),
         coalesce(sum((select sum(oi.unit_cost_snapshot * oi.quantity)
                       from public.order_items oi where oi.order_id = o.id)), 0),
         coalesce(sum(o.delivery_cost), 0)
  into previous_week_sales, previous_week_orders, previous_week_cost, previous_week_delivery
  from public.orders o
  where o.payment_status = 'paid'
    and o.paid_at >= v_prev_from::timestamp at time zone 'America/Bogota'
    and o.paid_at <  v_prev_to::timestamp at time zone 'America/Bogota';

  select coalesce(sum(e.amount), 0)
  into previous_week_expenses
  from public.expenses e
  where e.expense_date >= v_prev_from
    and e.expense_date <  v_prev_to;

  select coalesce(sum(cp.amount), 0)
  into previous_week_credit_collected
  from public.customer_credit_payments cp
  join public.orders o on o.id = cp.order_id
  where o.payment_status in ('credit', 'partial')
    and cp.paid_at >= v_prev_from::timestamp at time zone 'America/Bogota'
    and cp.paid_at <  v_prev_to::timestamp at time zone 'America/Bogota'
    and cp.paid_at <= now();

  -- ============================================================
  -- MES ANTERIOR
  -- ============================================================
  select coalesce(sum(o.total), 0)
  into last_month_sales
  from public.orders o
  where o.payment_status = 'paid'
    and o.paid_at >= (date_trunc('month', local_today) - interval '1 month')
    and o.paid_at <  date_trunc('month', local_today);

  -- ============================================================
  -- PRODUCTOS DESTACADOS
  -- ============================================================
  select oi.product_name_snapshot, sum(oi.quantity)::integer
  into best_product_this_week, best_product_week_qty
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.payment_status = 'paid'
    and o.paid_at >= v_from::timestamp at time zone 'America/Bogota'
    and o.paid_at <  v_to::timestamp at time zone 'America/Bogota'
  group by oi.product_name_snapshot
  order by sum(oi.quantity) desc
  limit 1;

  select oi.product_name_snapshot, sum(oi.quantity)::integer
  into best_product_last_month, best_product_month_qty
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.payment_status = 'paid'
    and o.paid_at >= (date_trunc('month', local_today) - interval '1 month')
    and o.paid_at <  date_trunc('month', local_today)
  group by oi.product_name_snapshot
  order by sum(oi.quantity) desc
  limit 1;

  -- ============================================================
  -- TOP 5 PRODUCTOS
  -- ============================================================
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'name', top.product_name_snapshot,
      'quantity', top.total_qty,
      'revenue', top.total_rev,
      'family', top.olfactive_family
    ) order by top.total_qty desc, top.total_rev desc
  ), '[]'::jsonb)
  into top_products
  from (
    select oi.product_name_snapshot,
           sum(oi.quantity)::integer as total_qty,
           coalesce(sum(oi.unit_price * oi.quantity), 0) as total_rev,
           max(p.olfactive_family) as olfactive_family
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.products p on p.id = oi.product_id
    where o.payment_status = 'paid'
      and o.paid_at >= v_from::timestamp at time zone 'America/Bogota'
      and o.paid_at <  v_to::timestamp at time zone 'America/Bogota'
    group by oi.product_name_snapshot
    order by sum(oi.quantity) desc, sum(oi.unit_price * oi.quantity) desc
    limit 5
  ) top;

  -- ============================================================
  -- HISTORIAL 8 SEMANAS (Para gráfico de barras)
  -- ============================================================
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'label', w.label,
      'sales', coalesce(w_data.sales, 0)
    ) order by w.idx desc
  ), '[]'::jsonb)
  into weekly_history
  from (
    select
      i as idx,
      case when i = 0 then 'Actual' else 'S-' || i end as label,
      (v_from - (i * 7)) as w_start,
      (v_to - (i * 7)) as w_end
    from generate_series(7, 0, -1) as i
  ) w
  left join lateral (
    select coalesce(sum(o.total), 0) as sales
    from public.orders o
    where o.payment_status = 'paid'
      and o.paid_at >= w.w_start::timestamp at time zone 'America/Bogota'
      and o.paid_at <  w.w_end::timestamp at time zone 'America/Bogota'
  ) w_data on true;

  -- ============================================================
  -- CLIENTES Y CANALES
  -- ============================================================
  select count(*)
  into new_customers_count
  from public.customers c
  where c.created_at >= v_from::timestamp at time zone 'America/Bogota'
    and c.created_at <  v_to::timestamp at time zone 'America/Bogota';

  with period_orders as (
    select o.id, o.customer_id, coalesce(o.channel, 'direct') as channel, o.total
    from public.orders o
    where o.payment_status = 'paid'
      and o.paid_at >= v_from::timestamp at time zone 'America/Bogota'
      and o.paid_at <  v_to::timestamp at time zone 'America/Bogota'
  ),
  classified_customers as (
    select distinct po.customer_id,
      case when exists (
        select 1 from public.orders prior
        where prior.customer_id = po.customer_id
          and prior.payment_status = 'paid'
          and prior.paid_at < v_from::timestamp at time zone 'America/Bogota'
      ) then 'returning' else 'new' end as customer_type
    from period_orders po
    where po.customer_id is not null
  )
  select
    count(*) filter (where customer_type = 'new'),
    count(*) filter (where customer_type = 'returning')
  into new_buyers, returning_buyers
  from classified_customers;

  with period_orders as (
    select o.id, coalesce(o.channel, 'direct') as channel, o.total
    from public.orders o
    where o.payment_status = 'paid'
      and o.paid_at >= v_from::timestamp at time zone 'America/Bogota'
      and o.paid_at <  v_to::timestamp at time zone 'America/Bogota'
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'channel', ch.channel,
      'orders', coalesce(po.orders_count, 0),
      'revenue', coalesce(po.total_revenue, 0)
    ) order by coalesce(po.total_revenue, 0) desc
  ), '[]'::jsonb)
  into channel_list
  from (values ('direct'), ('web')) as ch(channel)
  left join (
    select channel, count(*) as orders_count, sum(total) as total_revenue
    from period_orders
    group by channel
  ) po on po.channel = ch.channel;

  -- ============================================================
  -- ALERTAS
  -- ============================================================
  select count(*)
  into low_stock_count
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  where pv.is_active = true
    and p.is_active = true
    and pv.stock_quantity <= pv.min_stock_alert;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'name', alert.full_name,
      'stock', alert.stock_quantity,
      'min_stock', alert.min_stock_alert
    ) order by alert.stock_quantity asc
  ), '[]'::jsonb)
  into low_stock_list
  from (
    select p.name || ' (' || pv.presentation || ')' as full_name,
           pv.stock_quantity,
           pv.min_stock_alert
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.is_active = true
      and p.is_active = true
      and pv.stock_quantity <= pv.min_stock_alert
    order by pv.stock_quantity asc
    limit 5
  ) alert;

  select count(*)
  into pending_orders_count
  from public.orders o
  where o.payment_status = 'pending';

  -- ============================================================
  -- GASTOS
  -- ============================================================
  select coalesce(sum(e.amount), 0)
  into weekly_expenses
  from public.expenses e
  where e.expense_date >= v_from
    and e.expense_date <  v_to;

  select coalesce(sum(e.amount), 0)
  into monthly_expenses
  from public.expenses e
  where e.expense_date >= date_trunc('month', local_today)::date
    and e.expense_date <= local_today;

  -- ============================================================
  -- CARTERA Y FIADO
  -- ============================================================
  select coalesce(sum(o.total), 0),
         count(*)
  into credit_week_sales, credit_week_orders
  from public.orders o
  where o.payment_status in ('credit', 'partial')
    and o.created_at >= v_from::timestamp at time zone 'America/Bogota'
    and o.created_at <  v_to::timestamp at time zone 'America/Bogota';

  select coalesce(sum(cp.amount), 0)
  into credit_week_collected
  from public.customer_credit_payments cp
  where cp.paid_at >= v_from::timestamp at time zone 'America/Bogota'
    and cp.paid_at <  v_to::timestamp at time zone 'America/Bogota'
    and cp.paid_at <= now();

  select coalesce(sum(balance), 0)
  into credit_outstanding_balance
  from (
    select o.total - coalesce(sum(cp.amount), 0) as balance
    from public.orders o
    left join public.customer_credit_payments cp on cp.order_id = o.id
    where o.payment_status in ('credit', 'partial')
    group by o.id, o.total
    having (o.total - coalesce(sum(cp.amount), 0)) > 0
  ) balances;

  select coalesce(sum(balance), 0)
  into credit_overdue_balance
  from (
    select o.total - coalesce(sum(cp.amount), 0) as balance
    from public.orders o
    left join public.customer_credit_payments cp on cp.order_id = o.id
    where o.payment_status in ('credit', 'partial')
      and o.credit_due_date < current_date
    group by o.id, o.total
    having (o.total - coalesce(sum(cp.amount), 0)) > 0
  ) overdue;

  select count(distinct customer_id)
  into credit_customers_overdue
  from public.orders
  where payment_status in ('credit', 'partial')
    and credit_due_date < current_date;

  select coalesce(sum(oi.unit_cost_snapshot * oi.quantity), 0)
  into credit_outstanding_cost
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.payment_status in ('credit', 'partial')
    and oi.unit_cost_snapshot is not null;

  current_week_cash_collected := current_week_sales + current_week_credit_collected;
  previous_week_cash_collected := previous_week_sales + previous_week_credit_collected;

  avg_order_value := case when current_week_orders > 0
                          then current_week_sales / current_week_orders
                          else 0 end;

  net_margin := case
    when current_week_cash_collected > 0 and current_week_missing_cost = 0
      then round(((current_week_cash_collected - current_week_cost
                   - current_week_delivery - weekly_expenses
                   - current_week_credit_cost) / current_week_cash_collected) * 100, 1)
    else null
  end;

  -- ============================================================
  -- RESULTADO
  -- ============================================================
  result := jsonb_build_object(
    'report_date', local_today,
    'week_start', v_from,
    'week_end', (v_to - 1)::date,
    'period', jsonb_build_object(
      'from', v_from,
      'to', (v_to - 1)::date,
      'days', (v_to - v_from),
      'previous_from', v_prev_from,
      'previous_to', (v_prev_to - 1)::date,
      'custom', p_from is not null
    ),
    'current_week', jsonb_build_object(
      'sales', current_week_sales,
      'credit_collected', current_week_credit_collected,
      'cash_collected', current_week_cash_collected,
      'orders', current_week_orders,
      'items_sold', current_week_items,
      'average_order_value', avg_order_value,
      'product_cost', current_week_cost,
      'delivery_cost', current_week_delivery,
      'credit_cost', current_week_credit_cost,
      'expenses', weekly_expenses,
      'missing_cost_items', current_week_missing_cost,
      'net_margin_percent', net_margin,
      'net_profit', current_week_cash_collected - current_week_cost
                      - current_week_delivery - weekly_expenses
                      - current_week_credit_cost
    ),
    'previous_week', jsonb_build_object(
      'sales', previous_week_sales,
      'credit_collected', previous_week_credit_collected,
      'cash_collected', previous_week_cash_collected,
      'orders', previous_week_orders,
      'product_cost', previous_week_cost,
      'delivery_cost', previous_week_delivery,
      'expenses', previous_week_expenses,
      'net_profit', previous_week_cash_collected - previous_week_cost
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
    'weekly_history', weekly_history,
    'channels', channel_list,
    'buyers', jsonb_build_object(
      'new', coalesce(new_buyers, 0),
      'returning', coalesce(returning_buyers, 0)
    ),
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
      'week_collected_open', current_week_credit_collected,
      'outstanding_balance', credit_outstanding_balance,
      'overdue_balance', credit_overdue_balance,
      'customers_overdue', credit_customers_overdue,
      'outstanding_cost', credit_outstanding_cost
    )
  );

  return result;
end;
$$;

revoke all on function public.weekly_sales_report(date, date) from public, anon, authenticated;
grant execute on function public.weekly_sales_report(date, date) to authenticated, service_role;
