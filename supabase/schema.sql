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
  price numeric(12,2) not null default 0 check (price > 0),
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
  delivery_address text,
  source text,
  credit_enabled boolean not null default false,
  credit_limit numeric(12,2) not null default 0 check (credit_limit >= 0),
  credit_terms text not null default 'quincenal' check (credit_terms in ('quincenal', 'mensual')),
  credit_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_advisors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists sales_advisor_id uuid references public.sales_advisors(id) on delete set null;
create index if not exists orders_sales_advisor_id_idx
  on public.orders(sales_advisor_id);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customers'
      and column_name = 'Addrees'
  ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'customers'
        and column_name = 'delivery_address'
    ) then
      execute 'update public.customers set delivery_address = coalesce(delivery_address, "Addrees") where delivery_address is null and "Addrees" is not null';
    else
      alter table public.customers rename column "Addrees" to delivery_address;
    end if;
  else
    alter table public.customers add column if not exists delivery_address text;
  end if;
end;
$$;

alter table public.customers add column if not exists account_id uuid references auth.users(id) on delete set null;
alter table public.customers add column if not exists credit_enabled boolean not null default false;
alter table public.customers add column if not exists credit_limit numeric(12,2) not null default 0 check (credit_limit >= 0);
alter table public.customers add column if not exists credit_terms text not null default 'quincenal' check (credit_terms in ('quincenal', 'mensual'));
alter table public.customers add column if not exists credit_blocked boolean not null default false;
create unique index if not exists customers_account_id_unique
  on public.customers(account_id) where account_id is not null;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id),
  status text not null default 'draft',
  payment_status text not null default 'pending',
  subtotal numeric(12,2) not null default 0,
  shipping numeric(12,2) not null default 0,
  delivery_cost numeric(12,2) not null default 0 check (delivery_cost >= 0),
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  whatsapp_message text,
  created_at timestamptz not null default now(),
  credit_due_date date,
  credit_limit_snapshot numeric(12,2),
  credit_amount numeric(12,2) not null default 0 check (credit_amount >= 0)
);

alter table public.orders
  add column if not exists delivery_cost numeric(12,2) not null default 0 check (delivery_cost >= 0);
alter table public.orders add column if not exists paid_at timestamptz;
alter table public.orders add column if not exists credit_due_date date;
alter table public.orders add column if not exists credit_limit_snapshot numeric(12,2);
alter table public.orders add column if not exists credit_amount numeric(12,2) not null default 0 check (credit_amount >= 0);
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

create table if not exists public.customer_credit_payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  method text not null default 'efectivo' check (method in ('efectivo', 'transferencia', 'otro')),
  note text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists customer_credit_payments_customer_id_idx
  on public.customer_credit_payments(customer_id);
create index if not exists customer_credit_payments_order_id_idx
  on public.customer_credit_payments(order_id);
create index if not exists customer_credit_payments_paid_at_idx
  on public.customer_credit_payments(paid_at desc);

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
     or new_status not in ('pending_confirmation', 'confirmed', 'shipped', 'delivered', 'cancelled')
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
  if new_payment_status = 'refunded' and order_record.payment_status <> 'paid' then
    raise exception 'Only a completed sale can be refunded';
  end if;

  if new_payment_status = 'paid' and order_record.payment_status <> 'paid' then
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

-- ============================================
-- CRÉDITO / FIADO: RPCs
-- ============================================

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
  customer_credit_terms text;
  customer_credit_limit numeric;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
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
    select c.credit_enabled, c.credit_limit, c.credit_terms, c.credit_blocked
    into customer_credit_terms, customer_credit_limit
    from public.customers c
    join public.orders o on o.customer_id = c.id
    where o.id = target_order_id;
    if not customer_credit_terms then
      raise exception 'Customer does not have credit enabled';
    end if;
    if customer_credit_limit is null then
      raise exception 'Customer credit terms not found';
    end if;
  end if;

  -- Descuenta stock cuando la venta se completa (pagada O despachada a crédito)
  -- Se ejecuta solo la primera vez que pasa de no-pagado a pagado/crédito
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

  -- Calcular fecha de compromiso si es crédito nuevo y no se proporcionó
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
    raise exception 'Payment amount must be greater than zero';
  end if;
  if payment_method not in ('efectivo', 'transferencia', 'otro') then
    raise exception 'Invalid payment method';
  end if;

  select * into order_record
  from public.orders
  where id = target_order_id
  for update;
  if not found then
    raise exception 'Order not found';
  end if;

  if order_record.payment_status not in ('credit', 'partial') then
    raise exception 'This order does not have a credit balance';
  end if;

  current_credit_amount := coalesce(order_record.credit_amount, 0);
  if payment_amount > current_credit_amount then
    raise exception 'Payment amount exceeds credit balance: $% over $%', payment_amount, current_credit_amount;
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
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

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
      'reason', format('Credit limit exceeded. Available: $%, Order: $%', available_credit, order_total),
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

