-- Migration: Ensure admin_save_pending_order persists sales_advisor_id on create and edit
-- Version: 20261029110000

drop function if exists public.admin_save_pending_order(uuid, uuid, jsonb, jsonb, date, numeric, uuid);
drop function if exists public.admin_save_pending_order(uuid, uuid, jsonb, jsonb, date, numeric, uuid, text, text);

create or replace function public.admin_save_pending_order(
  target_order_id uuid,
  target_customer_id uuid,
  customer_data jsonb,
  items_data jsonb,
  order_date date,
  new_delivery_cost numeric,
  sales_advisor_id uuid,
  new_status text default 'pending_confirmation',
  new_payment_status text default 'pending'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
begin
  saved_sales_advisor_id := sales_advisor_id;

  -- Permisos de sección (transactions) o admin
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
  if order_date is null or order_date > (now() at time zone 'America/Bogota')::date then
    raise exception 'Order date cannot be in the future';
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
    raise exception 'Each product presentation can only appear once in an order';
  end if;

  -- Validar estados de pago
  if new_payment_status not in ('pending', 'paid', 'refunded', 'credit', 'partial') then
    raise exception 'Invalid payment status';
  end if;
  if new_status not in ('pending_confirmation', 'confirmed', 'shipped', 'delivered', 'cancelled') then
    raise exception 'Invalid order status';
  end if;

  -- Si es crédito/parcial, el estado debe ser al menos confirmado
  if new_payment_status in ('credit', 'partial') and new_status = 'pending_confirmation' then
    next_status := 'confirmed';
  else
    next_status := new_status;
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
    insert into public.orders (customer_id, status, payment_status, created_at, delivery_cost, sales_advisor_id)
    values (
      saved_customer_id,
      next_status,
      new_payment_status,
      order_date::timestamp at time zone 'America/Bogota',
      new_delivery_cost,
      saved_sales_advisor_id
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
    if order_record.payment_status = 'paid' then
      raise exception 'Completed sales cannot be edited; register a refund first';
    end if;
    saved_order_id := target_order_id;
    delete from public.order_items where order_id = saved_order_id;
    update public.orders
    set created_at = order_date::timestamp at time zone 'America/Bogota',
        delivery_cost = new_delivery_cost,
        sales_advisor_id = saved_sales_advisor_id,
        status = next_status,
        payment_status = new_payment_status
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

  -- Descontar stock si el pedido se completa (pagado, crédito o parcial)
  -- Solo para pedidos NUEVOS (no ediciones)
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
      where pv.id = (item->>'variant_id')::uuid
      for update;
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

  update public.orders
  set customer_id = saved_customer_id,
      subtotal = calculated_subtotal,
      discount = calculated_discount,
      total = calculated_subtotal + shipping - calculated_discount,
      sales_advisor_id = saved_sales_advisor_id,
      status = case
        when status = 'draft' then 'pending_confirmation'
        else status
      end,
      credit_amount = case
        when new_payment_status in ('credit', 'partial') then calculated_subtotal + shipping - calculated_discount
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
$$;

revoke all on function public.admin_save_pending_order(uuid, uuid, jsonb, jsonb, date, numeric, uuid, text, text) from public, anon;
grant execute on function public.admin_save_pending_order(uuid, uuid, jsonb, jsonb, date, numeric, uuid, text, text) to authenticated;
