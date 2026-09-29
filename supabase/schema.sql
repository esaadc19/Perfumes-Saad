-- Perfumes SAAD: esquema inicial para Supabase.
-- Ejecutar en Supabase SQL Editor antes de configurar la aplicación.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  full_name text,
  phone text,
  delivery_address text,
  email text,
  data_processing_consent boolean not null default false,
  whatsapp_promotions_consent boolean not null default false,
  consented_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists delivery_address text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists data_processing_consent boolean not null default false;
alter table public.profiles add column if not exists whatsapp_promotions_consent boolean not null default false;
alter table public.profiles add column if not exists consented_at timestamptz;

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  required_quantity integer not null check (required_quantity >= 2),
  bundle_price numeric(12,2) not null check (bundle_price >= 0),
  allow_mixed boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  name text not null,
  gender text not null check (gender in ('Hombres','Mujeres','Unisex')),
  category text not null,
  description text,
  family text,
  climate text[] default '{}',
  image_url text,
  image_urls text[] not null default '{}',
  promotion_id uuid references public.promotions(id) on delete set null,
  archived boolean not null default false,
  active boolean not null default true,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products
  add column if not exists image_urls text[] not null default '{}';
alter table public.products
  add column if not exists promotion_id uuid references public.promotions(id) on delete set null;
alter table public.products
  add column if not exists archived boolean not null default false;

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  size_ml integer not null check (size_ml > 0),
  price numeric(12,2) not null default 0 check (price >= 0),
  cost numeric(12,2),
  stock integer not null default 0 check (stock >= 0),
  min_stock integer not null default 2 check (min_stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(product_id, size_ml)
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  phone text,
  email text,
  city text,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customers add column if not exists account_id uuid references auth.users(id) on delete set null;
create unique index if not exists customers_account_id_unique
  on public.customers(account_id) where account_id is not null;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id),
  status text not null default 'draft',
  payment_status text not null default 'pending',
  subtotal numeric(12,2) not null default 0,
  shipping numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  whatsapp_message text,
  created_at timestamptz not null default now()
);

alter table public.orders add column if not exists paid_at timestamptz;
update public.orders
set paid_at = created_at
where payment_status = 'paid' and paid_at is null;
update public.orders
set status = 'confirmed'
where payment_status = 'paid' and status = 'pending_confirmation';

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id),
  product_name_snapshot text not null,
  size_ml integer not null,
  unit_price numeric(12,2) not null,
  quantity integer not null default 1,
  subtotal numeric(12,2) not null
);

alter table public.order_items
  add column if not exists unit_cost_snapshot numeric(12,2);
alter table public.order_items
  add column if not exists discount numeric(12,2) not null default 0;

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id),
  movement_type text not null,
  quantity integer not null,
  reason text,
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.inventory_movements
  drop constraint if exists inventory_movements_order_id_fkey;
alter table public.inventory_movements
  add constraint inventory_movements_order_id_fkey
  foreign key (order_id) references public.orders(id) on delete set null;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles as stored_profile (
    id, role, full_name, phone, delivery_address, email,
    data_processing_consent, whatsapp_promotions_consent, consented_at
  )
  values (
    new.id,
    'customer',
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'phone'), ''),
    nullif(trim(new.raw_user_meta_data->>'delivery_address'), ''),
    new.email,
    coalesce((new.raw_user_meta_data->>'data_processing_consent')::boolean, false),
    coalesce((new.raw_user_meta_data->>'whatsapp_promotions_consent')::boolean, false),
    case
      when coalesce((new.raw_user_meta_data->>'data_processing_consent')::boolean, false)
       and coalesce((new.raw_user_meta_data->>'whatsapp_promotions_consent')::boolean, false)
      then now()
      else null
    end
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(stored_profile.full_name, excluded.full_name),
      phone = coalesce(stored_profile.phone, excluded.phone),
      delivery_address = coalesce(stored_profile.delivery_address, excluded.delivery_address),
      data_processing_consent = stored_profile.data_processing_consent or excluded.data_processing_consent,
      whatsapp_promotions_consent = stored_profile.whatsapp_promotions_consent or excluded.whatsapp_promotions_consent,
      consented_at = coalesce(stored_profile.consented_at, excluded.consented_at);
  return new;
