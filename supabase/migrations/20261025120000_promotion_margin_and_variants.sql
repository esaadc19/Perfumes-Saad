-- ------------------------------------------------------------
-- Promociones por presentacion y con margen minimo
-- ------------------------------------------------------------
-- Hasta ahora una promocion se aplicaba a todas las presentaciones
-- del producto. Eso permite que una presentacion de costo alto entre
-- en un paquete de $285.000 y se pierda dinero.
--
-- Ahora la promocion guarda:
--   - el margen minimo por paquete antes de domicilio,
--   - la tarifa de IVA y si el precio del paquete ya la incluye,
--   - el costo maximo por unidad que se deduce de esos datos.
--
-- La tabla promotion_variants es la fuente de verdad de que
-- presentaciones participan. products.promotion_id se conserva solo
-- para mostrar la oferta en la tienda y se sincroniza desde aqui.
--
-- Las promociones que ya existian conservan su comportamiento:
-- minimum_profit queda NULL, max_unit_cost queda NULL y no se aplica
-- tope de costo hasta que alguien edite su margen.

-- ------------------------------------------------------------
-- 1. Campos de margen en promotions
-- ------------------------------------------------------------

alter table public.promotions
  add column if not exists minimum_profit numeric(12,2);

alter table public.promotions
  add column if not exists tax_rate numeric(5,4) not null default 0.19;

alter table public.promotions
  add column if not exists price_includes_tax boolean not null default true;

alter table public.promotions
  add column if not exists cost_includes_tax boolean not null default true;

alter table public.promotions
  add column if not exists max_unit_cost numeric(12,2) generated always as (
    case
      when minimum_profit is null or required_quantity <= 0 then null
      else
        round(
          (
            (
              (case when price_includes_tax then bundle_price / (1 + tax_rate) else bundle_price end)
              - minimum_profit
            ) / required_quantity
          ) * (case when cost_includes_tax then 1 + tax_rate else 1 end),
          2
        )
    end
  ) stored;

alter table public.promotions
  drop constraint if exists promotions_minimum_profit_check;
alter table public.promotions
  add constraint promotions_minimum_profit_check
  check (minimum_profit is null or minimum_profit >= 0);

alter table public.promotions
  drop constraint if exists promotions_tax_rate_check;
alter table public.promotions
  add constraint promotions_tax_rate_check
  check (tax_rate >= 0 and tax_rate < 1);

comment on column public.promotions.minimum_profit is
  'Utilidad minima que debe dejar el paquete completo antes de domicilio. NULL conserva el comportamiento anterior sin tope.';
comment on column public.promotions.cost_includes_tax is
  'Indica si product_variants.cost ya incluye IVA. Se descuenta del costo para medir el margen.';
comment on column public.promotions.max_unit_cost is
  'Costo maximo por unidad, en la misma base de IVA que product_variants.cost, para que el paquete cumpla el margen minimo.';

-- ------------------------------------------------------------
-- 2. Presentaciones que participan en cada promocion
-- ------------------------------------------------------------

create table if not exists public.promotion_variants (
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  variant_id uuid not null unique references public.product_variants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (promotion_id, variant_id)
);

create index if not exists promotion_variants_promotion_id_idx
  on public.promotion_variants (promotion_id);

comment on table public.promotion_variants is
  'Presentaciones que participan en una promocion. Un variant_id solo puede pertenecer a una promocion.';

alter table public.promotion_variants enable row level security;

revoke all on public.promotion_variants from public, anon, authenticated;
grant select on public.promotion_variants to anon, authenticated;

drop policy if exists "Public can read active promotion variants" on public.promotion_variants;
create policy "Public can read active promotion variants"
  on public.promotion_variants for select to anon, authenticated
  using (
    exists (
      select 1
      from public.promotions promotion
      where promotion.id = promotion_variants.promotion_id
        and promotion.active = true
    )
  );

-- Las promociones que ya estaban asociadas conservan todas sus
-- presentaciones. El tope de costo no las afecta porque su
-- minimum_profit queda NULL.
insert into public.promotion_variants (promotion_id, variant_id)
select product.promotion_id, variant.id
from public.products product
join public.product_variants variant on variant.product_id = product.id
where product.promotion_id is not null
on conflict (variant_id) do nothing;

-- ------------------------------------------------------------
-- 3. Mantener sincronizados products.promotion_id y la elegibilidad
-- ------------------------------------------------------------

