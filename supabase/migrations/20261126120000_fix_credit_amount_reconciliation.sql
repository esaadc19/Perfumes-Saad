-- Migration: Fix credit amount reconciliation and prevent status/order updates from resetting credit_amount
-- Sincroniza credit_amount restando los abonos ya registrados en customer_credit_payments

-- 1. Actualizar pedidos existentes con discrepancias
UPDATE public.orders o
SET credit_amount = GREATEST(0, o.total - p.paid_sum),
    payment_status = CASE 
      WHEN (o.total - p.paid_sum) <= 0 THEN 'paid'
      ELSE 'partial'
    END
FROM (
  SELECT order_id, SUM(amount) AS paid_sum
  FROM public.customer_credit_payments
  GROUP BY order_id
) p
WHERE o.id = p.order_id
  AND o.payment_status IN ('credit', 'partial');

UPDATE public.orders
SET credit_amount = 0
WHERE payment_status = 'paid' AND credit_amount > 0;

-- 2. Asegurar que admin_update_order_transaction nunca sobreescriba credit_amount ignorando abonos existentes
CREATE OR REPLACE FUNCTION public.admin_update_order_transaction(
  target_order_id uuid,
  new_status text,
  new_payment_status text,
  credit_due_date_param date DEFAULT NULL::date,
  credit_limit_snapshot_param numeric DEFAULT NULL::numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  order_record public.orders%rowtype;
  order_item record;
  next_status text := new_status;
  updated_rows integer;
  credit_due_date_val date := credit_due_date_param;
  credit_limit_snapshot_val numeric := credit_limit_snapshot_param;
  customer_record public.customers%rowtype;
  existing_payments_total numeric;
  calculated_remaining numeric;
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

  if new_payment_status = 'paid' and next_status = 'pending_confirmation' then
    next_status := 'confirmed';
  end if;

  if order_record.payment_status = 'paid' and new_payment_status = 'pending' then
    raise exception 'A completed sale cannot be changed back to pending; register a refund instead';
  end if;
  if new_payment_status = 'refunded' and order_record.payment_status <> 'paid' then
    raise exception 'Only a completed sale can be refunded';
  end if;

  -- Calcular total de abonos existentes
  select coalesce(sum(amount), 0) into existing_payments_total
  from public.customer_credit_payments
  where order_id = target_order_id;

  calculated_remaining := greatest(0, order_record.total - existing_payments_total);

  -- Manejo de cliente para ventas a credito o pago parcial
  if new_payment_status in ('credit', 'partial') then
    select * into customer_record
    from public.customers
    where id = order_record.customer_id;

    if customer_record.id is not null then
      if customer_record.credit_blocked then
        raise exception 'El cliente está bloqueado para compras a crédito por mora.';
      end if;

      -- Auto-habilitar credito en el cliente si aun no lo tenia activo
      if not customer_record.credit_enabled or customer_record.credit_limit is null or customer_record.credit_limit = 0 then
        update public.customers
        set credit_enabled = true,
            credit_terms = coalesce(nullif(customer_record.credit_terms, ''), 'quincenal'),
            credit_limit = coalesce(nullif(customer_record.credit_limit, 0), order_record.total, 500000)
        where id = customer_record.id;
      end if;

      if credit_due_date_val is null then
        if coalesce(customer_record.credit_terms, 'quincenal') = 'mensual' then
          credit_due_date_val := current_date + interval '30 days';
        else
          credit_due_date_val := current_date + interval '15 days';
        end if;
      end if;

      if credit_limit_snapshot_val is null then
        credit_limit_snapshot_val := coalesce(customer_record.credit_limit, order_record.total, 500000);
      end if;
    end if;
  end if;

  -- Descontar inventario si pasa a pagado, credito o pago parcial (primera vez)
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

  update public.orders
  set status = next_status,
      payment_status = case
        when new_payment_status in ('credit', 'partial') and calculated_remaining = 0 and existing_payments_total > 0 then 'paid'
        else new_payment_status
      end,
      credit_due_date = coalesce(credit_due_date_val, order_record.credit_due_date),
      credit_limit_snapshot = coalesce(credit_limit_snapshot_val, order_record.credit_limit_snapshot),
      credit_amount = case
        when new_payment_status in ('credit', 'partial') then calculated_remaining
        when new_payment_status = 'paid' then 0
        else order_record.credit_amount
      end,
      paid_at = case
        when (new_payment_status = 'paid' or (new_payment_status in ('credit', 'partial') and calculated_remaining = 0)) and order_record.payment_status <> 'paid' then now()
        when new_payment_status = 'paid' then coalesce(paid_at, now())
        else paid_at
      end
  where id = target_order_id;
end;
$function$;

-- 3. Asegurar que admin_record_credit_payment calcule sobre el saldo real
CREATE OR REPLACE FUNCTION public.admin_record_credit_payment(
  target_order_id uuid,
  payment_amount numeric,
  payment_method text DEFAULT 'efectivo'::text,
  payment_note text DEFAULT NULL::text,
  payment_date timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  order_record public.orders%rowtype;
  current_credit_amount numeric;
  existing_payments_total numeric;
  new_credit_amount numeric;
  new_payment_status text;
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

  -- Calcular el saldo real pendiente contra la suma de abonos registrados
  select coalesce(sum(amount), 0) into existing_payments_total
  from public.customer_credit_payments
  where order_id = target_order_id;

  current_credit_amount := greatest(0, order_record.total - existing_payments_total);

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
$function$;

-- 4. Asegurar que admin_save_pending_order descuente abonos si el pedido ya tiene abonos registrados
CREATE OR REPLACE FUNCTION public.admin_save_pending_order(
  target_order_id uuid,
  target_customer_id uuid,
  customer_data jsonb,
  items_data jsonb,
  order_date date,
  new_delivery_cost numeric,
  sales_advisor_id uuid,
  new_status text DEFAULT 'pending_confirmation'::text,
  new_payment_status text DEFAULT 'pending'::text,
  cost_funded_by text DEFAULT 'business'::text,
  new_payment_method text DEFAULT 'efectivo'::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  order_record public.orders%rowtype;
  item jsonb;
  item_quantity integer;
  item_unit_price numeric;
  item_unit_cost numeric;
  variant_record record;
  calculated_subtotal numeric(12,2) := 0;
  calculated_discount numeric(12,2) := 0;
  line_discount numeric(12,2) := 0;
  promotion_discounts jsonb;
  saved_order_id uuid;
  saved_customer_id uuid;
  saved_sales_advisor_id uuid;
  next_status text := new_status;
  clean_cost_funded_by text := coalesce(nullif(trim(cost_funded_by), ''), 'business');
  clean_payment_method text := coalesce(nullif(trim(new_payment_method), ''), 'efectivo');
  existing_payments_total numeric := 0;
  calculated_total numeric(12,2) := 0;
  calculated_remaining numeric(12,2) := 0;
begin
  saved_sales_advisor_id := sales_advisor_id;

  if clean_cost_funded_by not in ('business', 'personal') then
    clean_cost_funded_by := 'business';
  end if;

  perform public.admin_require_section('transactions');

  if (target_customer_id is null) = (customer_data is null) then
    raise exception 'Select an existing customer or enter a new customer';
  end if;
  if target_customer_id is not null and not exists (
    select 1 from public.customers where id = target_customer_id
  ) then
    raise exception 'Select a valid customer';
  end if;
  if target_customer_id is null and (
    jsonb_typeof(customer_data) is distinct from 'object'
    or nullif(btrim(customer_data->>'full_name'), '') is null
  ) then
    raise exception 'Enter the customer name';
  end if;
  if order_date is null then
    raise exception 'Order date cannot be null';
  end if;
  if new_delivery_cost is null or new_delivery_cost < 0 then
    raise exception 'Delivery cost must be zero or greater';
  end if;
  if saved_sales_advisor_id is not null and not exists (
    select 1 from public.sales_advisors
    where id = saved_sales_advisor_id and active = true
  ) then
    raise exception 'Select a valid sales advisor';
  end if;
  if jsonb_typeof(items_data) is distinct from 'array' then
    raise exception 'An order must contain at least one product';
  end if;
  if jsonb_array_length(items_data) = 0 then
    raise exception 'An order must contain at least one product';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(items_data) as item_row(value)
    group by (value->>'variant_id')::uuid
    having count(*) > 1
  ) then
    raise exception 'An order cannot contain duplicate products';
  end if;

  if new_payment_status = 'paid' and next_status = 'pending_confirmation' then
    next_status := 'confirmed';
  end if;

  promotion_discounts := public.calculate_promotion_discounts(items_data);

  if target_customer_id is null then
    insert into public.customers (
      full_name, phone, email, city, delivery_address, source
    )
    values (
      btrim(customer_data->>'full_name'),
      nullif(btrim(customer_data->>'phone'), ''),
      nullif(btrim(customer_data->>'email'), ''),
      nullif(btrim(customer_data->>'city'), ''),
      nullif(btrim(customer_data->>'delivery_address'), ''),
      'admin'
    )
    returning id into saved_customer_id;
  else
    saved_customer_id := target_customer_id;
  end if;

  if target_order_id is null then
    insert into public.orders (
      customer_id,
      status,
      payment_status,
      created_at,
      delivery_cost,
      sales_advisor_id,
      cost_funded_by,
      payment_method
    )
    values (
      saved_customer_id,
      next_status,
      new_payment_status,
      order_date::timestamp at time zone 'America/Bogota',
      new_delivery_cost,
      saved_sales_advisor_id,
      clean_cost_funded_by,
      clean_payment_method
    )
    returning id into saved_order_id;
  else
    select * into order_record
    from public.orders
    where id = target_order_id
    for update;
    if not found then
      raise exception 'Order not found';
    end if;
    if order_record.payment_status = 'paid' and new_payment_status not in ('paid', 'refunded') then
      raise exception 'Completed sales cannot be edited; register a refund first';
    end if;
    saved_order_id := target_order_id;
    delete from public.order_items where order_id = saved_order_id;
    update public.orders
    set created_at = order_date::timestamp at time zone 'America/Bogota',
        delivery_cost = new_delivery_cost,
        sales_advisor_id = saved_sales_advisor_id,
        status = next_status,
        payment_status = new_payment_status,
        cost_funded_by = clean_cost_funded_by,
        payment_method = clean_payment_method
    where id = saved_order_id;
  end if;

  for item in
    select value
    from jsonb_array_elements(items_data)
    order by (value->>'variant_id')::uuid
  loop
    if nullif(item->>'variant_id', '') is null
       or coalesce(item->>'quantity', '') !~ '^[0-9]+$' then
      raise exception 'Invalid order item';
    end if;
    item_quantity := (item->>'quantity')::integer;
    if item_quantity < 1 then
      raise exception 'Order quantities must be positive';
    end if;
    item_unit_price := nullif(item->>'unit_price', '')::numeric;
    if item_unit_price is null or item_unit_price < 0 then
      raise exception 'Unit price must be zero or greater';
    end if;
    item_unit_cost := nullif(item->>'unit_cost', '')::numeric;
    if item_unit_cost is not null and item_unit_cost < 0 then
      raise exception 'Unit cost must be zero or greater';
    end if;

    select pv.id, pv.size_ml, pv.price, pv.cost, pv.stock, p.brand, p.name
    into variant_record
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = (item->>'variant_id')::uuid
      and pv.active = true
      and p.active = true
    for update of pv;
    if not found then
      raise exception 'A selected product presentation is not available';
    end if;
    if item_quantity > variant_record.stock then
      raise exception 'Insufficient stock for % % ml', variant_record.name, variant_record.size_ml;
    end if;

    line_discount := coalesce((
      select (entry.value->>'discount')::numeric
      from jsonb_array_elements(promotion_discounts) as entry(value)
      where entry.value->>'variant_id' = variant_record.id::text
    ), 0);
    calculated_subtotal := calculated_subtotal + item_unit_price * item_quantity;
    calculated_discount := calculated_discount + line_discount;
    insert into public.order_items (
      order_id, variant_id, product_name_snapshot, size_ml, unit_price,
      unit_cost_snapshot, quantity, subtotal, discount
    )
    values (
      saved_order_id,
      variant_record.id,
      trim(variant_record.brand || ' ' || variant_record.name),
      variant_record.size_ml,
      item_unit_price,
      coalesce(item_unit_cost, variant_record.cost),
      item_quantity,
      item_unit_price * item_quantity - line_discount,
      line_discount
    );
  end loop;

  if target_order_id is null
     and next_status in ('confirmed', 'shipped', 'delivered')
     and new_payment_status in ('paid', 'credit', 'partial') then
    for item in
      select value
      from jsonb_array_elements(items_data)
      order by (value->>'variant_id')::uuid
    loop
      item_quantity := (item->>'quantity')::integer;
      select pv.id, pv.stock
      into variant_record
      from public.product_variants pv
      where pv.id = (item->>'variant_id')::uuid;

      if not found then
        raise exception 'Product presentation not found during stock deduction';
      end if;
      if item_quantity > variant_record.stock then
        raise exception 'Insufficient stock for order completion';
      end if;
      update public.product_variants
      set stock = stock - item_quantity
      where id = variant_record.id;

      insert into public.inventory_movements (variant_id, movement_type, quantity, reason, order_id)
      values (
        variant_record.id,
        'sale',
        -item_quantity,
        case when new_payment_status in ('credit', 'partial')
             then 'Completed credit sale' else 'Completed paid order' end,
        saved_order_id
      );
    end loop;
  end if;

  calculated_total := calculated_subtotal + coalesce((select shipping from public.orders where id = saved_order_id), 0) - calculated_discount;

  -- Obtener abonos previos si el pedido ya existía
  select coalesce(sum(amount), 0) into existing_payments_total
  from public.customer_credit_payments
  where order_id = saved_order_id;

  calculated_remaining := greatest(0, calculated_total - existing_payments_total);

  update public.orders
  set customer_id = saved_customer_id,
      subtotal = calculated_subtotal,
      discount = calculated_discount,
      total = calculated_total,
      sales_advisor_id = saved_sales_advisor_id,
      cost_funded_by = clean_cost_funded_by,
      payment_method = clean_payment_method,
      paid_at = case
        when (new_payment_status = 'paid' or (new_payment_status in ('credit', 'partial') and calculated_remaining = 0 and existing_payments_total > 0)) and paid_at is null
        then order_date::timestamp at time zone 'America/Bogota'
        else paid_at
      end,
      status = case
        when status = 'draft' then 'pending_confirmation'
        else status
      end,
      payment_status = case
        when new_payment_status in ('credit', 'partial') and calculated_remaining = 0 and existing_payments_total > 0
        then 'paid'
        else new_payment_status
      end,
      credit_amount = case
        when new_payment_status in ('credit', 'partial') then calculated_remaining
        else 0
      end,
      credit_due_date = case
        when new_payment_status = 'credit' then
          case when (select credit_terms from public.customers where id = saved_customer_id) = 'mensual'
               then current_date + interval '30 days'
               else current_date + interval '15 days'
          end
        else null
      end
  where id = saved_order_id;

  return saved_order_id;
end;
$function$;