end;
$$;

create or replace function public.admin_update_variant_cost(
  target_variant_id uuid,
  new_cost numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if new_cost is null or new_cost < 0 then
    raise exception 'Cost must be zero or greater';
  end if;

  update public.product_variants set cost = new_cost where id = target_variant_id;
  if not found then
    raise exception 'Product presentation not found';
  end if;
end;
$$;

create or replace function public.admin_update_variant_stock(
  target_variant_id uuid,
  new_stock integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_stock integer;
  stock_delta integer;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if new_stock is null or new_stock < 0 then
    raise exception 'Stock must be zero or greater';
  end if;

  select stock into previous_stock
  from public.product_variants
  where id = target_variant_id
  for update;
  if not found then
    raise exception 'Product presentation not found';
  end if;

  stock_delta := new_stock - previous_stock;
  if stock_delta = 0 then
    return;
  end if;

  update public.product_variants
  set stock = new_stock
  where id = target_variant_id;

  insert into public.inventory_movements (variant_id, movement_type, quantity, reason)
  values (
    target_variant_id,
    case when stock_delta > 0 then 'adjustment_in' else 'adjustment_out' end,
    stock_delta,
    'Manual stock adjustment'
  );
end;
$$;

create or replace function public.admin_get_products()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      to_jsonb(p) || jsonb_build_object(
        'product_variants',
        coalesce((
          select jsonb_agg(to_jsonb(pv) order by pv.size_ml)
          from public.product_variants pv
          where pv.product_id = p.id
        ), '[]'::jsonb)
      )
      order by p.created_at desc
    ),
    '[]'::jsonb
  )
  into result
  from public.products p;

  return result;
end;
$$;

create or replace function public.admin_update_order_transaction(
  target_order_id uuid,
  new_status text,
  new_payment_status text
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
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if new_status is null or new_payment_status is null
     or new_status not in ('pending_confirmation', 'confirmed', 'cancelled')
     or new_payment_status not in ('pending', 'paid', 'refunded') then
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
  if order_record.payment_status = 'paid'
     and new_payment_status = 'paid'
     and new_status = 'cancelled' then
    raise exception 'Refund the completed sale before cancelling it';
  end if;
  if new_payment_status = 'refunded' and order_record.payment_status <> 'paid' then
    raise exception 'Only a completed sale can be refunded';
  end if;

  if new_payment_status = 'paid' and order_record.payment_status <> 'paid' then
    if new_status = 'cancelled' then
      raise exception 'A cancelled order cannot be completed as a sale';
    end if;
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
      values (order_item.variant_id, 'sale', -order_item.quantity, 'Completed paid order', target_order_id);
    end loop;
  elsif new_payment_status = 'refunded' and order_record.payment_status = 'paid' then
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
      values (order_item.variant_id, 'refund', order_item.quantity, 'Refunded paid order', target_order_id);
    end loop;
  end if;

  update public.orders
  set status = next_status,
      payment_status = new_payment_status,
      paid_at = case
        when new_payment_status = 'paid' and order_record.payment_status <> 'paid' then now()
        when new_payment_status = 'paid' then coalesce(paid_at, now())
        else paid_at
      end
  where id = target_order_id;
end;
$$;

create or replace function public.calculate_promotion_discounts(items_data jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with requested as (
    select
      (item.value->>'variant_id')::uuid as variant_id,
      (item.value->>'quantity')::integer as quantity
    from jsonb_array_elements(items_data) as item(value)
  ),
  eligible as (
    select
      requested.variant_id,
      requested.quantity,
      pv.product_id,
      pv.price,
      p.promotion_id,
      promotion.required_quantity,
      promotion.bundle_price,
      promotion.allow_mixed,
      case when promotion.allow_mixed then null::uuid else pv.product_id end as group_product_id
    from requested
    join public.product_variants pv on pv.id = requested.variant_id
    join public.products p on p.id = pv.product_id
    join public.promotions promotion
      on promotion.id = p.promotion_id and promotion.active = true
  ),
  totals as (
    select
      promotion_id,
      group_product_id,
      max(required_quantity) as required_quantity,
      max(bundle_price) as bundle_price,
      floor(sum(quantity)::numeric / max(required_quantity))::integer as bundle_count
    from eligible
    group by promotion_id, group_product_id
  ),
  ranked as (
    select
      eligible.*,
      totals.bundle_count,
      sum(eligible.quantity) over (
        partition by eligible.promotion_id, eligible.group_product_id
        order by eligible.price desc, eligible.product_id, eligible.variant_id
        rows between unbounded preceding and current row
      ) as cumulative_quantity
    from eligible
    join totals
      on totals.promotion_id = eligible.promotion_id
     and totals.group_product_id is not distinct from eligible.group_product_id
  ),
  selected as (
    select
      ranked.*,
      greatest(
        0,
        least(
          quantity,
          bundle_count * required_quantity - (cumulative_quantity - quantity)
        )
      )::integer as discounted_quantity
    from ranked
    where bundle_count > 0
  ),
  selected_totals as (
    select
      promotion_id,
      group_product_id,
      greatest(
        0,
        sum(price * discounted_quantity)
          - max(bundle_count * bundle_price)
      ) as group_discount
    from selected
    group by promotion_id, group_product_id
  ),
  priced as (
    select
      selected.*,
      selected_totals.group_discount,
      sum(price * discounted_quantity) over (
        partition by selected.promotion_id, selected.group_product_id
      ) as selected_regular_total,
      row_number() over (
        partition by selected.promotion_id, selected.group_product_id
        order by price desc, product_id, variant_id
      ) as line_number,
      count(*) over (
        partition by selected.promotion_id, selected.group_product_id
      ) as line_count
    from selected
    join selected_totals
      on selected_totals.promotion_id = selected.promotion_id
     and selected_totals.group_product_id is not distinct from selected.group_product_id
    where selected.discounted_quantity > 0
  ),
  rounded as (
    select
      priced.*,
      round(group_discount * price * discounted_quantity / nullif(selected_regular_total, 0), 2) as rounded_discount
    from priced
  ),
  allocated as (
    select
      variant_id,
      discounted_quantity,
      case
        when line_number = line_count then
          group_discount - coalesce(sum(rounded_discount) over (
            partition by promotion_id, group_product_id
            order by line_number
            rows between unbounded preceding and 1 preceding
          ), 0)
        else rounded_discount
      end as line_discount
    from rounded
  )
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'variant_id', variant_id,
      'discounted_quantity', discounted_quantity,
      'discount', line_discount
    )),
    '[]'::jsonb
  )
  from allocated