create or replace function public.admin_set_credit_block(
  target_customer_id uuid,
  blocked boolean
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

  update public.customers
  set credit_blocked = blocked
  where id = target_customer_id;
  if not found then
    raise exception 'Customer not found';
  end if;
end;
$$;

create or replace function public.admin_set_credit_terms(
  target_customer_id uuid,
  new_terms text
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
  if new_terms not in ('quincenal', 'mensual') then
    raise exception 'Invalid credit terms. Must be quincenal or mensual';
  end if;

  update public.customers
  set credit_terms = new_terms
  where id = target_customer_id;
  if not found then
    raise exception 'Customer not found';
  end if;
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

drop function if exists public.admin_save_pending_order(uuid, uuid, jsonb);
drop function if exists public.admin_save_pending_order(uuid, uuid, jsonb, jsonb, date);
drop function if exists public.admin_save_pending_order(uuid, uuid, jsonb, jsonb, date, numeric);

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
  -- Copia local del parámetro: dentro de un UPDATE, "sales_advisor_id = sales_advisor_id"
  -- leería la columna existente (no-op), así que se referencia esta variable.
  saved_sales_advisor_id uuid;
  next_status text := new_status;
begin
  saved_sales_advisor_id := sales_advisor_id;
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
  variant_size integer;
  variant_sizes integer[] := array[]::integer[];
  variant_active boolean;
  retired_variant_id uuid;
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

  if (
       select count(*)
       from jsonb_array_elements(variants_data) as item(value)
       where nullif(item.value->>'id', '') is not null
     ) <> (
       select count(distinct item.value->>'id')
       from jsonb_array_elements(variants_data) as item(value)
       where nullif(item.value->>'id', '') is not null
     ) then
    raise exception 'Product presentations cannot be repeated';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(variants_data) as item(value)
    left join public.product_variants pv
      on pv.id = (item.value->>'id')::uuid
      and pv.product_id = target_product_id
    where nullif(item.value->>'id', '') is not null
      and pv.id is null
  ) then
    raise exception 'Product presentation not found';
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
    if variant ? 'active' and jsonb_typeof(variant->'active') is distinct from 'boolean' then
      raise exception 'Presentation visibility is invalid';
    end if;
    if nullif(variant->>'size', '') is null
       or (variant->>'size') !~ '^[0-9]+$'
       or (variant->>'size')::integer <= 0
       or nullif(variant->>'price', '') is null
       or (variant->>'price')::numeric <= 0
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
    variant_active := coalesce((variant->>'active')::boolean, true);
    if nullif(variant->>'id', '') is null then
      select id, stock into variant_id, previous_stock
      from public.product_variants
      where product_id = target_product_id
        and size_ml = variant_size
        and active = false
      for update;

      if found then
        stock_delta := new_stock - previous_stock;
        update public.product_variants
        set price = (variant->>'price')::numeric,
            cost = nullif(variant->>'cost', '')::numeric,
            stock = new_stock,
            active = variant_active
        where id = variant_id;

        if stock_delta <> 0 then
          insert into public.inventory_movements (variant_id, movement_type, quantity, reason)
          values (
            variant_id,
            case when stock_delta > 0 then 'adjustment_in' else 'adjustment_out' end,
            stock_delta,
            'Product presentation restored'
          );
        end if;
      else
        insert into public.product_variants (product_id, size_ml, price, cost, stock, active)
        values (
          target_product_id,
          variant_size,
          (variant->>'price')::numeric,
          nullif(variant->>'cost', '')::numeric,
          new_stock,
          variant_active
        )
        returning id into variant_id;
        if new_stock > 0 then
          insert into public.inventory_movements (variant_id, movement_type, quantity, reason)
          values (variant_id, 'adjustment_in', new_stock, 'New product presentation added');
        end if;
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
          stock = new_stock,
          active = variant_active
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

  for retired_variant_id in
    select pv.id
    from public.product_variants pv
    where pv.product_id = target_product_id
      and not exists (
        select 1
        from jsonb_array_elements(variants_data) as item(value)
        where nullif(item.value->>'id', '') is not null
          and (item.value->>'id')::uuid = pv.id
      )
    for update
  loop
    select stock into previous_stock
    from public.product_variants
    where id = retired_variant_id;

    if exists (select 1 from public.order_items oi where oi.variant_id = retired_variant_id)
       or exists (select 1 from public.inventory_movements im where im.variant_id = retired_variant_id)
       or previous_stock > 0 then
      update public.product_variants
      set active = false, stock = 0
      where id = retired_variant_id;

      if previous_stock > 0 then
        insert into public.inventory_movements (variant_id, movement_type, quantity, reason)
        values (retired_variant_id, 'adjustment_out', -previous_stock, 'Product presentation removed');
      end if;
    else
      delete from public.product_variants where id = retired_variant_id;
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
  saved_customer_address text,
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
  customer_address text;
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
    select p.id, p.full_name, p.phone, coalesce(p.email, u.email), p.delivery_address
    into customer_record_id, customer_name, customer_phone, customer_email, customer_address
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = current_account_id;

    if customer_record_id is null then
      raise exception 'Customer profile not found' using errcode = '42501';
    end if;
    if nullif(trim(customer_name), '') is null
       or nullif(trim(customer_phone), '') is null then
      raise exception 'Complete your name and phone before placing the order';
    end if;

    insert into public.customers (account_id, full_name, phone, email, delivery_address, source)
    values (current_account_id, trim(customer_name), trim(customer_phone), lower(trim(customer_email)), customer_address, 'web')
    on conflict (account_id) where account_id is not null
    do update set
      full_name = excluded.full_name,
      phone = excluded.phone,
      email = excluded.email,
      delivery_address = excluded.delivery_address,
      updated_at = now()
    returning id into customer_record_id;
  else
    customer_name := nullif(trim(customer_data->>'full_name'), '');
    customer_phone := nullif(trim(customer_data->>'phone'), '');
    customer_email := lower(nullif(trim(customer_data->>'email'), ''));
    customer_address := nullif(trim(customer_data->>'delivery_address'), '');

    if customer_name is null or customer_phone is null then
      raise exception 'Enter a valid name and phone number';
    end if;
    if customer_email is not null and customer_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
      raise exception 'Enter a valid email address';
    end if;

    insert into public.customers (full_name, phone, email, delivery_address, source)
    values (customer_name, customer_phone, customer_email, customer_address, 'web_guest')
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
    E'Hola Perfumes SAAD 👋\n\nQuiero confirmar este pedido:\nRecibo: %s\nCliente: %s\nWhatsApp: %s\nCorreo: %s\nDirección: %s\n%s\n\nAhorro por promociones: $%s\nTotal: $%s\n\nQuedo atento(a) para confirmar disponibilidad, domicilio y medio de pago.',
    upper(left(order_id::text, 8)),
    customer_name,
    customer_phone,
    customer_email,
    coalesce(customer_address, 'No proporcionada'),
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
  saved_customer_address := customer_address;
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
      where payment_status = 'pending' and status = 'confirmed'
    ),
    'completed_sales', (select count(*) from public.orders where payment_status = 'paid'),
    'sales_revenue', coalesce((
      select sum(total) from public.orders where payment_status in ('paid', 'credit', 'partial')
    ), 0),
    'sales_cost', coalesce((
      select sum(oi.unit_cost_snapshot * oi.quantity)
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
      where o.payment_status in ('paid', 'credit', 'partial') and oi.unit_cost_snapshot is not null
    ), 0),
    'sales_delivery_cost', coalesce((
      select sum(delivery_cost) from public.orders where payment_status in ('paid', 'credit', 'partial')
    ), 0),
    'sales_profit', coalesce((
      select sum(oi.subtotal - oi.unit_cost_snapshot * oi.quantity)
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
      where o.payment_status in ('paid', 'credit', 'partial') and oi.unit_cost_snapshot is not null
    ), 0) - coalesce((
      select sum(delivery_cost) from public.orders where payment_status in ('paid', 'credit', 'partial')
    ), 0),
    -- Credit metrics
    'credit_sales', (select count(*) from public.orders where payment_status in ('credit', 'partial')),
    'credit_revenue', coalesce((
      select sum(total) from public.orders where payment_status in ('credit', 'partial')
    ), 0),
    'credit_cost', coalesce((
      select sum(oi.unit_cost_snapshot * oi.quantity)
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
      where o.payment_status in ('credit', 'partial') and oi.unit_cost_snapshot is not null
    ), 0),
    'credit_profit', coalesce((
      select sum(oi.subtotal - oi.unit_cost_snapshot * oi.quantity)
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
      where o.payment_status in ('credit', 'partial') and oi.unit_cost_snapshot is not null
    ), 0) - coalesce((
      select sum(delivery_cost) from public.orders where payment_status in ('credit', 'partial')
    ), 0),
    'credit_outstanding_balance', coalesce((
      select sum(credit_amount) from public.orders where payment_status in ('credit', 'partial')
    ), 0),
    'credit_overdue_balance', coalesce((
      select sum(credit_amount) from public.orders
      where payment_status in ('credit', 'partial')
        and credit_due_date < current_date
    ), 0),
    'credit_customers_with_overdue', (
      select count(distinct o.customer_id) from public.orders o
      where o.payment_status in ('credit', 'partial')
        and o.credit_due_date < current_date
    ),
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
  v_customer_name text := nullif(trim(customer_data->>'full_name'), '');
  v_customer_phone text := nullif(trim(customer_data->>'phone'), '');
  v_customer_email text := lower(nullif(trim(customer_data->>'email'), ''));
  v_customer_city text := nullif(trim(customer_data->>'city'), '');
  v_credit_enabled boolean := (customer_data->>'credit_enabled')::boolean;
  v_credit_limit numeric := nullif(customer_data->>'credit_limit', '')::numeric;
  v_credit_terms text := nullif(customer_data->>'credit_terms', '');
  v_credit_blocked boolean := (customer_data->>'credit_blocked')::boolean;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if v_customer_name is null then
    raise exception 'Customer name is required';
  end if;
  if v_customer_email is not null
     and v_customer_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'Enter a valid email address';
  end if;
  if v_credit_limit is not null and v_credit_limit < 0 then
    raise exception 'Credit limit cannot be negative';
  end if;
  if v_credit_terms is not null and v_credit_terms not in ('quincenal', 'mensual') then
    raise exception 'Invalid credit terms. Must be quincenal or mensual';
  end if;

  update public.customers
  set full_name = v_customer_name,
      phone = v_customer_phone,
      email = v_customer_email,
      city = v_customer_city,
      credit_enabled = coalesce(v_credit_enabled, public.customers.credit_enabled),
      credit_limit = coalesce(v_credit_limit, public.customers.credit_limit),
      credit_terms = coalesce(v_credit_terms, public.customers.credit_terms),
      credit_blocked = coalesce(v_credit_blocked, public.customers.credit_blocked),
      updated_at = now()
  where id = customer_id
  returning account_id into linked_account_id;

  if not found then
    raise exception 'Customer not found';
  end if;

  if linked_account_id is not null then
    update public.profiles
    set full_name = v_customer_name, phone = v_customer_phone, email = v_customer_email
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
revoke all on function public.admin_update_order_transaction(uuid, text, text, date, numeric) from public, anon;
revoke all on function public.admin_save_pending_order(uuid, uuid, jsonb, jsonb, date, numeric, uuid) from public, anon;
revoke all on function public.admin_delete_pending_order(uuid) from public, anon;
revoke all on function public.admin_update_variant_stock(uuid, integer) from public, anon;
revoke all on function public.admin_record_credit_payment(uuid, numeric, text, text, timestamptz) from public, anon;
revoke all on function public.admin_check_credit_limit(uuid, numeric) from public, anon;
revoke all on function public.admin_set_credit_block(uuid, boolean) from public, anon;
revoke all on function public.admin_set_credit_terms(uuid, text) from public, anon;
grant execute on function public.admin_dashboard_metrics() to authenticated;
grant execute on function public.admin_update_customer(uuid, jsonb) to authenticated;
grant execute on function public.admin_set_profile_role(uuid, text) to authenticated;
grant execute on function public.admin_update_variant_cost(uuid, numeric) to authenticated;
grant execute on function public.admin_get_products() to authenticated;
grant execute on function public.admin_update_order_transaction(uuid, text, text, date, numeric) to authenticated;
grant execute on function public.admin_save_pending_order(uuid, uuid, jsonb, jsonb, date, numeric, uuid) to authenticated;
grant execute on function public.admin_delete_pending_order(uuid) to authenticated;
grant execute on function public.admin_update_variant_stock(uuid, integer) to authenticated;
grant execute on function public.admin_record_credit_payment(uuid, numeric, text, text, timestamptz) to authenticated;
grant execute on function public.admin_check_credit_limit(uuid, numeric) to authenticated;
grant execute on function public.admin_set_credit_block(uuid, boolean) to authenticated;
grant execute on function public.admin_set_credit_terms(uuid, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.promotions enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.sales_advisors enable row level security;
alter table public.expenses enable row level security;
alter table public.customer_credit_payments enable row level security;

grant select on public.products to anon, authenticated;
grant select on public.promotions to anon, authenticated;
grant insert, update, delete on public.promotions to authenticated;
revoke select on public.product_variants from public, anon, authenticated;
grant select (id, product_id, size_ml, price, stock, active, created_at)
  on public.product_variants to anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone, email, delivery_address) on public.profiles to authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select on public.customers, public.orders, public.order_items, public.inventory_movements, public.customer_credit_payments
  to authenticated;
