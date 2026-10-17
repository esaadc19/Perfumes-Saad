-- Corrige que el abono no se descuente del saldo pendiente.
--
-- Sintoma: al registrar un abono en Cartera, el saldo sigue igual. El
-- pago se guardaba en customer_credit_payments pero orders.credit_amount
-- no bajaba, asi que "Total por cobrar" nunca cambiaba.
--
-- Causa: esta funcion vivia solo en schema.sql. Ninguna migracion la
-- creaba ni la actualizaba, asi que la base tiene la version del setup
-- original, que no toca credit_amount. El frontend ya asumia que el saldo
-- venia descontado (por eso la tabla no restaba paid_amount otra vez), de
-- modo que el numero en pantalla nunca se movia.
--
-- Aparte de descontar, fija dos cosas que hacian falta:
--   - el saldo no puede quedar en negativo
--   - paid_at solo se escribe cuando el pedido queda pagado, no en cada
--     abono parcial, para no alterar el periodo de reconocimiento de venta
--
-- Es idempotente: se puede correr mas de una vez.

create or replace function public.admin_record_credit_payment(
  target_order_id uuid,
  payment_amount numeric,
  payment_method text default 'efectivo',
  payment_note text default null,
  payment_date timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record public.orders%rowtype;
  current_credit_amount numeric;
  new_credit_amount numeric;
  new_payment_status text;
  customer_id uuid;
  recorded_by_user uuid := auth.uid();
  payment_date_val timestamptz := coalesce(payment_date, now());
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if payment_amount is null or payment_amount <= 0 then
    raise exception 'El monto del abono debe ser mayor que cero';
  end if;
  if payment_method not in ('efectivo', 'transferencia', 'otro') then
    raise exception 'Método de pago inválido';
  end if;

  -- for update: si dos abonos entran a la vez sobre el mismo pedido, el
  -- segundo espera y recalcula sobre el saldo ya descontado. Sin esto, dos
  -- pagos simultaneos podrian dejar el saldo en negativo.
  select * into order_record
  from public.orders
  where id = target_order_id
  for update;
  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if order_record.payment_status not in ('credit', 'partial') then
    raise exception 'Este pedido no tiene saldo a crédito';
  end if;

  current_credit_amount := coalesce(order_record.credit_amount, 0);

  if current_credit_amount <= 0 then
    raise exception 'Este pedido ya está saldado';
  end if;

  if payment_amount > current_credit_amount then
    raise exception
      'El abono supera el saldo pendiente: $% sobre $%',
      payment_amount, current_credit_amount;
  end if;

  new_credit_amount := current_credit_amount - payment_amount;

  if new_credit_amount = 0 then
    new_payment_status := 'paid';
  else
    new_payment_status := 'partial';
  end if;

  insert into public.customer_credit_payments (
    customer_id, order_id, amount, paid_at, method, note, recorded_by
  )
  select order_record.customer_id, target_order_id, payment_amount, payment_date_val,
         payment_method, payment_note, recorded_by_user;

  update public.orders
  set payment_status = new_payment_status,
      credit_amount = new_credit_amount,
      paid_at = case when new_payment_status = 'paid' then now() else paid_at end
  where id = target_order_id;

  return jsonb_build_object(
    'order_id', target_order_id,
    'payment_amount', payment_amount,
    'remaining_balance', new_credit_amount,
    'new_payment_status', new_payment_status
  );
end;
$$;

revoke all on function public.admin_record_credit_payment(uuid, numeric, text, text, timestamptz) from public;
revoke all on function public.admin_record_credit_payment(uuid, numeric, text, text, timestamptz) from anon, authenticated;
grant execute on function public.admin_record_credit_payment(uuid, numeric, text, text, timestamptz) to authenticated, service_role;

-- --- Deteccion: saldos que quedaron sin descontar ---
-- Si hubo abonos con la version vieja, sus pedidos siguen con el saldo
-- completo. Esta consulta los lista para poder corregirlos a mano.
--
--   select p.order_code, p.saldo_en_pedido, p.pagado_en_abonos,
--          p.saldo_en_pedido - p.pagado_en_abonos as diferencia
--   from public.detect_credit_balance_drift() p;
create or replace function public.detect_credit_balance_drift()
returns table (
  order_id uuid,
  order_code text,
  saldo_en_pedido numeric,
  pagado_en_abonos numeric,
  diferencia numeric
)
language sql
security definer
set search_path = ''
as $$
  select o.id,
         upper(left(o.id::text, 8)),
         coalesce(o.credit_amount, 0),
         coalesce((select sum(cp.amount) from public.customer_credit_payments cp where cp.order_id = o.id), 0),
         coalesce(o.credit_amount, 0)
           - coalesce((select sum(cp.amount) from public.customer_credit_payments cp where cp.order_id = o.id), 0)
  from public.orders o
  where coalesce(o.credit_amount, 0) > 0
    and exists (select 1 from public.customer_credit_payments cp where cp.order_id = o.id)
    and abs(
      coalesce(o.credit_amount, 0)
      - coalesce((select sum(cp.amount) from public.customer_credit_payments cp where cp.order_id = o.id), 0)
    ) > 0.01
  order by 4 desc;
$$;

revoke all on function public.detect_credit_balance_drift() from public;
revoke all on function public.detect_credit_balance_drift() from anon, authenticated;
grant execute on function public.detect_credit_balance_drift() to authenticated, service_role;

-- --- Reparacion de los abonos ya registrados con la version vieja ---
-- NO se ejecuta sola: revisar primero con detect_credit_balance_drift() y
-- despues correr: el admin ve el cambio en pantalla.
--
-- Recalcula credit_amount = total pedido - suma de abonos, que es la misma
-- cuenta que ya usan editar y eliminar abono. Solo toca pedidos a credito y
-- deja el estado en 'paid' cuando el saldo llega a cero.
--
-- Es idempotente: correrla dos veces no cambia nada.
create or replace function public.repair_credit_balances()
returns table (
  order_code text,
  saldo_antes numeric,
  saldo_despues numeric,
  estado_despues text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  fila record;
  saldo_nuevo numeric;
  estado_nuevo text;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  for fila in
    select o.id, o.total, o.credit_amount, o.payment_status
    from public.orders o
    where coalesce(o.credit_amount, 0) > 0
      and exists (select 1 from public.customer_credit_payments cp where cp.order_id = o.id)
  loop
    select coalesce(fila.total, 0) - coalesce(sum(cp.amount), 0)
    into saldo_nuevo
    from (select sum(amount) as amount
          from public.customer_credit_payments
          where order_id = fila.id) cp;

    if saldo_nuevo < 0 then
      -- Hay abonos por mas del total: el saldo no puede ser negativo.
      -- Se deja en 0 y el exceso se ve en la lista de pagos.
      saldo_nuevo := 0;
    end if;

    estado_nuevo := case when saldo_nuevo = 0 then 'paid' else 'partial' end;

    update public.orders
    set credit_amount = saldo_nuevo,
        payment_status = estado_nuevo,
        paid_at = case when estado_nuevo = 'paid' and paid_at is null then now() else paid_at end
    where id = fila.id;

    order_code := upper(left(fila.id::text, 8));
    saldo_antes := coalesce(fila.credit_amount, 0);
    saldo_despues := saldo_nuevo;
    estado_despues := estado_nuevo;

    return next;
  end loop;

  return;
end;
$$;

revoke all on function public.repair_credit_balances() from public;
revoke all on function public.repair_credit_balances() from anon, authenticated;
grant execute on function public.repair_credit_balances() to authenticated, service_role;