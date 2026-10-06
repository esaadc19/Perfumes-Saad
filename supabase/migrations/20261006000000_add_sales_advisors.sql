-- Migration: Add sales_advisors table for order tracking
-- Created: 2026-10-06

-- Create sales_advisors table
create table if not exists public.sales_advisors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.sales_advisors enable row level security;

-- Grants (app uses the anon key with RLS)
grant select, insert, update, delete on public.sales_advisors to authenticated;

-- Policy: only admins can manage sales advisors
drop policy if exists "Admins can manage sales advisors" on public.sales_advisors;
create policy "Admins can manage sales advisors"
  on public.sales_advisors for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Add sales_advisor_id column to orders table
alter table public.orders
  add column if not exists sales_advisor_id uuid references public.sales_advisors(id) on delete set null;

-- Index for faster lookups by sales advisor
create index if not exists orders_sales_advisor_id_idx
  on public.orders(sales_advisor_id);

-- Seed sales advisors from existing admin profiles (preserves current behavior,
-- where admin accounts were used as sales advisors)
insert into public.sales_advisors (full_name, phone, email)
select
  coalesce(nullif(btrim(full_name), ''), nullif(btrim(email), ''), 'Asesor de venta'),
  phone,
  email
from public.profiles
where role = 'admin';

-- Replace admin_save_pending_order so it validates the advisor against
-- sales_advisors (active) and stores it on create AND on edit
drop function if exists public.admin_save_pending_order(uuid, uuid, jsonb, jsonb, date, numeric, uuid);

create or replace function public.admin_save_pending_order(
  target_order_id uuid,
  target_customer_id uuid,
  customer_data jsonb,
  items_data jsonb,
  order_date date,
  new_delivery_cost numeric,
  sales_advisor_id uuid
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
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
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
  if sales_advisor_id is not null and not exists (
    select 1 from public.sales_advisors
    where id = sales_advisor_id and active = true
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
      'pending_confirmation',
      'pending',
      order_date::timestamp at time zone 'America/Bogota',
      new_delivery_cost,
      sales_advisor_id
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
        sales_advisor_id = sales_advisor_id
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
      variant_record.price,
      variant_record.cost,
      item_quantity,
      variant_record.price * item_quantity - line_discount,
      line_discount
    );
  end loop;

  update public.orders
  set customer_id = saved_customer_id,
      subtotal = calculated_subtotal,
  discount = calculated_discount,
  total = calculated_subtotal + shipping - calculated_discount,
      status = case
        when status = 'draft' then 'pending_confirmation'
        else status
      end
  where id = saved_order_id;

  return saved_order_id;
end;
$$;
