-- ============================================================
-- Permite editar y eliminar abonos de crédito, recalculando
-- el saldo del pedido (orders.credit_amount) y su estado.
-- ============================================================

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
  if new_method is not null and new_method not in ('efectivo', 'transferencia', 'otro') then
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

create or replace function public.admin_delete_credit_payment(
  target_payment_id uuid
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
  remaining_total numeric;
  new_credit_amount numeric;
  new_payment_status text;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
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

  delete from public.customer_credit_payments where id = target_payment_id;

  select coalesce(sum(amount), 0) into remaining_total
  from public.customer_credit_payments
  where order_id = target_order_id;

  new_credit_amount := order_record.total - remaining_total;
  if new_credit_amount <= 0 then
    new_credit_amount := 0;
    new_payment_status := 'paid';
  else
    new_payment_status := 'partial';
  end if;

  update public.orders
  set credit_amount = new_credit_amount,
      payment_status = new_payment_status
  where id = target_order_id;

  return jsonb_build_object(
    'order_id', target_order_id,
    'remaining_balance', new_credit_amount,
    'new_payment_status', new_payment_status
  );
end;
$$;

revoke all on function public.admin_update_credit_payment(uuid, numeric, text, text, timestamptz) from public, anon;
revoke all on function public.admin_delete_credit_payment(uuid) from public, anon;
grant execute on function public.admin_update_credit_payment(uuid, numeric, text, text, timestamptz) to authenticated;
grant execute on function public.admin_delete_credit_payment(uuid) to authenticated;