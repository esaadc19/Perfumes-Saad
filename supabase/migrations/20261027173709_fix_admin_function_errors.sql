-- ------------------------------------------------------------
-- Fix de errores de lint en funciones administrativas
-- ------------------------------------------------------------
-- 1. admin_check_credit_limit: el mensaje usaba format('... $%, ... $%').
--    Postgres interpreta % como especificador de formato y fallaba
--    justo cuando el credito no alcanzaba. Se usa %s.
--
-- 2. admin_create_recorded_order: llamaba a la firma vieja de
--    admin_save_pending_order(uuid, uuid, jsonb), que ya no existe.
--    Ahora usa la firma vigente de 9 argumentos con los mismos valores
--    que ponia la version anterior: sin asesor, domicilio 0 y estado
--    pendiente.
--
-- 3. admin_update_order_transaction (5 argumentos): seleccionaba 4
--    columnas en 2 variables y trataba credit_terms (text) como boolean.
--    Se separan credit_enabled (boolean), credit_terms (text) y
--    credit_limit (numeric).
--
-- No se cambian firmas, permisos ni reglas de negocio.

create or replace function public.admin_check_credit_limit(
  target_customer_id uuid,
  order_total numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer_record public.customers%rowtype;
  current_credit_balance numeric;
  available_credit numeric;
begin
  perform public.admin_require_section('credit');

  select * into customer_record
  from public.customers
  where id = target_customer_id;
  if not found then
    raise exception 'Customer not found';
  end if;

  if not customer_record.credit_enabled then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'Customer does not have credit enabled'
    );
  end if;

  if customer_record.credit_blocked then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'Customer credit is blocked'
    );
  end if;

  select coalesce(sum(o.credit_amount), 0)
  into current_credit_balance
  from public.orders o
  where o.customer_id = target_customer_id
    and o.payment_status in ('credit', 'partial');

  available_credit := customer_record.credit_limit - current_credit_balance;

  if available_credit < order_total then
    return jsonb_build_object(
      'allowed', false,
      'reason', format('Credit limit exceeded. Available: $%s, Order: $%s', available_credit, order_total),
      'available_credit', available_credit,
      'current_balance', current_credit_balance,
      'credit_limit', customer_record.credit_limit
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'available_credit', available_credit,
    'current_balance', current_credit_balance,
    'credit_limit', customer_record.credit_limit
  );
end;
$$;

revoke all on function public.admin_check_credit_limit(uuid, numeric) from public, anon;
grant execute on function public.admin_check_credit_limit(uuid, numeric) to authenticated;

