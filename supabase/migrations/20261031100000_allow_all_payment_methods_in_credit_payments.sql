-- ============================================================
-- Permite todos los métodos de pago en abonos de cartera
-- (efectivo, nequi_daviplata, bancolombia, datafono, transferencia, otro)
-- ============================================================

-- 1. Actualizar restricción en la tabla customer_credit_payments
alter table public.customer_credit_payments
  drop constraint if exists customer_credit_payments_method_check;

alter table public.customer_credit_payments
  add constraint customer_credit_payments_method_check
  check (method in ('efectivo', 'nequi_daviplata', 'bancolombia', 'datafono', 'transferencia', 'otro'));

-- 2. Actualizar función admin_record_credit_payment
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
  if payment_method not in ('efectivo', 'nequi_daviplata', 'bancolombia', 'datafono', 'transferencia', 'otro') then
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

revoke all on function public.admin_record_credit_payment(uuid, numeric, text, text, timestamptz) from public, anon;
grant execute on function public.admin_record_credit_payment(uuid, numeric, text, text, timestamptz) to authenticated;

-- 3. Actualizar función admin_update_credit_payment
create or replace function public.admin_update_credit_payment(
  target_payment_id uuid,
  new_amount numeric,
  new_method text default null,
  new_note text default null,
  new_paid_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_record public.customer_credit_payments%rowtype;
  order_record public.orders%rowtype;
  target_order_id uuid;
  other_payments_total numeric;
  new_credit_amount numeric;
  new_payment_status text;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if new_amount is null or new_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;
  if new_method is not null and new_method not in ('efectivo', 'nequi_daviplata', 'bancolombia', 'datafono', 'transferencia', 'otro') then
    raise exception 'Invalid payment method';
  end if;

  select * into payment_record
  from public.customer_credit_payments
  where id = target_payment_id
  for update;
  if not found then
    raise exception 'Payment not found';
  end if;
  target_order_id := payment_record.order_id;

  select * into order_record
  from public.orders
  where id = target_order_id
  for update;
  if not found then
    raise exception 'Order not found';
  end if;

  -- Suma de los demás abonos del pedido (excluye el que se edita)
  select coalesce(sum(amount), 0) into other_payments_total
  from public.customer_credit_payments
  where order_id = target_order_id
    and id <> target_payment_id;

  if new_amount > order_record.total - other_payments_total then
    raise exception 'Payment exceeds the order balance: $% available', order_record.total - other_payments_total;
  end if;

  update public.customer_credit_payments
  set amount = new_amount,
      method = coalesce(new_method, method),
      note = coalesce(new_note, note),
      paid_at = coalesce(new_paid_at, paid_at)
  where id = target_payment_id;

  new_credit_amount := order_record.total - (other_payments_total + new_amount);
  if new_credit_amount <= 0 then
    new_credit_amount := 0;
    new_payment_status := 'paid';
  else
    new_payment_status := 'partial';
  end if;

  update public.orders
  set credit_amount = new_credit_amount,
      payment_status = new_payment_status,
      paid_at = case when new_payment_status = 'paid' then coalesce(paid_at, now()) else paid_at end
  where id = target_order_id;

  return jsonb_build_object(
    'order_id', target_order_id,
    'payment_amount', new_amount,
    'remaining_balance', new_credit_amount,
    'new_payment_status', new_payment_status
  );
end;
$$;

revoke all on function public.admin_update_credit_payment(uuid, numeric, text, text, timestamptz) from public, anon;
grant execute on function public.admin_update_credit_payment(uuid, numeric, text, text, timestamptz) to authenticated;
