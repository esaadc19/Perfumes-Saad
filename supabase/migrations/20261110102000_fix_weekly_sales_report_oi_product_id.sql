-- Asegurar que orders tenga columna sales_channel si no existe
alter table public.orders add column if not exists sales_channel text default 'direct';

-- Corrige error: column oi.product_id does not exist uniendo mediante product_variants pv,
-- corrige p.family (no olfactive_family), agrega group by a best_product_last_month
-- y asegura canal de venta default
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
         coalesce(sum(o.delivery_cost), 0)
  into previous_week_sales, previous_week_orders, previous_week_delivery
  from public.orders o
  where o.payment_status = 'paid'
    and o.paid_at >= v_prev_from::timestamp at time zone 'America/Bogota'
    and o.paid_at <  v_prev_to::timestamp at time zone 'America/Bogota';

  select coalesce(sum(oi.unit_cost_snapshot * oi.quantity)
                   filter (where oi.unit_cost_snapshot is not null), 0)
  into previous_week_cost
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.payment_status = 'paid'
    and o.paid_at >= v_prev_from::timestamp at time zone 'America/Bogota'
    and o.paid_at <  v_prev_to::timestamp at time zone 'America/Bogota';

  select coalesce(sum(amount), 0)
  into previous_week_expenses
  from public.expenses
  where expense_date >= v_prev_from
    and expense_date <  v_prev_to;

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
    and o.paid_at >= (date_trunc('month', local_today - interval '1 month'))::timestamp at time zone 'America/Bogota'
    and o.paid_at <  (date_trunc('month', local_today))::timestamp at time zone 'America/Bogota';

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
    and o.paid_at >= (date_trunc('month', local_today) - interval '1 month')::timestamp at time zone 'America/Bogota'
    and o.paid_at <  (date_trunc('month', local_today))::timestamp at time zone 'America/Bogota'
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
           max(p.family) as olfactive_family
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.product_variants pv on pv.id = oi.variant_id
    left join public.products p on p.id = pv.product_id
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
  -- CANALES DE VENTA
  -- ============================================================
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'channel', ch.sales_channel,
      'orders', ch.channel_orders,
      'revenue', ch.channel_rev
    ) order by ch.channel_rev desc
  ), '[]'::jsonb)
  into channel_list
  from (
    select coalesce(o.sales_channel, 'directo') as sales_channel,
           count(*) as channel_orders,
           coalesce(sum(o.total), 0) as channel_rev
    from public.orders o
    where o.payment_status = 'paid'
      and o.paid_at >= v_from::timestamp at time zone 'America/Bogota'
      and o.paid_at <  v_to::timestamp at time zone 'America/Bogota'
    group by coalesce(o.sales_channel, 'directo')
  ) ch;

  -- ============================================================
  -- COMPRADORES NUEVOS VS RECURRENTES
  -- ============================================================
  select
    count(distinct case when prev_orders.prior_count = 0 then o.customer_id end),
    count(distinct case when prev_orders.prior_count > 0 then o.customer_id end)
  into new_buyers, returning_buyers
  from public.orders o
  left join lateral (
    select count(*) as prior_count
    from public.orders o_prior
    where o_prior.customer_id = o.customer_id
      and o_prior.payment_status = 'paid'
      and o_prior.paid_at < v_from::timestamp at time zone 'America/Bogota'
  ) prev_orders on true
  where o.payment_status = 'paid'
    and o.paid_at >= v_from::timestamp at time zone 'America/Bogota'
    and o.paid_at <  v_to::timestamp at time zone 'America/Bogota'
    and o.customer_id is not null;

  -- ============================================================
  -- OPERACIONAL
  -- ============================================================
  select count(*)
  into new_customers_count
  from public.customers
  where created_at >= v_from::timestamp at time zone 'America/Bogota'
    and created_at <  v_to::timestamp at time zone 'America/Bogota';

  select count(distinct p.id)
  into low_stock_count
  from public.products p
  join public.product_variants pv on pv.product_id = p.id
  where p.active = true
    and pv.stock between 1 and 3;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'name', ls.name,
      'brand', ls.brand,
      'size_ml', ls.size_ml,
      'stock', ls.stock
    ) order by ls.stock asc
  ), '[]'::jsonb)
  into low_stock_list
  from (
    select p.name, p.brand, pv.size_ml, pv.stock
    from public.products p
    join public.product_variants pv on pv.product_id = p.id
    where p.active = true
      and pv.stock between 1 and 3
    order by pv.stock asc
    limit 5
  ) ls;

  select count(*)
  into pending_orders_count
  from public.orders
  where status in ('pending_confirmation', 'confirmed', 'shipped')
    and payment_status != 'cancelled';

  -- ============================================================
  -- GASTOS
  -- ============================================================
  select coalesce(sum(amount), 0)
  into weekly_expenses
  from public.expenses
  where expense_date >= v_from
    and expense_date <  v_to;

  select coalesce(sum(amount), 0)
  into monthly_expenses
  from public.expenses
  where expense_date >= date_trunc('month', local_today)::date
    and expense_date <= local_today;

  -- ============================================================
  -- CARTERA
  -- ============================================================
  select coalesce(sum(total), 0), count(*)
  into credit_week_sales, credit_week_orders
  from public.orders
  where payment_status in ('credit', 'partial')
    and created_at >= v_from::timestamp at time zone 'America/Bogota'
    and created_at <  v_to::timestamp at time zone 'America/Bogota';

  select coalesce(sum(cp.amount), 0)
  into credit_week_collected
  from public.customer_credit_payments cp
  join public.orders o on o.id = cp.order_id
  where o.payment_status in ('credit', 'partial')
    and cp.paid_at >= v_from::timestamp at time zone 'America/Bogota'
    and cp.paid_at <  v_to::timestamp at time zone 'America/Bogota'
    and cp.paid_at <= now();

  select coalesce(sum(o.total - coalesce(paid_so_far.total_paid, 0)), 0)
  into credit_outstanding_balance
  from public.orders o
  left join lateral (
    select sum(cp.amount) as total_paid
    from public.customer_credit_payments cp
    where cp.order_id = o.id
  ) paid_so_far on true
  where o.payment_status in ('credit', 'partial');

  select coalesce(sum(overdue.balance), 0)
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