create or replace function public.sync_promotion_eligibility(target_promotion_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_promotion_id is null then
    return;
  end if;

  -- Una presentacion inactiva o cuyo costo subio por encima del tope
  -- deja de participar automaticamente.
  delete from public.promotion_variants promotion_variant
  using public.product_variants variant, public.promotions promotion
  where promotion_variant.variant_id = variant.id
    and promotion.id = target_promotion_id
    and promotion_variant.promotion_id = target_promotion_id
    and (
      variant.active = false
      or (
        promotion.max_unit_cost is not null
        and (variant.cost is null or variant.cost > promotion.max_unit_cost)
      )
    );

  -- Si el producto tiene presentaciones participando, la tienda debe
  -- mostrar la oferta en ese producto.
  update public.products product
  set promotion_id = target_promotion_id,
      updated_at = now()
  where product.promotion_id is distinct from target_promotion_id
    and exists (
      select 1
      from public.promotion_variants promotion_variant
      join public.product_variants variant on variant.id = promotion_variant.variant_id
      where promotion_variant.promotion_id = target_promotion_id
        and variant.product_id = product.id
    );

  -- Si ya no queda ninguna presentacion, se quita la etiqueta de oferta
  -- del producto.
  update public.products product
  set promotion_id = null,
      updated_at = now()
  where product.promotion_id = target_promotion_id
    and not exists (
      select 1
      from public.promotion_variants promotion_variant
      join public.product_variants variant on variant.id = promotion_variant.variant_id
      where promotion_variant.promotion_id = target_promotion_id
        and variant.product_id = product.id
    );
end;
$$;

create or replace function public.on_promotion_margin_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_promotion_eligibility(new.id);
  return new;
end;
$$;

drop trigger if exists promotion_margin_changed on public.promotions;
create trigger promotion_margin_changed
  after update of bundle_price, required_quantity, minimum_profit, tax_rate, price_includes_tax, cost_includes_tax
  on public.promotions
  for each row execute procedure public.on_promotion_margin_changed();

create or replace function public.on_variant_eligibility_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_promotion_id uuid;
begin
  if new.cost is not distinct from old.cost
     and new.active is not distinct from old.active then
    return new;
  end if;

  for target_promotion_id in
    select distinct promotion_variant.promotion_id
    from public.promotion_variants promotion_variant
    join public.promotions promotion on promotion.id = promotion_variant.promotion_id
    where promotion_variant.variant_id = new.id
      and (
        new.active = false
        or (
          promotion.max_unit_cost is not null
          and (new.cost is null or new.cost > promotion.max_unit_cost)
        )
      )
  loop
    delete from public.promotion_variants promotion_variant
    where promotion_variant.promotion_id = target_promotion_id
      and promotion_variant.variant_id = new.id;

    perform public.sync_promotion_eligibility(target_promotion_id);
  end loop;

  return new;
end;
$$;

drop trigger if exists variant_promotion_eligibility_changed on public.product_variants;
create trigger variant_promotion_eligibility_changed
  after update of cost, active
  on public.product_variants
  for each row execute procedure public.on_variant_eligibility_changed();

create or replace function public.on_variant_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.products product
  set promotion_id = null,
      updated_at = now()
  where product.id = old.product_id
    and product.promotion_id is not null
    and not exists (
      select 1
      from public.promotion_variants promotion_variant
      join public.product_variants variant on variant.id = promotion_variant.variant_id
      where variant.product_id = old.product_id
    );

  return old;
end;
$$;

drop trigger if exists variant_promotion_deleted on public.product_variants;
create trigger variant_promotion_deleted
  after delete on public.product_variants
  for each row execute procedure public.on_variant_deleted();

revoke all on function public.sync_promotion_eligibility(uuid) from public, anon, authenticated;
revoke all on function public.on_promotion_margin_changed() from public, anon, authenticated;
revoke all on function public.on_variant_eligibility_changed() from public, anon, authenticated;
revoke all on function public.on_variant_deleted() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. RPC del panel: consultar y guardar presentaciones
-- ------------------------------------------------------------

create or replace function public.admin_get_promotion_variants(target_promotion_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public.admin_require_section('promotions');

  if not exists (
    select 1 from public.promotions where id = target_promotion_id
  ) then
    raise exception 'Promotion not found';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'variant_id', variant.id,
        'product_id', product.id,
        'brand', product.brand,
        'name', product.name,
        'size_ml', variant.size_ml,
        'price', variant.price,
        'cost', variant.cost,
        'stock', variant.stock,
        'variant_active', variant.active,
        'product_active', product.active,
        'archived', product.archived,
        'selected', exists (
          select 1
          from public.promotion_variants promotion_variant
          where promotion_variant.promotion_id = target_promotion_id
            and promotion_variant.variant_id = variant.id
        )
      )
      order by product.brand, product.name, variant.size_ml
    ),
    '[]'::jsonb
  )
  into result
  from public.product_variants variant
  join public.products product on product.id = variant.product_id;

  return result;
end;
$$;

revoke all on function public.admin_get_promotion_variants(uuid) from public, anon;
grant execute on function public.admin_get_promotion_variants(uuid) to authenticated;