create or replace function public.admin_create_recorded_order(
  target_customer_id uuid,
  customer_data jsonb,
  items_data jsonb,
  target_order_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_customer_id uuid := target_customer_id;
  customer_name text;
  customer_phone text;
  customer_email text;
  customer_city text;
  saved_order_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if target_order_date is null
     or target_order_date > (now() at time zone 'America/Bogota')::date then
    raise exception 'Order date cannot be in the future';
  end if;

  if target_customer_id is null then
    if jsonb_typeof(customer_data) is distinct from 'object' then
      raise exception 'Enter the new customer details';
    end if;
    customer_name := nullif(trim(customer_data->>'full_name'), '');
    customer_phone := nullif(trim(customer_data->>'phone'), '');
    customer_email := lower(nullif(trim(customer_data->>'email'), ''));
    customer_city := nullif(trim(customer_data->>'city'), '');

    if customer_name is null then
      raise exception 'Customer name is required';
    end if;
    if customer_phone is null and customer_email is null then
      raise exception 'Enter a phone number or email for the customer';
    end if;
    if customer_phone is not null
       and regexp_replace(customer_phone, '\D', '', 'g') = '' then
      raise exception 'Enter a valid customer phone number';
    end if;
    if customer_email is not null
       and customer_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
      raise exception 'Enter a valid email address';
    end if;
    if exists (
      select 1
      from public.customers c
      where (customer_email is not null and lower(c.email) = customer_email)
         or (
           customer_phone is not null
           and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g')
             = regexp_replace(customer_phone, '\D', '', 'g')
         )
    ) then
      raise exception 'A customer with this phone or email already exists; select the existing customer';
    end if;

    insert into public.customers (full_name, phone, email, city, source)
    values (customer_name, customer_phone, customer_email, customer_city, 'admin')
    returning id into saved_customer_id;
  elsif customer_data is not null then
    raise exception 'Select an existing customer or enter a new customer, not both';
  end if;

  saved_order_id := public.admin_save_pending_order(
    target_order_id => null,
    target_customer_id => saved_customer_id,
    customer_data => null,
    items_data => items_data,
    order_date => target_order_date,
    new_delivery_cost => 0,
    sales_advisor_id => null,
    new_status => 'pending_confirmation',
    new_payment_status => 'pending'
  );
  update public.orders
  set created_at = target_order_date::timestamp at time zone 'America/Bogota'
  where id = saved_order_id;

  return saved_order_id;
end;
$$;

revoke all on function public.admin_create_recorded_order(uuid, jsonb, jsonb, date) from public, anon;
grant execute on function public.admin_create_recorded_order(uuid, jsonb, jsonb, date) to authenticated;

create or replace function public.admin_update_order_transaction(
  target_order_id uuid,
  new_status text,
  new_payment_status text,
  credit_due_date_param date default null,
  credit_limit_snapshot_param numeric default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record public.orders%rowtype;
  order_item record;
  next_status text := new_status;
  updated_rows integer;
  credit_due_date_val date := credit_due_date_param;
  credit_limit_snapshot_val numeric := credit_limit_snapshot_param;
  customer_credit_enabled boolean;
  customer_credit_terms text;
  customer_credit_limit numeric;
begin
  perform public.admin_require_section('transactions');
  if new_status is null or new_payment_status is null
     or new_status not in ('pending_confirmation', 'confirmed', 'shipped', 'delivered', 'cancelled')
     or new_payment_status not in ('pending', 'paid', 'refunded', 'credit', 'partial') then
    raise exception 'Invalid order status';
  end if;

  select * into order_record
  from public.orders
  where id = target_order_id
  for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if new_payment_status = 'paid' then
    next_status := 'confirmed';
  end if;

  if order_record.payment_status = 'paid' and new_payment_status = 'pending' then
    raise exception 'A completed sale cannot be changed back to pending; register a refund instead';
  end if;
  if new_payment_status = 'refunded' and order_record.payment_status <> 'paid' then
    raise exception 'Only a completed sale can be refunded';
  end if;

  -- Handle credit payment status transition
  if new_payment_status in ('credit', 'partial') and order_record.payment_status not in ('credit', 'partial') then
    -- New credit sale: need to check customer credit limit and terms
    select c.credit_enabled, c.credit_limit, c.credit_terms
    into customer_credit_enabled, customer_credit_limit, customer_credit_terms
    from public.customers c
    join public.orders o on o.customer_id = c.id
    where o.id = target_order_id;
    if not customer_credit_enabled then
      raise exception 'Customer does not have credit enabled';
    end if;
    if customer_credit_limit is null then
      raise exception 'Customer credit terms not found';
    end if;
  end if;

  -- Descuenta stock cuando la venta se completa (pagada O despachada a credito)
  -- Se ejecuta solo la primera vez que pasa de no-pagado a pagado/credito
  if (new_payment_status in ('paid', 'credit', 'partial'))
     and order_record.payment_status not in ('paid', 'credit', 'partial') then
    for order_item in
      select oi.variant_id, oi.quantity, oi.unit_cost_snapshot, pv.cost
      from public.order_items oi
      join public.product_variants pv on pv.id = oi.variant_id
      where oi.order_id = target_order_id
      order by oi.variant_id
    loop
      update public.order_items
      set unit_cost_snapshot = coalesce(order_item.unit_cost_snapshot, order_item.cost)
      where order_id = target_order_id and variant_id = order_item.variant_id;

      update public.product_variants
      set stock = stock - order_item.quantity
      where id = order_item.variant_id and stock >= order_item.quantity;
      get diagnostics updated_rows = row_count;
      if updated_rows = 0 then
        raise exception 'Insufficient stock to complete this sale';
      end if;

      insert into public.inventory_movements (variant_id, movement_type, quantity, reason, order_id)
      values (order_item.variant_id, 'sale', -order_item.quantity,
              case when new_payment_status in ('credit', 'partial')
                   then 'Completed credit sale' else 'Completed paid order' end,
              target_order_id);
    end loop;
  elsif new_payment_status = 'refunded' and order_record.payment_status in ('paid', 'credit', 'partial') then
    for order_item in
      select variant_id, quantity
      from public.order_items
      where order_id = target_order_id
      order by variant_id
    loop
      update public.product_variants
      set stock = stock + order_item.quantity
      where id = order_item.variant_id;

      insert into public.inventory_movements (variant_id, movement_type, quantity, reason, order_id)
      values (order_item.variant_id, 'refund', order_item.quantity, 'Refunded completed order', target_order_id);
    end loop;
  end if;

  -- Calcular fecha de compromiso si es credito nuevo y no se proporciono
  if new_payment_status = 'credit' and order_record.payment_status <> 'credit' then
    if credit_due_date_val is null then
      select c.credit_terms
      into customer_credit_terms
      from public.customers c
      join public.orders o on o.customer_id = c.id
      where o.id = target_order_id;
      if customer_credit_terms = 'quincenal' then
        credit_due_date_val := current_date + interval '15 days';
      elsif customer_credit_terms = 'mensual' then
        credit_due_date_val := current_date + interval '30 days';
      else
        credit_due_date_val := current_date + interval '15 days';
      end if;
    end if;
    if credit_limit_snapshot_val is null then
      select c.credit_limit
      into credit_limit_snapshot_val
      from public.customers c
      join public.orders o on o.customer_id = c.id
      where o.id = target_order_id;
    end if;
  end if;

  update public.orders
  set status = next_status,
      payment_status = new_payment_status,
      credit_due_date = credit_due_date_val,
      credit_limit_snapshot = credit_limit_snapshot_val,
      credit_amount = case
        when new_payment_status in ('credit', 'partial') then order_record.total
        when new_payment_status = 'paid' and order_record.payment_status in ('credit', 'partial') then 0
        else order_record.credit_amount
      end,
      paid_at = case
        when new_payment_status = 'paid' and order_record.payment_status <> 'paid' then now()
        when new_payment_status = 'paid' then coalesce(paid_at, now())
        else paid_at
      end
  where id = target_order_id;
end;
$$;

revoke all on function public.admin_update_order_transaction(uuid, text, text, date, numeric) from public, anon;
grant execute on function public.admin_update_order_transaction(uuid, text, text, date, numeric) to authenticated;
