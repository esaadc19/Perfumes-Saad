-- Los abonos de fiado que siguen abiertos son plata cobrada: suman a la
-- utilidad del reporte semanal y a su margen. El costo del fiado se sigue
-- restando completo hasta que el pedido se salde, igual que en el dashboard.
--
-- current_week.sales sigue siendo la venta pagada (para pedidos, ticket y
-- productos). Se agregan credit_collected (abonos de fiados abiertos) y
-- cash_collected (sales + credit_collected). previous_week recibe los mismos
-- campos para comparar manzanas con manzanas.
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

  -- No se puede(reportar) un rango invertido ni que termine en el futuro.
  if v_to <= v_from then
    raise exception 'El rango del reporte no es válido: la fecha final debe ser posterior a la inicial.';
  end if;
  if v_from > local_today then
    raise exception 'No se puede generar un reporte de una fecha futura.';
  end if;
  if v_to > local_today + 1 then
    v_to := local_today + 1;
  end if;

  -- El periodo anterior tiene la misma duración, hacia atrás.
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

  -- Costo de productos. Los items sin costo se cuentan aparte: es mejor
  -- avisar que la utilidad no es de fiar que mostrarla inflada.
  select coalesce(sum(oi.unit_cost_snapshot * oi.quantity)
                   filter (where oi.unit_cost_snapshot is not null), 0),
         count(*) filter (where oi.unit_cost_snapshot is null)
  into current_week_cost, current_week_missing_cost
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.payment_status = 'paid'
    and o.paid_at >= v_from::timestamp at time zone 'America/Bogota'
    and o.paid_at <  v_to::timestamp at time zone 'America/Bogota';

  -- Costo del fiado vendido en el periodo y aun no cobrado. Va acotado al
  -- rango: el fiado de meses atras no hunde la utilidad de hoy. Ese saldo
  -- total se reporta aparte en credit.outstanding_cost.
  select coalesce(sum(oi.unit_cost_snapshot * oi.quantity), 0)
  into current_week_credit_cost
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.payment_status in ('credit', 'partial')
    and o.created_at >= v_from::timestamp at time zone 'America/Bogota'
    and o.created_at <  v_to::timestamp at time zone 'America/Bogota'
    and oi.unit_cost_snapshot is not null;

  -- Abonos recibidos en el periodo de fiados que siguen abiertos. Es plata
  -- que ya entro y por eso suma a la utilidad cobrada. Los abonos de un
  -- pedido que ya quedo pagado no se suman aqui: ese pedido completo ya
  -- esta en current_week_sales.
  select coalesce(sum(cp.amount), 0)
  into current_week_credit_collected
  from public.customer_credit_payments cp
  join public.orders o on o.id = cp.order_id
  where o.payment_status in ('credit', 'partial')
    and cp.paid_at >= v_from::timestamp at time zone 'America/Bogota'
    and cp.paid_at <  v_to::timestamp at time zone 'America/Bogota'
    and cp.paid_at <= now();

  -- ============================================================
  -- PERIODO ANTERIOR (misma duracion, para comparar)
  -- ============================================================
  select coalesce(sum(o.total), 0), count(*), coalesce(sum(o.delivery_cost), 0)
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
  where expense_date >= v_prev_from and expense_date < v_prev_to;

  select coalesce(sum(cp.amount), 0)
  into previous_week_credit_collected
  from public.customer_credit_payments cp
  join public.orders o on o.id = cp.order_id
  where o.payment_status in ('credit', 'partial')
    and cp.paid_at >= v_prev_from::timestamp at time zone 'America/Bogota'
    and cp.paid_at <  v_prev_to::timestamp at time zone 'America/Bogota'
    and cp.paid_at <= now();

  -- ============================================================
  -- MES ANTERIOR (se mantiene, el correo lo compara con el mes en curso)
  -- ============================================================
  select coalesce(sum(o.total), 0)
  into last_month_sales
  from public.orders o
  where o.payment_status = 'paid'
    and o.paid_at >= date_trunc('month', local_today)::date::timestamp at time zone 'America/Bogota'
    and o.paid_at <  (date_trunc('month', local_today)::date + interval '1 month')::date::timestamp at time zone 'America/Bogota';

  -- ============================================================
  -- PRODUCTOS
  -- ============================================================
  select oi.product_name_snapshot, sum(oi.quantity)
  into best_product_this_week, best_product_week_qty
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.payment_status = 'paid'
    and o.paid_at >= v_from::timestamp at time zone 'America/Bogota'
    and o.paid_at <  v_to::timestamp at time zone 'America/Bogota'
  group by oi.product_name_snapshot
  order by sum(oi.quantity) desc
  limit 1;

  select oi.product_name_snapshot, sum(oi.quantity)
  into best_product_last_month, best_product_month_qty
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.payment_status = 'paid'
    and o.paid_at >= date_trunc('month', local_today)::date::timestamp at time zone 'America/Bogota'
    and o.paid_at <  (date_trunc('month', local_today)::date + interval '1 month')::date::timestamp at time zone 'America/Bogota'
  group by oi.product_name_snapshot
  order by sum(oi.quantity) desc
  limit 1;

  -- El top trae la familia del producto (Amaderado, Árabe...) para el
  -- correo. variant_id puede ser nulo en items viejos: left join.
  select coalesce(jsonb_agg(t), '[]'::jsonb)
  into top_products
  from (
    select oi.product_name_snapshot as name,
           sum(oi.quantity) as quantity,
           sum(oi.subtotal) as revenue,
           min(p.family) as family
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.product_variants pv on pv.id = oi.variant_id
    left join public.products p on p.id = pv.product_id
    where o.payment_status = 'paid'
      and o.paid_at >= v_from::timestamp at time zone 'America/Bogota'
      and o.paid_at <  v_to::timestamp at time zone 'America/Bogota'
    group by oi.product_name_snapshot
    order by sum(oi.quantity) desc, sum(oi.subtotal) desc
    limit 5
  ) t;

  -- ============================================================
  -- CANALES Y COMPRADORES
  -- ============================================================
  -- La tienda registra al cliente con source web/web_guest; lo que entra
  -- por el panel (WhatsApp, asesores) queda como direct o null heredado.
  select coalesce(jsonb_agg(t), '[]'::jsonb)
  into channel_list
  from (
    select case when c.source in ('web', 'web_guest') then 'web' else 'direct' end as channel,
           count(*) as orders,
           coalesce(sum(o.total), 0) as revenue
    from public.orders o
    left join public.customers c on c.id = o.customer_id
    where o.payment_status = 'paid'
      and o.paid_at >= v_from::timestamp at time zone 'America/Bogota'
      and o.paid_at <  v_to::timestamp at time zone 'America/Bogota'
    group by 1
  ) t;

  with period_buyers as (
    select distinct o.customer_id
    from public.orders o
    where o.payment_status = 'paid'
      and o.paid_at >= v_from::timestamp at time zone 'America/Bogota'
      and o.paid_at <  v_to::timestamp at time zone 'America/Bogota'
  ),
  first_paid as (
    select o.customer_id, min(o.paid_at) as first_paid_at
    from public.orders o
    where o.payment_status = 'paid'
    group by o.customer_id
  )
  select count(*) filter (where fp.first_paid_at >= v_from::timestamp at time zone 'America/Bogota'),
         count(*) filter (where fp.first_paid_at <  v_from::timestamp at time zone 'America/Bogota')
  into new_buyers, returning_buyers
  from period_buyers pb
  join first_paid fp on fp.customer_id = pb.customer_id;

  -- ============================================================
  -- CLIENTES, STOCK, PEDIDOS
  -- ============================================================
  select count(*)
  into new_customers_count
  from public.customers
  where created_at >= v_from::timestamp at time zone 'America/Bogota'
    and created_at <  v_to::timestamp at time zone 'America/Bogota';

  select count(*)
  into low_stock_count
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  where pv.active = true and p.active = true and pv.stock <= pv.min_stock;

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
  where expense_date >= v_from and expense_date < v_to;

  select coalesce(sum(amount), 0)
  into monthly_expenses
  from public.expenses
  where expense_date >= date_trunc('month', local_today)::date
    and expense_date < (date_trunc('month', local_today)::date + interval '1 month')::date;

  -- ============================================================
  -- CREDITO
  -- ============================================================
  select coalesce(sum(o.total), 0), count(*)
  into credit_week_sales, credit_week_orders
  from public.orders o
  where o.payment_status in ('credit', 'partial')
    and o.created_at >= v_from::timestamp at time zone 'America/Bogota'
    and o.created_at <  v_to::timestamp at time zone 'America/Bogota';

  select coalesce(sum(cp.amount), 0)
  into credit_week_collected
  from public.customer_credit_payments cp
  where cp.paid_at >= v_from::timestamp at time zone 'America/Bogota'
    and cp.paid_at <  v_to::timestamp at time zone 'America/Bogota';

  -- Inventario: lo que te deben hoy, independiente del periodo elegido.
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

  -- Margen: solo si no falta ningun costo. Dividir por cero daria null.
  -- El denominador es la plata cobrada: ventas pagadas mas abonos de fiado.
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