create or replace function public.admin_set_promotion_variants(
  target_promotion_id uuid,
  variant_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  promotion_record public.promotions%rowtype;
  normalized_ids uuid[] := coalesce(variant_ids, array[]::uuid[]);
  affected_product_ids uuid[] := array[]::uuid[];
  previous_product_ids uuid[] := array[]::uuid[];
  all_product_ids uuid[] := array[]::uuid[];
  invalid_variant record;
  inserted_count integer := 0;
begin
  perform public.admin_require_section('promotions');

  select * into promotion_record
  from public.promotions
  where id = target_promotion_id;

  if not found then
    raise exception 'Promotion not found';
  end if;

  select coalesce(array_agg(distinct selected.id), array[]::uuid[])
  into normalized_ids
  from unnest(normalized_ids) as selected(id)
  where selected.id is not null;

  if exists (
    select 1
    from unnest(normalized_ids) as selected(id)
    left join public.product_variants variant on variant.id = selected.id
    where variant.id is null
  ) then
    raise exception 'One or more presentations were not found';
  end if;

  select variant.product_id,
         variant.size_ml,
         product.brand,
         product.name,
         variant.cost
  into invalid_variant
  from unnest(normalized_ids) as selected(id)
  join public.product_variants variant on variant.id = selected.id
  join public.products product on product.id = variant.product_id
  where variant.active = false
     or (
       promotion_record.max_unit_cost is not null
       and (variant.cost is null or variant.cost > promotion_record.max_unit_cost)
     )
  limit 1;

  if found then
    raise exception 'La presentacion % ml de % % no cumple el margen minimo de la promocion',
      invalid_variant.size_ml,
      invalid_variant.brand,
      invalid_variant.name;
  end if;

  select coalesce(array_agg(distinct variant.product_id), array[]::uuid[])
  into affected_product_ids
  from public.product_variants variant
  where variant.id = any(normalized_ids);

  select coalesce(array_agg(distinct variant.product_id), array[]::uuid[])
  into previous_product_ids
  from public.promotion_variants promotion_variant
  join public.product_variants variant on variant.id = promotion_variant.variant_id
  where promotion_variant.promotion_id = target_promotion_id;

  select coalesce(array_agg(distinct product_id), array[]::uuid[])
  into all_product_ids
  from unnest(affected_product_ids || previous_product_ids) as product_id;

  -- Una presentacion solo puede estar en una promocion. Al mover una
  -- presentacion, se limpian todas las asociaciones de su producto y
  -- luego se insertan las seleccionadas.
  delete from public.promotion_variants promotion_variant
  using public.product_variants variant
  where promotion_variant.variant_id = variant.id
    and variant.product_id = any(all_product_ids);

  insert into public.promotion_variants (promotion_id, variant_id)
  select target_promotion_id, selected.id
  from unnest(normalized_ids) as selected(id);

  get diagnostics inserted_count = row_count;

  update public.products product
  set promotion_id = target_promotion_id,
      updated_at = now()
  where product.id = any(affected_product_ids);

  update public.products product
  set promotion_id = null,
      updated_at = now()
  where product.id = any(previous_product_ids)
    and not (product.id = any(affected_product_ids))
    and product.promotion_id = target_promotion_id;

  return inserted_count;
end;
$$;

revoke all on function public.admin_set_promotion_variants(uuid, uuid[]) from public, anon;
grant execute on function public.admin_set_promotion_variants(uuid, uuid[]) to authenticated;

-- ------------------------------------------------------------
-- 5. El descuento real usa promotion_variants y el tope de costo
-- ------------------------------------------------------------

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
      variant.product_id,
      variant.price,
      promotion_variant.promotion_id,
      promotion.required_quantity,
      promotion.bundle_price,
      promotion.allow_mixed,
      case when promotion.allow_mixed then null::uuid else variant.product_id end as group_product_id
    from requested
    join public.product_variants variant on variant.id = requested.variant_id
    join public.promotion_variants promotion_variant
      on promotion_variant.variant_id = variant.id
    join public.promotions promotion
      on promotion.id = promotion_variant.promotion_id
     and promotion.active = true
     and (
       promotion.max_unit_cost is null
       or (variant.cost is not null and variant.cost <= promotion.max_unit_cost)
     )
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

-- ------------------------------------------------------------
-- 6. admin_get_products agrega las promociones de cada presentacion
-- ------------------------------------------------------------

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
  perform public.admin_require_section('products');

  select coalesce(
    jsonb_agg(
      to_jsonb(product) || jsonb_build_object(
        'product_variants',
        coalesce((
          select jsonb_agg(
            to_jsonb(variant) || jsonb_build_object(
              'promotion_ids',
              coalesce((
                select jsonb_agg(promotion_variant.promotion_id)
                from public.promotion_variants promotion_variant
                where promotion_variant.variant_id = variant.id
              ), '[]'::jsonb)
            )
            order by variant.size_ml
          )
          from public.product_variants variant
          where variant.product_id = product.id
        ), '[]'::jsonb)
      )
      order by product.created_at desc
    ),
    '[]'::jsonb
  )
  into result
  from public.products product;

  return result;
end;
$$;

revoke all on function public.admin_get_products() from public, anon;
grant execute on function public.admin_get_products() to authenticated;
