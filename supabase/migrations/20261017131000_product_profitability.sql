-- Rentabilidad por producto: no solo cuanto se vendio en total, sino que
-- perfume deja mas utilidad.
--
-- El dashboard dice "vendiste $1.630.000 y ganaste $326.825". No dice que
-- un perfume con 10 unidades y $50.000 de utilidad es mejor negocio que
-- otro con 25 unidades y $2.000.
--
-- Utilidad real por producto = precio cobrado - costo del producto.
-- Se usan los snapshots del pedido (unit_price, unit_cost_snapshot), no
-- el precio y el costo actuales: si cambiaste el precio despues, la
-- utilidad de esa venta no se mueve.
--
-- Si falta el costo de alguna unidad, se cuenta aparte en
-- missing_cost_items y esa fila NO suma al total de utilidad, porque
-- sumarla seria mostrar un numero que no existe.
--
-- Es idempotente: se puede correr mas de una vez.

create or replace function public.admin_product_profitability(
  p_period_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  local_today date := (now() at time zone 'America/Bogota')::date;
  v_from timestamptz;
  v_to timestamptz := (local_today + 1)::timestamp at time zone 'America/Bogota';
  filas jsonb;
  total_utilidad numeric;
  total_ventas numeric;
  total_costo numeric;
  total_faltantes integer;
  resultado jsonb;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if p_period_days is not null and p_period_days > 0 then
    v_from := v_to - make_interval(days => p_period_days);
  else
    v_from := timestamptz '2000-01-01 00:00:00';
  end if;

  select
    coalesce(jsonb_agg(t), '[]'::jsonb),
    coalesce(sum(t.utilidad), 0),
    coalesce(sum(t.ventas), 0),
    coalesce(sum(t.costo), 0),
    coalesce(sum(t.faltantes), 0)
  into filas, total_utilidad, total_ventas, total_costo, total_faltantes
  from (
    select
      oi.product_name_snapshot as nombre,
      oi.size_ml,
      sum(oi.quantity) as unidades,
      sum(oi.subtotal) as ventas,
      sum(oi.unit_cost_snapshot * oi.quantity)
        filter (where oi.unit_cost_snapshot is not null) as costo,
      count(*) filter (where oi.unit_cost_snapshot is null) as faltantes,
      -- Solo es calculable si TODAS las unidades tienen costo conocido.
      case
        when count(*) filter (where oi.unit_cost_snapshot is null) = 0
          then sum(oi.subtotal) - sum(oi.unit_cost_snapshot * oi.quantity)
        else null
      end as utilidad
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.payment_status = 'paid'
      and o.paid_at >= v_from
      and o.paid_at <  v_to
    group by oi.product_name_snapshot, oi.size_ml
  ) t;

  resultado := jsonb_build_object(
    'period_days', p_period_days,
    'from', v_from,
    'to', v_to,
    'products', filas,
    'totals', jsonb_build_object(
      'sales', total_ventas,
      'cost', total_costo,
      'profit', total_utilidad,
      'missing_cost_items', total_faltantes,
      -- Utilidad total solo si no falta ningun costo en ningun producto.
      -- Con costos incompletos, el margen seria una estimacion sin base.
      'complete', total_faltantes = 0,
      'margin_percent', case
        when total_faltantes = 0 and total_ventas > 0
          then round((total_utilidad / total_ventas) * 100, 1)
        else null
      end
    )
  );

  return resultado;
end;
$$;

revoke all on function public.admin_product_profitability(integer) from public;
revoke all on function public.admin_product_profitability(integer) from anon, authenticated;
grant execute on function public.admin_product_profitability(integer) to authenticated, service_role;