-- ============================================================
-- Soporte para rango de fechas personalizado (p_from, p_to) en admin_dashboard_metrics
-- Permite filtrar por:
--   - Semana (7 días)
--   - Mes (30 días)
--   - Año (365 días)
--   - Rango personalizado (Desde p_from Hasta p_to)
-- ============================================================

drop function if exists public.admin_dashboard_metrics(integer);
drop function if exists public.admin_dashboard_metrics(integer, date, date);

create or replace function public.admin_dashboard_metrics(
  period_days integer default null,
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  v_today date := (now() at time zone 'America/Bogota')::date;
  v_from date;
  v_to date := v_today;
  v_prev_to date;
  v_prev_from date;
  v_diff_days integer;
  v_scoped boolean := false;

  -- Utilidad realizada (ventas cobradas, incluidos abonos)
  c_revenue numeric;
  c_cash_revenue numeric;
  c_cost numeric;
  c_delivery numeric;
  c_profit numeric;
  c_expenses numeric;

  -- Periodo anterior, para deltas
  p_revenue numeric;
  p_credit_collected numeric;
  p_cash_revenue numeric;
  p_cost numeric;
  p_delivery numeric;
  p_profit numeric;
  p_credit_pending numeric;
  p_expenses numeric;

  -- Credito pendiente de cobro
  cr_count integer;
  cr_revenue numeric;
  cr_cost numeric;
  cr_delivery numeric;
  cr_gross numeric;
  cr_collected numeric;
  cr_collected_open numeric;
  cr_locked_profit numeric;
  cr_cost_pending numeric;
  cr_outstanding numeric;
  cr_overdue numeric;
  cr_overdue_clients integer;
  cr_committed numeric;
begin
  perform public.admin_require_section('overview');

  -- Determinación del rango
  if p_from is not null and p_to is not null then
    v_scoped := true;
    v_from := p_from;
    v_to := p_to;
    v_diff_days := (v_to - v_from) + 1;
    v_prev_to := v_from - 1;
    v_prev_from := v_from - v_diff_days;
  elsif period_days is not null and period_days > 0 then
    v_scoped := true;
    v_diff_days := period_days;
    v_from := v_today - (period_days - 1);
    v_to := v_today;
    v_prev_to := v_from - 1;
    v_prev_from := v_from - period_days;
  end if;

  -- ==========================================================
  -- Utilidad realizada: ventas pagadas, por paid_at
  -- ==========================================================
  select
    coalesce(sum(o.total), 0),
    coalesce(sum(o.delivery_cost), 0)
  into c_revenue, c_delivery
  from public.orders o
  where o.payment_status = 'paid'
    and (not v_scoped or (
      (o.paid_at at time zone 'America/Bogota')::date between v_from and v_to
    ));

  select coalesce(sum(oi.unit_cost_snapshot * oi.quantity), 0)
  into c_cost
  from public.order_items oi
  where oi.unit_cost_snapshot is not null
    and oi.order_id in (
      select o.id from public.orders o
      where o.payment_status = 'paid'
        and (not v_scoped or (
          (o.paid_at at time zone 'America/Bogota')::date between v_from and v_to
        ))
    );

  select coalesce(sum(e.amount), 0)
  into c_expenses
  from public.expenses e
  where (not v_scoped) or (e.expense_date between v_from and v_to);

  -- ==========================================================
  -- Credito sin cobrar: costo que ya salio de tu bolsillo
  -- ==========================================================
  select count(*), coalesce(sum(o.total), 0), coalesce(sum(o.delivery_cost), 0)
  into cr_count, cr_revenue, cr_delivery
  from public.orders o
  where o.payment_status in ('credit', 'partial')
    and (not v_scoped or (
      (o.created_at at time zone 'America/Bogota')::date between v_from and v_to
    ));

  select coalesce(sum(oi.unit_cost_snapshot * oi.quantity), 0)
  into cr_cost
  from public.order_items oi
  where oi.unit_cost_snapshot is not null
    and oi.order_id in (
      select o.id from public.orders o
      where o.payment_status in ('credit', 'partial')
        and (not v_scoped or (
          (o.created_at at time zone 'America/Bogota')::date between v_from and v_to
        ))
    );

  cr_gross := cr_revenue - cr_cost - cr_delivery;

  select coalesce(sum(cp.amount), 0)
  into cr_collected
  from public.credit_payments cp
  join public.orders o on o.id = cp.order_id
  where o.payment_status in ('credit', 'partial')
    and (not v_scoped or (
      (cp.created_at at time zone 'America/Bogota')::date between v_from and v_to
    ));

  select coalesce(sum(cp.amount), 0)
  into cr_collected_open
  from public.credit_payments cp
  join public.orders o on o.id = cp.order_id
  where o.payment_status in ('credit', 'partial');

  cr_locked_profit := greatest(0, cr_gross - cr_collected_open);
  cr_cost_pending := greatest(0, (cr_cost + cr_delivery) - cr_collected);

  c_cash_revenue := c_revenue + cr_collected;
  c_profit := c_cash_revenue - c_cost - c_delivery - cr_cost_pending - c_expenses;

  -- ==========================================================
  -- Periodo anterior, para calcular tendencias
  -- ==========================================================
  if v_scoped then
    select coalesce(sum(o.total), 0), coalesce(sum(o.delivery_cost), 0)
    into p_revenue, p_delivery
    from public.orders o
    where o.payment_status = 'paid'
      and (o.paid_at at time zone 'America/Bogota')::date between v_prev_from and v_prev_to;

    select coalesce(sum(oi.unit_cost_snapshot * oi.quantity), 0)
    into p_cost
    from public.order_items oi
    where oi.unit_cost_snapshot is not null
      and oi.order_id in (
        select o.id from public.orders o
        where o.payment_status = 'paid'
          and (o.paid_at at time zone 'America/Bogota')::date between v_prev_from and v_prev_to
      );

    select coalesce(sum(cp.amount), 0)
    into p_credit_collected
    from public.credit_payments cp
    join public.orders o on o.id = cp.order_id
    where o.payment_status in ('credit', 'partial')
      and (cp.created_at at time zone 'America/Bogota')::date between v_prev_from and v_prev_to;

    declare
      p_cr_cost numeric;
      p_cr_del numeric;
    begin
      select coalesce(sum(o.delivery_cost), 0)
      into p_cr_del
      from public.orders o
      where o.payment_status in ('credit', 'partial')
        and (o.created_at at time zone 'America/Bogota')::date between v_prev_from and v_prev_to;

      select coalesce(sum(oi.unit_cost_snapshot * oi.quantity), 0)
      into p_cr_cost
      from public.order_items oi
      where oi.unit_cost_snapshot is not null
        and oi.order_id in (
          select o.id from public.orders o
          where o.payment_status in ('credit', 'partial')
            and (o.created_at at time zone 'America/Bogota')::date between v_prev_from and v_prev_to
        );

      p_credit_pending := greatest(0, (p_cr_cost + p_cr_del) - p_credit_collected);
    end;

    select coalesce(sum(e.amount), 0)
    into p_expenses
    from public.expenses e
    where e.expense_date between v_prev_from and v_prev_to;

    p_cash_revenue := p_revenue + p_credit_collected;
    p_profit := p_cash_revenue - p_cost - p_delivery - p_credit_pending - p_expenses;
  end if;

  -- Instantaneas
  select coalesce(sum(o.credit_amount), 0)
  into cr_outstanding
  from public.orders o
  where o.payment_status in ('credit', 'partial');

  select coalesce(sum(o.credit_amount), 0), count(distinct o.customer_id)
  into cr_overdue, cr_overdue_clients
  from public.orders o
  where o.payment_status in ('credit', 'partial')
    and o.credit_due_date < v_today;

  select coalesce(sum(re.amount), 0)
  into cr_committed
  from public.recurring_expenses re
  where re.active;

  select jsonb_build_object(
    'period_days', coalesce(period_days, v_diff_days),
    'period_from', v_from,
    'period_to', v_to,

    -- Realizado
    'total_orders', (select count(*) from public.orders),
    'pending_orders', (
      select count(*) from public.orders
      where payment_status = 'pending' and status = 'confirmed'
    ),
    'completed_sales', (
      select count(*) from public.orders o
      where o.payment_status = 'paid'
        and (not v_scoped or (
          (o.paid_at at time zone 'America/Bogota')::date between v_from and v_to
        ))
    ),
    'sales_revenue', c_cash_revenue,
    'sales_cost', c_cost,
    'sales_delivery_cost', c_delivery,
    'total_expenses', c_expenses,
    'committed_expenses', cr_committed,
    'credit_cost_pending', cr_cost_pending,
    'sales_profit', c_profit,
    'net_margin_percent', case
      when c_cash_revenue > 0 then round((c_profit / c_cash_revenue) * 100, 1)
      else 0
    end,

    -- Credito
    'credit_sales', cr_count,
    'credit_revenue', cr_revenue,
    'locked_credit_profit', cr_locked_profit,
    'credit_outstanding_balance', cr_outstanding,
    'credit_overdue_balance', cr_overdue,
    'credit_customers_with_overdue', cr_overdue_clients,

    -- Deltas
    'previous', jsonb_build_object(
      'sales_revenue', p_cash_revenue,
      'sales_profit', p_profit,
      'net_margin_percent', case
        when p_cash_revenue > 0 then round((p_profit / p_cash_revenue) * 100, 1)
        else 0
      end,
      'credit_cost_pending', p_credit_pending
    ),

    -- Inventario
    'customer_count', (select count(*) from public.customers),
    'low_stock_variants', (
      select count(*)
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
      where pv.active = true and p.active = true and pv.stock <= pv.min_stock
    ),
    'missing_cost_items', coalesce((
      select sum(oi.quantity)
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
      where o.payment_status = 'paid'
        and oi.unit_cost_snapshot is null
        and (not v_scoped or (
          (o.paid_at at time zone 'America/Bogota')::date between v_from and v_to
        ))
    ), 0),
    'top_products', coalesce((
      select jsonb_agg(ranked_products.product order by ranked_products.units desc)
      from (
        select jsonb_build_object(
          'name', oi.product_name_snapshot,
          'size_ml', oi.size_ml,
          'units', sum(oi.quantity),
          'revenue', sum(oi.subtotal),
          'cost', case
            when count(*) filter (where oi.unit_cost_snapshot is null) > 0 then null
            else sum(oi.unit_cost_snapshot * oi.quantity)
          end,
          'profit', case
            when count(*) filter (where oi.unit_cost_snapshot is null) > 0 then null
            else sum(oi.subtotal - oi.unit_cost_snapshot * oi.quantity)
          end
        ) as product,
        sum(oi.quantity) as units
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        where o.payment_status = 'paid'
        group by oi.product_name_snapshot, oi.size_ml
        order by sum(oi.quantity) desc, oi.product_name_snapshot
        limit 5
      ) ranked_products
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_dashboard_metrics(integer, date, date) from public, anon;
grant execute on function public.admin_dashboard_metrics(integer, date, date) to authenticated;