grant select, insert, update, delete on public.sales_advisors to authenticated;

drop policy if exists "Public can read active promotions" on public.promotions;
create policy "Public can read active promotions"
  on public.promotions for select to anon, authenticated
  using (active = true);

drop policy if exists "Admins can manage promotions" on public.promotions;
create policy "Admins can manage promotions"
  on public.promotions for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Admins can manage sales advisors" on public.sales_advisors;
create policy "Admins can manage sales advisors"
  on public.sales_advisors for all to authenticated
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

drop policy if exists "Admins can manage credit payments" on public.customer_credit_payments;
create policy "Admins can manage credit payments"
  on public.customer_credit_payments for all to authenticated
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

-- ============================================
-- TABLA DE GASTOS
-- ============================================
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric(12,2) not null check (amount >= 0),
  category text not null default 'general',
  expense_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric(12,2) not null check (amount >= 0),
  category text not null default 'general',
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  next_due_date date not null,
  last_reminded_for date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.admin_pay_recurring_expense(target_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  expense_record public.recurring_expenses%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select * into expense_record
  from public.recurring_expenses
  where id = target_expense_id and active
  for update;
  if not found then
    raise exception 'Recurring expense not found';
  end if;

  insert into public.expenses (name, amount, category, expense_date)
  values (expense_record.name, expense_record.amount, expense_record.category, expense_record.next_due_date);

  update public.recurring_expenses
  set next_due_date = case frequency
        when 'weekly' then next_due_date + 7
        when 'monthly' then (next_due_date + interval '1 month')::date
        when 'yearly' then (next_due_date + interval '1 year')::date
      end,
      last_reminded_for = null
  where id = expense_record.id;
end;
$$;

create table if not exists public.store_settings (
  id smallint primary key default 1 check (id = 1),
  store_name text not null default 'Perfumes SAAD',
  logo_url text,
  whatsapp_number text not null default '573181749436',
  contact_email text,
  whatsapp_greeting text not null default 'Hola, quiero hacer una consulta sobre sus perfumes.',
  home_title text not null default 'Encuentra una fragancia que vaya contigo.',
  home_message text not null default 'Catálogo de perfumería con recomendaciones, diferentes presentaciones y atención personalizada por WhatsApp.',
  receipt_footer_message text not null default 'Gracias por elegir Perfumes SAAD',
  updated_at timestamptz not null default now()
);

insert into public.store_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.store_settings enable row level security;
grant select on public.store_settings to anon, authenticated;
grant update on public.store_settings to authenticated;

drop policy if exists "Public can read store settings" on public.store_settings;
create policy "Public can read store settings"
  on public.store_settings for select to anon, authenticated
  using (true);

drop policy if exists "Admins can update store settings" on public.store_settings;
create policy "Admins can update store settings"
  on public.store_settings for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter table public.expenses add column if not exists name text not null;
alter table public.expenses add column if not exists amount numeric(12,2) not null default 0 check (amount >= 0);
alter table public.expenses add column if not exists category text not null default 'general';
alter table public.expenses add column if not exists expense_date date not null default current_date;

alter table public.expenses enable row level security;
revoke all on public.expenses from public, anon;
grant select, insert, update, delete on public.expenses to authenticated;

alter table public.recurring_expenses enable row level security;
revoke all on public.recurring_expenses from public, anon;
grant select, insert, update, delete on public.recurring_expenses to authenticated;
grant select, update on public.recurring_expenses to service_role;

drop policy if exists "Admins can manage recurring expenses" on public.recurring_expenses;
create policy "Admins can manage recurring expenses"
  on public.recurring_expenses for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on function public.admin_pay_recurring_expense(uuid) from public, anon;
grant execute on function public.admin_pay_recurring_expense(uuid) to authenticated;

drop policy if exists "Admins can manage expenses" on public.expenses;
create policy "Admins can manage expenses"
  on public.expenses for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ============================================
-- FUNCIÓN DE REPORTE SEMANAL
-- ============================================
create or replace function public.weekly_sales_report()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  local_today date := (now() at time zone 'America/Bogota')::date;
  this_week_start date := date_trunc('week', local_today)::date;
  report_week_start date := this_week_start - 7;
  report_week_end date := this_week_start - 1;
  previous_week_start date := report_week_start - 7;
  this_month_start date := date_trunc('month', local_today)::date;
  last_month_start date := (this_month_start - interval '1 month')::date;
  
  -- Current week metrics
  current_week_sales numeric;
  current_week_orders integer;
  current_week_items integer;
  
  -- Previous week metrics
  previous_week_sales numeric;
  previous_week_orders integer;
  
  -- Last month metrics
  last_month_sales numeric;
  
  -- Best sellers
  best_product_this_week text;
  best_product_last_month text;
  best_product_week_qty integer;
  best_product_month_qty integer;
  
  -- New customers
  new_customers_count integer;
  
  -- Low stock
  low_stock_count integer;
  
  -- Pending orders
  pending_orders_count integer;
  
  -- Expenses
  weekly_expenses numeric;
  monthly_expenses numeric;
  
  -- Average order value
  avg_order_value numeric;
  
  -- Credit metrics
  credit_week_sales numeric;
  credit_week_orders integer;
  credit_week_collected numeric;
  credit_outstanding_balance numeric;
  credit_overdue_balance numeric;
  credit_customers_overdue integer;
  
  result jsonb;
begin
  -- The report compares the last two completed weeks using the local business timezone.
  select coalesce(sum(total), 0), count(*),
         coalesce(sum((select sum(oi.quantity) from public.order_items oi where oi.order_id = o.id)), 0)
  into current_week_sales, current_week_orders, current_week_items
  from public.orders o
  where o.payment_status = 'paid'
    and o.paid_at >= report_week_start::timestamp at time zone 'America/Bogota'
    and o.paid_at < this_week_start::timestamp at time zone 'America/Bogota';
  
  -- Previous week sales
  select coalesce(sum(total), 0), count(*)
  into previous_week_sales, previous_week_orders
  from public.orders o
  where o.payment_status = 'paid'
    and o.paid_at >= previous_week_start::timestamp at time zone 'America/Bogota'
    and o.paid_at < report_week_start::timestamp at time zone 'America/Bogota';
  
  -- Last month sales
  select coalesce(sum(total), 0)
  into last_month_sales
  from public.orders o
  where o.payment_status = 'paid'
    and o.paid_at >= last_month_start::timestamp at time zone 'America/Bogota'
    and o.paid_at < this_month_start::timestamp at time zone 'America/Bogota';
  
  -- Best product this week
  select oi.product_name_snapshot, sum(oi.quantity)
  into best_product_this_week, best_product_week_qty
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.payment_status = 'paid'
    and o.paid_at >= report_week_start::timestamp at time zone 'America/Bogota'
    and o.paid_at < this_week_start::timestamp at time zone 'America/Bogota'
  group by oi.product_name_snapshot
  order by sum(oi.quantity) desc
  limit 1;
  
  -- Best product last month
  select oi.product_name_snapshot, sum(oi.quantity)
  into best_product_last_month, best_product_month_qty
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.payment_status = 'paid'
    and o.paid_at >= last_month_start::timestamp at time zone 'America/Bogota'
    and o.paid_at < this_month_start::timestamp at time zone 'America/Bogota'
  group by oi.product_name_snapshot
  order by sum(oi.quantity) desc
  limit 1;
  
  -- New customers this week
  select count(*)
  into new_customers_count
  from public.customers
  where created_at >= report_week_start::timestamp at time zone 'America/Bogota'
    and created_at < this_week_start::timestamp at time zone 'America/Bogota';
  
  -- Low stock products
  select count(*)
  into low_stock_count
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  where pv.active = true and p.active = true and pv.stock <= pv.min_stock;
  
  -- Pending orders
  select count(*)
  into pending_orders_count
  from public.orders
  where payment_status = 'pending' and status = 'confirmed';
  
  -- Weekly expenses
  select coalesce(sum(amount), 0)
  into weekly_expenses
  from public.expenses
  where expense_date >= report_week_start and expense_date < this_week_start;
  
  -- Monthly expenses
  select coalesce(sum(amount), 0)
  into monthly_expenses
  from public.expenses
  where expense_date >= this_month_start and expense_date < (this_month_start + interval '1 month')::date;
  
  -- Credit metrics
  -- Credit sales this week (new credit orders confirmed this week)
  select coalesce(sum(total), 0), count(*)
  into credit_week_sales, credit_week_orders
  from public.orders o
  where o.payment_status in ('credit', 'partial')
    and o.status in ('confirmed', 'shipped', 'delivered')
    and o.created_at >= report_week_start::timestamp at time zone 'America/Bogota'
    and o.created_at < this_week_start::timestamp at time zone 'America/Bogota';
  
  -- Credit collected this week (payments received on credit orders)
  select coalesce(sum(cp.amount), 0)
  into credit_week_collected
  from public.customer_credit_payments cp
  join public.orders o on o.id = cp.order_id
  where cp.paid_at >= report_week_start::timestamp at time zone 'America/Bogota'
    and cp.paid_at < this_week_start::timestamp at time zone 'America/Bogota';
  
  -- Total outstanding credit balance
  select coalesce(sum(credit_amount), 0)
  into credit_outstanding_balance
  from public.orders
  where payment_status in ('credit', 'partial');
  
  -- Overdue credit balance
  select coalesce(sum(credit_amount), 0)
  into credit_overdue_balance
  from public.orders
  where payment_status in ('credit', 'partial')
    and credit_due_date < current_date;
  
  -- Customers with overdue credit
  select count(distinct customer_id)
  into credit_customers_overdue
  from public.orders
  where payment_status in ('credit', 'partial')
    and credit_due_date < current_date;
  
  -- Average order value
  avg_order_value := case when current_week_orders > 0 then current_week_sales / current_week_orders else 0 end;
  
  -- Build result
  result := jsonb_build_object(
    'report_date', local_today,
    'week_start', report_week_start,
    'week_end', report_week_end,
    'current_week', jsonb_build_object(
      'sales', current_week_sales,
      'orders', current_week_orders,
      'items_sold', current_week_items,
      'average_order_value', avg_order_value
    ),
    'previous_week', jsonb_build_object(
      'sales', previous_week_sales,
      'orders', previous_week_orders
    ),
    'last_month', jsonb_build_object(
      'sales', last_month_sales
    ),
    'best_product_this_week', jsonb_build_object(
      'name', coalesce(best_product_this_week, 'N/A'),
      'quantity', coalesce(best_product_week_qty, 0)
    ),
    'best_product_last_month', jsonb_build_object(
      'name', coalesce(best_product_last_month, 'N/A'),
      'quantity', coalesce(best_product_month_qty, 0)
    ),
    'new_customers', new_customers_count,
    'low_stock_count', low_stock_count,
    'pending_orders', pending_orders_count,
    'expenses', jsonb_build_object(
      'weekly', weekly_expenses,
      'monthly', monthly_expenses
    ),
    'credit', jsonb_build_object(
      'week_sales', credit_week_sales,
      'week_orders', credit_week_orders,
      'week_collected', credit_week_collected,
      'outstanding_balance', credit_outstanding_balance,
      'overdue_balance', credit_overdue_balance,
      'customers_overdue', credit_customers_overdue
    )
  );
  
  return result;
end;
$$;

revoke all on function public.weekly_sales_report() from public;
revoke all on function public.weekly_sales_report() from anon, authenticated;
grant execute on function public.weekly_sales_report() to authenticated, service_role;

create or replace function public.daily_sales_report(target_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  day_start timestamptz := target_date::timestamp at time zone 'America/Bogota';
  day_end timestamptz := (target_date + 1)::timestamp at time zone 'America/Bogota';
  daily_sales numeric;
  daily_orders integer;
  daily_items integer;
  daily_expenses numeric;
  best_product text;
  best_product_quantity integer;
begin
  if target_date is null then
    raise exception 'Report date is required';
  end if;

  select coalesce(sum(total), 0), count(*),
         coalesce(sum((select sum(oi.quantity) from public.order_items oi where oi.order_id = o.id)), 0)
  into daily_sales, daily_orders, daily_items
  from public.orders o
  where o.payment_status = 'paid'
    and o.paid_at >= day_start
    and o.paid_at < day_end;

  select oi.product_name_snapshot, sum(oi.quantity)
  into best_product, best_product_quantity
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.payment_status = 'paid'
    and o.paid_at >= day_start
    and o.paid_at < day_end
  group by oi.product_name_snapshot
  order by sum(oi.quantity) desc, oi.product_name_snapshot
  limit 1;

  select coalesce(sum(amount), 0)
  into daily_expenses
  from public.expenses
  where expense_date = target_date;

  return jsonb_build_object(
    'report_date', target_date,
    'sales', daily_sales,
    'orders', daily_orders,
    'items_sold', daily_items,
    'expenses', daily_expenses,
    'best_product', jsonb_build_object(
      'name', coalesce(best_product, 'N/A'),
      'quantity', coalesce(best_product_quantity, 0)
    )
  );
end;
$$;

revoke all on function public.daily_sales_report(date) from public, anon, authenticated;
grant execute on function public.daily_sales_report(date) to service_role;

-- ============================================
-- FUNCIÓN DE SEGUIMIENTO DE PEDIDOS (PÚBLICO)
-- ============================================
create or replace function public.get_order_tracking(
  order_code text,
  customer_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record public.orders%rowtype;
  customer_record public.customers%rowtype;
  items_json jsonb;
  result jsonb;
begin
  if order_code is null or nullif(btrim(order_code), '') is null then
    raise exception 'Ingresa el número de pedido';
  end if;
  if customer_phone is null or nullif(btrim(customer_phone), '') is null then
    raise exception 'Ingresa el número de teléfono';
  end if;

  select * into order_record
  from public.orders
  where upper(left(id::text, 8)) = upper(btrim(order_code));

  if not found then
    raise exception 'No encontramos un pedido con esos datos';
  end if;

  select * into customer_record
  from public.customers
  where id = order_record.customer_id;

  if not found then
    raise exception 'No encontramos un pedido con esos datos';
  end if;

  if position(regexp_replace(btrim(customer_phone), '[^0-9]', '', 'g') in coalesce(customer_record.phone, '')) = 0 then
    raise exception 'No encontramos un pedido con esos datos';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', oi.product_name_snapshot,
    'size_ml', oi.size_ml,
    'quantity', oi.quantity,
    'unit_price', oi.unit_price,
    'subtotal', oi.subtotal
  )), '[]'::jsonb)
  into items_json
  from public.order_items oi
  where oi.order_id = order_record.id;

  result := jsonb_build_object(
    'order_code', upper(left(order_record.id::text, 8)),
    'status', order_record.status,
    'payment_status', order_record.payment_status,
    'created_at', order_record.created_at,
    'paid_at', order_record.paid_at,
    'total', order_record.total,
    'items', items_json
  );

  return result;
end;
$$;

revoke all on function public.get_order_tracking(text, text) from public;
grant execute on function public.get_order_tracking(text, text) to anon, authenticated;

-- ============================================
-- CRON JOB: REPORTE SEMANAL (Domingos 8am Colombia = 1pm UTC)
-- ============================================
create extension if not exists pg_cron with schema extensions;

select cron.unschedule(jobid)
from cron.job
where jobname = 'weekly-sales-report';

select cron.schedule(
  'weekly-sales-report',
  '0 13 * * 0',
  $weekly$
    select net.http_post(
      url := 'https://' || current_setting('app.settings.supabase_url', true) || '/functions/v1/weekly-report',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key', true),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $weekly$
);

select cron.unschedule(jobid)
from cron.job
where jobname = 'expense-payment-reminders';

select cron.schedule(
  'expense-payment-reminders',
  '0 13 * * *',
  $reminders$
    select net.http_post(
      url := 'https://' || current_setting('app.settings.supabase_url', true) || '/functions/v1/expense-reminders',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key', true),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $reminders$
);
