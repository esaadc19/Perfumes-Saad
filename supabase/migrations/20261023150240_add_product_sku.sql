-- ------------------------------------------------------------
-- SKU por producto
-- ------------------------------------------------------------
-- Es opcional para no invalidar los productos que ya existen.
-- Cuando se diligencia, no se repite sin importar mayusculas y
-- se guarda sin espacios al inicio ni al final.

alter table public.products
  add column if not exists sku text;

alter table public.products
  drop constraint if exists products_sku_format_check;

alter table public.products
  add constraint products_sku_format_check
  check (
    sku is null
    or (
      sku = btrim(sku)
      and char_length(sku) between 1 and 64
    )
  );

create unique index if not exists products_sku_unique_idx
  on public.products (upper(sku))
  where sku is not null;

comment on column public.products.sku is
  'Codigo interno unico del producto (opcional). Se compara sin distinguir mayusculas/minusculas.';

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
    brand, name, sku, gender, category, description, family, climate, image_url, image_urls, promotion_id, active
  )
  values (
    trim(product_data->>'brand'),
    trim(product_data->>'name'),
    nullif(btrim(product_data->>'sku'), ''),
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
      sku = case
        when product_data ? 'sku' then nullif(btrim(product_data->>'sku'), '')
        else sku
      end,
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

revoke all on function public.admin_update_product(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.admin_update_product(uuid, jsonb, jsonb) to authenticated;