$$;

revoke all on function public.calculate_promotion_discounts(jsonb) from public, anon, authenticated;

create or replace function public.admin_save_pending_order(
  target_order_id uuid,
  target_customer_id uuid,
  items_data jsonb
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
  variant_record record;
  calculated_subtotal numeric(12,2) := 0;
  calculated_discount numeric(12,2) := 0;
  line_discount numeric(12,2) := 0;
  promotion_discounts jsonb;
  saved_order_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if target_customer_id is null or not exists (
    select 1 from public.customers where id = target_customer_id
  ) then
    raise exception 'Select a valid customer';
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

  if target_order_id is null then
    insert into public.orders (customer_id, status, payment_status)
    values (target_customer_id, 'pending_confirmation', 'pending')
    returning id into saved_order_id;
  else
    select * into order_record
    from public.orders
    where id = target_order_id
    for update;
    if not found then
      raise exception 'Order not found';
    end if;
    if order_record.payment_status <> 'pending'
       or order_record.status = 'cancelled' then
      raise exception 'Only active unpaid orders can be edited';
    end if;
    saved_order_id := target_order_id;
    delete from public.order_items where order_id = saved_order_id;
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
    calculated_subtotal := calculated_subtotal + variant_record.price * item_quantity;
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
  set customer_id = target_customer_id,
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

create or replace function public.admin_delete_pending_order(target_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record public.orders%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select * into order_record
  from public.orders
  where id = target_order_id
  for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if order_record.payment_status <> 'pending'
     or order_record.status = 'cancelled' then
    raise exception 'Only active unpaid orders can be deleted';
  end if;

  delete from public.orders where id = target_order_id;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

insert into public.profiles as stored_profile (
  id, role, full_name, phone, delivery_address, email,
  data_processing_consent, whatsapp_promotions_consent, consented_at
)
select
  id,
  'customer',
  nullif(trim(raw_user_meta_data->>'full_name'), ''),
  nullif(trim(raw_user_meta_data->>'phone'), ''),
  nullif(trim(raw_user_meta_data->>'delivery_address'), ''),
  email,
  coalesce((raw_user_meta_data->>'data_processing_consent')::boolean, false),
  coalesce((raw_user_meta_data->>'whatsapp_promotions_consent')::boolean, false),
  case
    when coalesce((raw_user_meta_data->>'data_processing_consent')::boolean, false)
     and coalesce((raw_user_meta_data->>'whatsapp_promotions_consent')::boolean, false)
    then created_at
    else null
  end
from auth.users
on conflict (id) do update
set email = coalesce(stored_profile.email, excluded.email),
    full_name = coalesce(stored_profile.full_name, excluded.full_name),
    phone = coalesce(stored_profile.phone, excluded.phone),
    delivery_address = coalesce(stored_profile.delivery_address, excluded.delivery_address),
    data_processing_consent = stored_profile.data_processing_consent or excluded.data_processing_consent,
    whatsapp_promotions_consent = stored_profile.whatsapp_promotions_consent or excluded.whatsapp_promotions_consent,
    consented_at = coalesce(stored_profile.consented_at, excluded.consented_at);

create or replace function public.admin_create_product(
  product_data jsonb,
  variants_data jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_product_id uuid;
  variant jsonb;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if jsonb_typeof(variants_data) is distinct from 'array' then
    raise exception 'Product variants must be an array';
  end if;
  if jsonb_array_length(variants_data) = 0 then
    raise exception 'At least one product variant is required';
  end if;

  insert into public.products (
    brand, name, gender, category, description, family, climate, image_url, image_urls, promotion_id, active
  )
  values (
    trim(product_data->>'brand'),
    trim(product_data->>'name'),
    product_data->>'gender',
    product_data->>'category',
    nullif(product_data->>'description', ''),
    nullif(product_data->>'family', ''),
    coalesce(array(select jsonb_array_elements_text(product_data->'climate')), '{}'),
    coalesce(
      nullif(product_data->>'image_url', ''),
      nullif(product_data->'image_urls'->>0, '')
    ),
    case
      when jsonb_typeof(product_data->'image_urls') = 'array'
        then array(select jsonb_array_elements_text(product_data->'image_urls'))
      when nullif(product_data->>'image_url', '') is not null
        then array[product_data->>'image_url']
      else '{}'
    end,
    nullif(btrim(product_data->>'promotion_id'), '')::uuid,
    true
  )
  returning id into new_product_id;

  for variant in select value from jsonb_array_elements(variants_data)
  loop
    insert into public.product_variants (product_id, size_ml, price, cost, stock)
    values (
      new_product_id,
      (variant->>'size')::integer,
      (variant->>'price')::numeric,
      nullif(variant->>'cost', '')::numeric,
      (variant->>'stock')::integer
    );
  end loop;

  return new_product_id;
end;
$$;

revoke all on function public.admin_create_product(jsonb, jsonb) from public, anon;
grant execute on function public.admin_create_product(jsonb, jsonb) to authenticated;

create or replace function public.admin_update_product(
  target_product_id uuid,
  product_data jsonb,
  variants_data jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  variant jsonb;
  variant_id uuid;
  previous_stock integer;
  new_stock integer;
  stock_delta integer;
  expected_variants integer;
  variant_size integer;
  variant_sizes integer[] := '{}';
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if jsonb_typeof(variants_data) is distinct from 'array'
     or jsonb_typeof(product_data->'image_urls') is distinct from 'array' then
    raise exception 'Product data is invalid';
  end if;
  if jsonb_array_length(variants_data) = 0 then
    raise exception 'At least one product presentation is required';
  end if;
  if jsonb_array_length(product_data->'image_urls') > 3 then
    raise exception 'A product can have at most three images';
  end if;

  perform 1 from public.products where id = target_product_id for update;
  if not found then
    raise exception 'Product not found';
  end if;

  select count(*) into expected_variants
  from public.product_variants
  where product_id = target_product_id;
  if (
       select count(*)
       from jsonb_array_elements(variants_data) as item(value)
       where nullif(item.value->>'id', '') is not null
     ) <> expected_variants
     or (
       select count(distinct item.value->>'id')
       from jsonb_array_elements(variants_data) as item(value)
       where nullif(item.value->>'id', '') is not null
     ) <> expected_variants then
    raise exception 'All product presentations must be included exactly once';
  end if;

  update public.products
  set brand = trim(product_data->>'brand'),
      name = trim(product_data->>'name'),
      gender = product_data->>'gender',
      category = product_data->>'category',
      description = nullif(product_data->>'description', ''),
      family = nullif(product_data->>'family', ''),
      climate = coalesce(array(select jsonb_array_elements_text(product_data->'climate')), '{}'),
      image_url = nullif(product_data->'image_urls'->>0, ''),
      image_urls = array(select jsonb_array_elements_text(product_data->'image_urls')),
      promotion_id = nullif(btrim(product_data->>'promotion_id'), '')::uuid,
      updated_at = now()
  where id = target_product_id;

  for variant in select value from jsonb_array_elements(variants_data)
  loop
    if nullif(variant->>'size', '') is null
       or (variant->>'size') !~ '^[0-9]+$'
       or (variant->>'size')::integer <= 0
       or nullif(variant->>'price', '') is null
       or (variant->>'price')::numeric < 0
       or (variant->>'cost') is not null and (variant->>'cost')::numeric < 0
       or (variant->>'stock') !~ '^[0-9]+$' then
      raise exception 'Presentation price, cost, or stock is invalid';
    end if;
    variant_size := (variant->>'size')::integer;
    if variant_size = any(variant_sizes) then
      raise exception 'Product presentation sizes must be unique';
    end if;
    variant_sizes := array_append(variant_sizes, variant_size);

    new_stock := (variant->>'stock')::integer;
    if nullif(variant->>'id', '') is null then
      insert into public.product_variants (product_id, size_ml, price, cost, stock)
      values (
        target_product_id,
        variant_size,
        (variant->>'price')::numeric,
        nullif(variant->>'cost', '')::numeric,
        new_stock
      )
      returning id into variant_id;
      if new_stock > 0 then
        insert into public.inventory_movements (variant_id, movement_type, quantity, reason)
        values (variant_id, 'adjustment_in', new_stock, 'New product presentation added');
      end if;
    else
      variant_id := (variant->>'id')::uuid;
      select stock into previous_stock
      from public.product_variants
      where id = variant_id and product_id = target_product_id
      for update;
      if not found then
        raise exception 'Product presentation not found';
      end if;

      stock_delta := new_stock - previous_stock;
      update public.product_variants
      set size_ml = variant_size,
          price = (variant->>'price')::numeric,
          cost = nullif(variant->>'cost', '')::numeric,
          stock = new_stock
      where id = variant_id;

      if stock_delta <> 0 then
        insert into public.inventory_movements (variant_id, movement_type, quantity, reason)
        values (
          variant_id,
          case when stock_delta > 0 then 'adjustment_in' else 'adjustment_out' end,
          stock_delta,
          'Product details edited'
        );
      end if;
    end if;
  end loop;
end;
$$;

create or replace function public.admin_delete_product(target_product_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  perform 1 from public.products where id = target_product_id for update;
  if not found then
    raise exception 'Product not found';
  end if;

  if exists (
    select 1
    from public.product_variants pv
    where pv.product_id = target_product_id
      and (
        exists (select 1 from public.order_items oi where oi.variant_id = pv.id)
        or exists (select 1 from public.inventory_movements im where im.variant_id = pv.id)
      )
  ) then
    update public.products set active = false, archived = true, updated_at = now()
    where id = target_product_id;
    return 'archived';
  end if;

  delete from public.products where id = target_product_id;
  return 'deleted';
end;
$$;

revoke all on function public.admin_update_product(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.admin_delete_product(uuid) from public, anon;
grant execute on function public.admin_update_product(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.admin_delete_product(uuid) to authenticated;

create or replace function public.create_whatsapp_order(
  customer_data jsonb,
  items_data jsonb
)
returns table (
  created_order_id uuid,
  order_total numeric,
  saved_customer_name text,
  saved_customer_phone text,
  saved_customer_email text,
  order_message text,
  receipt_items jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_account_id uuid := auth.uid();
  customer_record_id uuid;
  customer_name text;
  customer_phone text;
  customer_email text;
  item jsonb;
  item_quantity integer;
  variant_record record;
  item_subtotal numeric(12,2);
  line_discount numeric(12,2);
  calculated_subtotal numeric(12,2) := 0;
  calculated_discount numeric(12,2) := 0;
  calculated_total numeric(12,2) := 0;
  promotion_discounts jsonb;
  order_id uuid;
  message_lines text := '';
  line_items jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(items_data) is distinct from 'array' then
    raise exception 'The order items must be an array';
  end if;
  if jsonb_array_length(items_data) = 0 then
    raise exception 'The order must contain at least one item';
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

  if current_account_id is not null then
    select p.id, p.full_name, p.phone, coalesce(p.email, u.email)
    into customer_record_id, customer_name, customer_phone, customer_email
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = current_account_id;

    if customer_record_id is null then
      raise exception 'Customer profile not found' using errcode = '42501';
    end if;
    if nullif(trim(customer_name), '') is null
       or nullif(trim(customer_phone), '') is null
       or nullif(trim(customer_email), '') is null then
      raise exception 'Complete your name, phone, and email before placing the order';
    end if;

    insert into public.customers (account_id, full_name, phone, email, source)
    values (current_account_id, trim(customer_name), trim(customer_phone), lower(trim(customer_email)), 'web')
    on conflict (account_id) where account_id is not null
    do update set
      full_name = excluded.full_name,
      phone = excluded.phone,
      email = excluded.email,
      updated_at = now()
    returning id into customer_record_id;
  else
    customer_name := nullif(trim(customer_data->>'full_name'), '');
    customer_phone := nullif(trim(customer_data->>'phone'), '');
    customer_email := lower(nullif(trim(customer_data->>'email'), ''));

    if customer_name is null or customer_phone is null or customer_email is null
       or customer_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
      raise exception 'Enter a valid name, phone, and email address';
    end if;

    insert into public.customers (full_name, phone, email, source)
    values (customer_name, customer_phone, customer_email, 'web_guest')
    returning id into customer_record_id;
  end if;

  insert into public.orders (customer_id, status, payment_status)
  values (customer_record_id, 'pending_confirmation', 'pending')
  returning id into order_id;

  for item in select value from jsonb_array_elements(items_data)
  loop
    if nullif(item->>'variant_id', '') is null
       or coalesce(item->>'quantity', '') !~ '^[0-9]+$' then
      raise exception 'Invalid order item';
    end if;
    item_quantity := (item->>'quantity')::integer;
    if item_quantity < 1 then
      raise exception 'Order quantities must be positive';
    end if;

    select pv.id, pv.size_ml, pv.price, pv.cost, pv.stock, p.brand, p.name
    into variant_record
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = (item->>'variant_id')::uuid
      and pv.active = true
      and p.active = true;

    if not found then
      raise exception 'A selected perfume is no longer available';
    end if;
    if item_quantity > variant_record.stock then
      raise exception 'Insufficient stock for % % ml', variant_record.name, variant_record.size_ml;
    end if;

    line_discount := coalesce((
      select (entry.value->>'discount')::numeric
      from jsonb_array_elements(promotion_discounts) as entry(value)
      where entry.value->>'variant_id' = variant_record.id::text
    ), 0);
    item_subtotal := variant_record.price * item_quantity - line_discount;
    calculated_subtotal := calculated_subtotal + variant_record.price * item_quantity;
    calculated_discount := calculated_discount + line_discount;
    calculated_total := calculated_total + item_subtotal;
    line_items := line_items || jsonb_build_array(jsonb_build_object(
      'brand', variant_record.brand,
      'name', variant_record.name,
      'size', variant_record.size_ml,
      'quantity', item_quantity,
      'unit_price', variant_record.price,
      'subtotal', item_subtotal,
      'discount_amount', line_discount
    ));
    insert into public.order_items (
      order_id, variant_id, product_name_snapshot, size_ml, unit_price,
      unit_cost_snapshot, quantity, subtotal, discount
    )
    values (
      order_id,
      variant_record.id,
      trim(variant_record.brand || ' ' || variant_record.name),
      variant_record.size_ml,
      variant_record.price,
      variant_record.cost,
      item_quantity,
      item_subtotal,
      line_discount
    );
    message_lines := message_lines || format(
      E'\n• %s %s — %s ml x%s — $%s%s',
      variant_record.brand,
      variant_record.name,
      variant_record.size_ml,
      item_quantity,
      to_char(item_subtotal, 'FM999G999G999G990'),
      case when line_discount > 0 then format(' (ahorro $%s)', to_char(line_discount, 'FM999G999G999G990')) else '' end
    );
  end loop;

  update public.orders
  set subtotal = calculated_subtotal,
      discount = calculated_discount,
      total = calculated_total
  where id = order_id;

  order_message := format(
    E'Hola Perfumes SAAD 👋\n\nQuiero confirmar este pedido:\nRecibo: %s\nCliente: %s\nWhatsApp: %s\nCorreo: %s\n%s\n\nAhorro por promociones: $%s\nTotal: $%s\n\nQuedo atento(a) para confirmar disponibilidad, domicilio y medio de pago.',
    upper(left(order_id::text, 8)),
    customer_name,
    customer_phone,
    customer_email,
    message_lines,
    to_char(calculated_discount, 'FM999G999G999G990'),
    to_char(calculated_total, 'FM999G999G999G990')
  );

  update public.orders set whatsapp_message = order_message where id = order_id;

  created_order_id := order_id;
  order_total := calculated_total;
  saved_customer_name := customer_name;
  saved_customer_phone := customer_phone;
  saved_customer_email := customer_email;
  receipt_items := line_items;
  return next;
end;
$$;

revoke all on function public.create_whatsapp_order(jsonb, jsonb) from public;
grant execute on function public.create_whatsapp_order(jsonb, jsonb) to anon, authenticated;

create or replace function public.admin_dashboard_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total_orders', (select count(*) from public.orders),
    'pending_orders', (
      select count(*) from public.orders
      where payment_status = 'pending' and status <> 'cancelled'
    ),
    'completed_sales', (select count(*) from public.orders where payment_status = 'paid'),
    'sales_revenue', coalesce((
      select sum(total) from public.orders where payment_status = 'paid'
    ), 0),
    'sales_cost', coalesce((
      select sum(oi.unit_cost_snapshot * oi.quantity)
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
      where o.payment_status = 'paid' and oi.unit_cost_snapshot is not null
    ), 0),
    'sales_profit', coalesce((
      select sum(oi.subtotal - oi.unit_cost_snapshot * oi.quantity)
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
      where o.payment_status = 'paid' and oi.unit_cost_snapshot is not null
    ), 0),
    'missing_cost_items', coalesce((
      select sum(oi.quantity)
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
      where o.payment_status = 'paid' and oi.unit_cost_snapshot is null
    ), 0),
    'customer_count', (select count(*) from public.customers),
    'low_stock_variants', (
      select count(*)
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
      where pv.active = true and p.active = true and pv.stock <= pv.min_stock
    ),
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

create or replace function public.admin_update_customer(
  customer_id uuid,
  customer_data jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_account_id uuid;
  customer_name text := nullif(trim(customer_data->>'full_name'), '');
  customer_phone text := nullif(trim(customer_data->>'phone'), '');
  customer_email text := lower(nullif(trim(customer_data->>'email'), ''));
  customer_city text := nullif(trim(customer_data->>'city'), '');
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if customer_name is null then
    raise exception 'Customer name is required';
  end if;
  if customer_email is not null
     and customer_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'Enter a valid email address';
  end if;

  update public.customers
  set full_name = customer_name,
      phone = customer_phone,
      email = customer_email,
      city = customer_city,
      updated_at = now()
  where id = customer_id
  returning account_id into linked_account_id;

  if not found then
    raise exception 'Customer not found';
  end if;

  if linked_account_id is not null then
    update public.profiles
    set full_name = customer_name, phone = customer_phone, email = customer_email
    where id = linked_account_id;
  end if;
end;
$$;

create or replace function public.admin_set_profile_role(
  target_profile_id uuid,
  new_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if new_role is null or new_role not in ('customer', 'admin') then
    raise exception 'Invalid profile role';
  end if;
  if target_profile_id = (select auth.uid()) then
    raise exception 'You cannot change your own administrator role';
  end if;
  if new_role = 'customer'
     and exists (
       select 1 from public.profiles
       where id = target_profile_id and role = 'admin'
     )
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'At least one administrator must remain';
  end if;

  update public.profiles set role = new_role where id = target_profile_id;
  if not found then
    raise exception 'Profile not found';
  end if;
end;
$$;

revoke all on function public.admin_dashboard_metrics() from public, anon;
revoke all on function public.admin_update_customer(uuid, jsonb) from public, anon;
revoke all on function public.admin_set_profile_role(uuid, text) from public, anon;
revoke all on function public.admin_update_variant_cost(uuid, numeric) from public, anon;
revoke all on function public.admin_get_products() from public, anon;
revoke all on function public.admin_update_order_transaction(uuid, text, text) from public, anon;
revoke all on function public.admin_save_pending_order(uuid, uuid, jsonb) from public, anon;
revoke all on function public.admin_delete_pending_order(uuid) from public, anon;
revoke all on function public.admin_update_variant_stock(uuid, integer) from public, anon;
grant execute on function public.admin_dashboard_metrics() to authenticated;
grant execute on function public.admin_update_customer(uuid, jsonb) to authenticated;
grant execute on function public.admin_set_profile_role(uuid, text) to authenticated;
grant execute on function public.admin_update_variant_cost(uuid, numeric) to authenticated;
grant execute on function public.admin_get_products() to authenticated;
grant execute on function public.admin_update_order_transaction(uuid, text, text) to authenticated;
grant execute on function public.admin_save_pending_order(uuid, uuid, jsonb) to authenticated;
grant execute on function public.admin_delete_pending_order(uuid) to authenticated;
grant execute on function public.admin_update_variant_stock(uuid, integer) to authenticated;

alter table public.profiles enable row level security;
alter table public.promotions enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.inventory_movements enable row level security;

grant select on public.products to anon, authenticated;
grant select on public.promotions to anon, authenticated;
grant insert, update, delete on public.promotions to authenticated;
revoke select on public.product_variants from public, anon, authenticated;
grant select (id, product_id, size_ml, price, stock, active, created_at)
  on public.product_variants to anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone, email, delivery_address) on public.profiles to authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select on public.customers, public.orders, public.order_items, public.inventory_movements
  to authenticated;

drop policy if exists "Public can read active promotions" on public.promotions;
create policy "Public can read active promotions"
  on public.promotions for select to anon, authenticated
  using (active = true);

drop policy if exists "Admins can manage promotions" on public.promotions;
create policy "Admins can manage promotions"
  on public.promotions for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Users can update own customer details" on public.profiles;
create policy "Users can update own customer details"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) and role = 'customer')
  with check (id = (select auth.uid()) and role = 'customer');

drop policy if exists "Users can update own delivery address" on public.profiles;
create policy "Users can update own delivery address"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "Public can read active products" on public.products;
create policy "Public can read active products"
  on public.products for select to anon, authenticated
  using (active = true);

drop policy if exists "Admins can manage products" on public.products;
create policy "Admins can manage products"
  on public.products for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Public can read active variants" on public.product_variants;
create policy "Public can read active variants"
  on public.product_variants for select to anon, authenticated
  using (
    active = true and exists (
      select 1 from public.products
      where products.id = product_variants.product_id and products.active = true
    )
  );

drop policy if exists "Admins can manage variants" on public.product_variants;
create policy "Admins can manage variants"
  on public.product_variants for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Admins can manage customers" on public.customers;
create policy "Admins can manage customers"
  on public.customers for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Admins can manage orders" on public.orders;
create policy "Admins can manage orders"
  on public.orders for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Admins can manage order items" on public.order_items;
create policy "Admins can manage order items"
  on public.order_items for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Admins can manage inventory movements" on public.inventory_movements;
create policy "Admins can manage inventory movements"
  on public.inventory_movements for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view product images" on storage.objects;
create policy "Public can view product images"
  on storage.objects for select to public
  using (bucket_id = 'product-images');

drop policy if exists "Admins can upload product images" on storage.objects;
create policy "Admins can upload product images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.is_admin()));

drop policy if exists "Admins can update product images" on storage.objects;
create policy "Admins can update product images"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()))
  with check (bucket_id = 'product-images' and (select public.is_admin()));

drop policy if exists "Admins can delete product images" on storage.objects;
create policy "Admins can delete product images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));
