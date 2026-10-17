-- Registro de merma, rotura e ingresos de mercancia.
--
-- Estado actual: inventory_movements existe y se llena (ventas, ajustes
-- manuales), pero los ajustes manuales son genericos: ponen el stock al
-- valor que uno escribe y guardan 'Manual stock adjustment'. No queda
-- registro de si fue una devolucion de proveedor, una caja mojada o un
-- robo, asi que al final del mes no hay forma de saber por que el stock
-- no cuadra.
--
-- Lo que agrega:
--   1. movement_type mas descriptivos, sin romper los existentes
--   2. una RPC que registra merma/ingreso con motivo y deja rastro
--   3. el historial por presentacion, para auditar un perfume puntual
--   4. un conteo de valor perdido en merma
--
-- Los movement_type nuevos son valores nuevos: los viejos ('sale',
-- 'adjustment_in', 'adjustment_out') se siguen leyendo igual, asi que no
-- hay que migrar datos.
--
-- Es idempotente: se puede correr mas de una vez.

-- Motivos de merma. El primero es el unico que NO se puede recuperar.
create or replace function public.register_stock_movement(
  target_variant_id uuid,
  movement text,
  movement_quantity integer,
  movement_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  variant_record public.product_variants%rowtype;
  previous_stock integer;
  new_stock integer;
  delta integer;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if movement not in ('merma', 'ingreso', 'devolucion_proveedor', 'rotura', 'robo', 'vencimiento') then
    raise exception 'Tipo de movimiento inválido: %', movement;
  end if;
  if movement_quantity is null or movement_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor que cero';
  end if;

  -- for update: dos movimientos sobre la misma presentacion a la vez
  -- tienen que ver el mismo stock inicial, o el segundo sobrescribe al
  -- primero y se pierde mercancia sin registro.
  select * into variant_record
  from public.product_variants
  where id = target_variant_id
  for update;
  if not found then
    raise exception 'Presentación no encontrada';
  end if;

  previous_stock := coalesce(variant_record.stock, 0);
  -- Los movimientos negativos restan; los positivos suman.
  delta := case
    when movement in ('ingreso', 'devolucion_proveedor') then movement_quantity
    else -movement_quantity
  end;

  new_stock := previous_stock + delta;
  -- No se permite stock negativo: si la merma es mayor que lo que hay,
  -- algo quedo mal registrado antes.
  if new_stock < 0 then
    raise exception
      'No hay stock suficiente: % unidades disponibles, % solicitadas',
      previous_stock, movement_quantity;
  end if;

  update public.product_variants
  set stock = new_stock
  where id = target_variant_id;

  insert into public.inventory_movements (variant_id, movement_type, quantity, reason)
  values (target_variant_id, movement, delta, coalesce(movement_reason, movement));

  return jsonb_build_object(
    'variant_id', target_variant_id,
    'previous_stock', previous_stock,
    'new_stock', new_stock,
    'delta', delta,
    'movement_type', movement
  );
end;
$$;

revoke all on function public.register_stock_movement(uuid, text, integer, text) from public;
revoke all on function public.register_stock_movement(uuid, text, integer, text) from anon, authenticated;
grant execute on function public.register_stock_movement(uuid, text, integer, text) to authenticated, service_role;

-- --- Historial de una presentacion ---
-- Para auditar un perfume puntual: que entró, que salio y por que.
create or replace function public.get_variant_movements(
  target_variant_id uuid,
  movement_limit integer default 50
)
returns table (
  movement_id uuid,
  movement_type text,
  quantity integer,
  reason text,
  order_id uuid,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select im.id, im.movement_type, im.quantity, im.reason, im.order_id, im.created_at
  from public.inventory_movements im
  where im.variant_id = target_variant_id
  order by im.created_at desc
  limit greatest(coalesce(movement_limit, 50), 1);
$$;

revoke all on function public.get_variant_movements(uuid, integer) from public;
revoke all on function public.get_variant_movements(uuid, integer) from anon, authenticated;
grant execute on function public.get_variant_movements(uuid, integer) to authenticated, service_role;

-- --- Valor perdido en merma ---
-- La pregunta que nadie puede responder hoy: "cuanto se me perdio este mes".
-- Usa unit_cost_snapshot del costo actual de la presentacion, porque para
-- saber la perdida real hay que valorar a lo que costo, no a lo que vendio.
create or replace function public.get_waste_summary(days_back integer default 30)
returns table (
  product_name text,
  size_ml integer,
  units_lost integer,
  cost_per_unit numeric,
  total_lost numeric,
  last_movement timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select p.name,
         pv.size_ml,
         sum(-im.quantity)::integer,
         coalesce(pv.cost, 0),
         sum(-im.quantity * coalesce(pv.cost, 0)),
         max(im.created_at)
  from public.inventory_movements im
  join public.product_variants pv on pv.id = im.variant_id
  join public.products p on p.id = pv.product_id
  where im.movement_type in ('merma', 'rotura', 'robo', 'vencimiento')
    and im.quantity < 0
    and im.created_at >= now() - make_interval(days => greatest(coalesce(days_back, 30), 1))
  group by p.name, pv.size_ml, pv.cost
  having sum(-im.quantity) > 0
  order by 5 desc;
$$;

revoke all on function public.get_waste_summary(integer) from public;
revoke all on function public.get_waste_summary(integer) from anon, authenticated;
grant execute on function public.get_waste_summary(integer) to authenticated, service_role;