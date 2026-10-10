-- ============================================================
-- La utilidad descuenta el costo de las ventas a credito que aun no
-- se han cobrado, y lo recupera cuando el fiado queda saldado.
--
-- Razon: al vender a fiado ya salio de tu bolsillo el costo del
-- producto, aunque la plata no entre hasta que pagan. Ocultarlo
-- inflaba la utilidad en los meses con mucho credito.
--
-- Formula:
--   sales_profit = utilidad_cobrada - costo_credito_no_cobrado
--
-- Ejemplo: vendes 320.000 con costo 280.000.
--   Al vender    -> utilidad baja 280.000 (el costo ya salio)
--   Al cobrar    -> utilidad sube 320.000 (el total, que ya incluye
--                    los 40.000 de utilidad)
--   Efecto neto  -> +40.000, el margen real de esa venta
-- ============================================================

begin;

drop function if exists public.admin_dashboard_metrics();

create or replace function public.admin_dashboard_metrics(
  period_days integer default null
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
  v_prev_to date;
  v_prev_from date;
  v_scoped boolean := period_days is not null and period_days > 0;

  -- Utilidad realizada (ventas cobradas)
  c_revenue numeric;
  c_cost numeric;
  c_delivery numeric;
  c_profit numeric;
  c_expenses numeric;

  -- Periodo anterior, para deltas
  p_revenue numeric;
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
  -- Costo yapagado de las ventas a credito que siguen sin cobrar.
  -- Es lo que se resta de la utilidad.
  cr_cost_pending numeric;
  cr_outstanding numeric;
  cr_overdue numeric;
  cr_overdue_clients integer;
  cr_committed numeric;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if v_scoped then
    v_from := v_today - (period_days - 1);
    v_prev_to := v_from - 1;
    v_prev_from := v_from - period_days;
  end if;

  -- ==========================================================
  -- Utilidad realizada: solo ventas cobradas (paid), por paid_at
  -- ==========================================================
  select
    coalesce(sum(o.total), 0),
    coalesce(sum(o.delivery_cost), 0)
  into c_revenue, c_delivery
  from public.orders o
  where o.payment_status = 'paid'
    and (not v_scoped or (
      (o.paid_at at time zone 'America/Bogota')::date between v_from and v_today
    ));

  select coalesce(sum(oi.unit_cost_snapshot * oi.quantity), 0)
  into c_cost
  from public.order_items oi
  where oi.unit_cost_snapshot is not null
    and oi.order_id in (
      select o.id from public.orders o
      where o.payment_status = 'paid'
        and (not v_scoped or (
          (o.paid_at at time zone 'America/Bogota')::date between v_from and v_today
        ))
    );

  select coalesce(sum(e.amount), 0)
  into c_expenses
  from public.expenses e
  where (not v_scoped) or (e.expense_date between v_from and v_today);

  -- ==========================================================
  -- Credito sin cobrar: costo que ya salio de tu bolsillo
  -- ==========================================================
  select count(*), coalesce(sum(o.total), 0), coalesce(sum(o.delivery_cost), 0)
  into cr_count, cr_revenue, cr_delivery
  from public.orders o
  where o.payment_status in ('credit', 'partial')
    and (not v_scoped or (
      (o.created_at at time zone 'America/Bogota')::date between v_from and v_today
    ));

  select coalesce(sum(oi.unit_cost_snapshot * oi.quantity), 0)
  into cr_cost
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.payment_status in ('credit', 'partial')
    and oi.unit_cost_snapshot is not null
    and (not v_scoped or (
      (o.created_at at time zone 'America/Bogota')::date between v_from and v_today
    ));

  -- Margen que sigue en cartera: entra a utilidad cuando se cobre.
  cr_gross := cr_revenue - cr_cost - cr_delivery;

  -- Lo que YA pagaste de esas ventas pero aun no te devolvieron.
  -- Es lo que la utilidad tiene que absorber mientras el fiado esta vivo.
  cr_cost_pending := cr_cost + cr_delivery;

  c_profit := (c_revenue - c_cost - c_delivery) - cr_cost_pending - c_expenses;

  -- ==========================================================
  -- Periodo anterior con la misma formula, para los deltas
  -- ==========================================================
  if v_scoped then
    select
      coalesce(sum(o.total), 0),
      coalesce(sum(o.delivery_cost), 0)
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

    select coalesce(sum(e.amount), 0)
    into p_expenses
    from public.expenses e
    where e.expense_date between v_prev_from and v_prev_to;

    -- Mismo criterio para el credito pendiente en el periodo anterior.
    select coalesce(sum(oi.unit_cost_snapshot * oi.quantity), 0)
      + coalesce((
        select sum(o.delivery_cost) from public.orders o
        where o.payment_status in ('credit', 'partial')
          and (o.created_at at time zone 'America/Bogota')::date between v_prev_from and v_prev_to
      ), 0)
    into p_credit_pending
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.payment_status in ('credit', 'partial')
      and oi.unit_cost_snapshot is not null
      and (o.created_at at time zone 'America/Bogota')::date between v_prev_from and v_prev_to;

    p_profit := (p_revenue - p_cost - p_delivery) - p_credit_pending - p_expenses;
  else
    p_revenue := 0; p_cost := 0; p_delivery := 0;
    p_profit := 0; p_credit_pending := 0; p_expenses := 0;
  end if;

  -- Instantaneas: no se acotan por periodo.
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
    'period_days', period_days,
    'period_from', v_from,
    'period_to', v_today,

    -- Realizado (cobrado)
    'total_orders', (select count(*) from public.orders),
    'pending_orders', (
      select count(*) from public.orders
      where payment_status = 'pending' and status = 'confirmed'
    ),
    'completed_sales', (
      select count(*) from public.orders o
      where o.payment_status = 'paid'
        and (not v_scoped or (
          (o.paid_at at time zone 'America/Bogota')::date between v_from and v_today
        ))
    ),
    'sales_revenue', c_revenue,
    'sales_cost', c_cost,
    'sales_delivery_cost', c_delivery,
    'total_expenses', c_expenses,
    'committed_expenses', cr_committed,

    -- Lo que ya pagaste de las ventas a fiado y sigue sin devolverte
    'credit_cost_pending', cr_cost_pending,

    'sales_profit', c_profit,
    'net_margin_percent', case
      when c_revenue > 0 then round((c_profit / c_revenue) * 100, 1)
      else 0
    end,

    -- Credito (pipeline)
    'credit_sales', cr_count,
    'credit_revenue', cr_revenue,
    'locked_credit_profit', cr_gross,
    'credit_outstanding_balance', cr_outstanding,
    'credit_overdue_balance', cr_overdue,
    'credit_customers_with_overdue', cr_overdue_clients,

    -- Deltas contra el periodo anterior
    'previous', jsonb_build_object(
      'sales_revenue', p_revenue,
      'sales_profit', p_profit,
      'net_margin_percent', case
        when p_revenue > 0 then round((p_profit / p_revenue) * 100, 1)
        else 0
      end,
      'credit_cost_pending', p_credit_pending
    ),

    -- Inventario y clientes (instantaneos)
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
          (o.paid_at at time zone 'America/Bogota')::date between v_from and v_today
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

revoke all on function public.admin_dashboard_metrics(integer) from public, anon;
grant execute on function public.admin_dashboard_metrics(integer) to authenticated;

commit;