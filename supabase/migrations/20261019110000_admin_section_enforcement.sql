-- ------------------------------------------------------------
-- Los permisos por seccion se aplican de verdad en la base
-- ------------------------------------------------------------
-- La migracion anterior creo la tabla de permisos y la interfaz que
-- los reparte, pero el dato se quedaba en la pantalla: las funciones y
-- las politicas de la base seguian aceptando a cualquier administrador
-- sin preguntar que secciones podia ver. Con eso, esconder Cartera del
-- menu no esconde nada: la persona abre la consola y pide los datos.
--
-- Esta migracion cierra la puerta de verdad:
--
-- - las funciones admin dejan de preguntar "eres admin?" y preguntan
--   "puedes ver esta seccion?"
-- - las politicas RLS de cada tabla pasan a mirar la seccion, no el rol
--
-- El nombre de la seccion se pone en la funcion segun la pantalla desde
-- la que se llama, no segun la tabla que toca. Por ejemplo
-- admin_dashboard_metrics es 'overview' porque se ve en el Dashboard,
-- y admin_get_products es 'products' aunque lea las mismas tablas.
--
-- OJO con lo que significa 'credit' en customers: la tabla customers
-- guarda tambien el saldo del fiado, asi que una persona con Cartera
-- necesita poder leerla aunque no tenga la seccion Clientes. Por eso
-- algunas tablas aceptan varias secciones.

-- ------------------------------------------------------------
-- Predicados
-- ------------------------------------------------------------

-- El usuario actual puede ver alguna de estas secciones?
create or replace function public.admin_has_any_section(target_sections text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (public.is_admin() or public.is_asesor())
    and exists (
      select 1
      from public.admin_section_permissions p
      where p.profile_id = (select auth.uid())
        and p.allowed
        and p.section_id = any(target_sections)
    );
$$;

-- El usuario actual puede ver esta seccion? Si no, la operacion falla.
create or replace function public.admin_require_section(target_section text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Las llamadas del servidor (service_role, el cron del reporte) no
  -- tienen usuario: no hay a quien preguntarle, asi que pasan. Sin esto
  -- el reporte semanal seeria rejected.
  if (select auth.uid()) is null then
    return;
  end if;

  if not (public.is_admin() or public.is_asesor()) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if not public.admin_can_access(target_section) then
    raise exception 'You do not have access to the % section', target_section
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.admin_has_any_section(text[]) from public, anon;
grant execute on function public.admin_has_any_section(text[]) to authenticated;
revoke all on function public.admin_require_section(text) from public, anon;
grant execute on function public.admin_require_section(text) to authenticated;

-- Estas dos las consulta el panel para saber que secciones puede ver la
-- cuenta. Sin el grant, la pantalla de Permisos no puede leer los
-- permisos de nadie y la de "mis secciones" tampoco.
revoke all on function public.admin_allowed_sections() from public, anon;
grant execute on function public.admin_allowed_sections() to authenticated;
revoke all on function public.admin_can_access(text) from public, anon;
grant execute on function public.admin_can_access(text) to authenticated;
revoke all on function public.admin_has_all_sections() from public, anon;
grant execute on function public.admin_has_all_sections() to authenticated;

-- ------------------------------------------------------------
-- Funciones: el guard pasa a preguntar por la seccion
-- ------------------------------------------------------------
-- Se reescriben con pg_get_functiondef y una expresion regular, en vez
-- de reescribir 20 funciones a mano. Si una no se puede reescribir se
-- avisa con un NOTICE y se deja como estaba: asi queda con el
-- comportamiento viejo (solo admin), que es restrictivo y no rompe
-- nada.
--
-- El bloque de excepcion es importante: si una reescritura dejara una
-- funcion invalida, la migracion NO se cae entera. Se avisa y esa
-- funcion sigue como estaba.

do $$
declare
  r record;
  definicion text;
  nueva text;
  seccion text;
  aplicadas integer := 0;
  ya_aplicadas integer := 0;
  fallidas text := '';
begin
  for r in
    select p.oid, p.proname, pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'admin_dashboard_metrics',
        'admin_get_products',
        'admin_create_product',
        'admin_update_product',
        'admin_delete_product',
        'admin_update_variant_cost',
        'admin_update_variant_stock',
        'admin_product_profitability',
        'admin_save_pending_order',
        'admin_update_order_transaction',
        'admin_delete_pending_order',
        'admin_record_credit_payment',
        'admin_check_credit_limit',
        'admin_set_credit_block',
        'admin_set_credit_terms',
        'admin_update_customer',
        'admin_set_profile_role',
        'admin_pay_recurring_expense',
        'admin_delete_credit_payment',
        'admin_update_credit_payment',
        'register_stock_movement'
      )
  loop
    seccion := case r.proname
      when 'admin_dashboard_metrics' then 'overview'
      when 'admin_get_products' then 'products'
      when 'admin_create_product' then 'products'
      when 'admin_update_product' then 'products'
      when 'admin_delete_product' then 'products'
      when 'admin_update_variant_cost' then 'products'
      when 'admin_update_variant_stock' then 'products'
      when 'admin_product_profitability' then 'reports'
      when 'admin_save_pending_order' then 'transactions'
      when 'admin_update_order_transaction' then 'transactions'
      when 'admin_delete_pending_order' then 'transactions'
      when 'admin_record_credit_payment' then 'credit'
      when 'admin_check_credit_limit' then 'credit'
      when 'admin_set_credit_block' then 'credit'
      when 'admin_set_credit_terms' then 'credit'
      when 'admin_update_customer' then 'customers'
      when 'admin_set_profile_role' then 'profiles'
      when 'admin_pay_recurring_expense' then 'expenses'
      when 'admin_delete_credit_payment' then 'credit'
      when 'admin_update_credit_payment' then 'credit'
      when 'register_stock_movement' then 'products'
    end;

    definicion := r.def;

    -- Si ya se le puso el control antes, no hay que hacer nada. Esto hace
    -- que la migracion se pueda correr dos veces sin romper nada.
    if definicion like '%admin_require_section(%' then
      ya_aplicadas := ya_aplicadas + 1;
      continue;
    end if;

    nueva := regexp_replace(
      definicion,
      'if not public\.is_admin\(\) then.*?end if;',
      'perform public.admin_require_section(''' || seccion || ''');',
      'g'
    );

    if nueva is distinct from definicion then
      begin
        execute nueva;
        aplicadas := aplicadas + 1;
      exception when others then
        fallidas := fallidas || r.proname || ' (' || sqlerrm || ') ';
      end;
    else
      fallidas := fallidas || r.proname || ' (sin guard is_admin) ';
    end if;
  end loop;

  raise notice 'Funciones reescritas ahora: %. Ya estaban: %. Sin reescribir: %',
    aplicadas, ya_aplicadas, fallidas;
end;
$$;

-- ------------------------------------------------------------
-- Las dos funciones de merma
-- ------------------------------------------------------------
-- Son `language sql`, y a una funcion de SQL no se le puede meter un
-- `perform` en el medio. Se vuelven a crear en plpgsql con la misma
-- consulta y una comprobacion al principio.
--
-- get_waste_summary se ve en el Dashboard (la tarjeta de merma), asi que
-- la seccion es 'overview'. get_variant_movements es el historial de una
-- presentacion, que se abre desde el producto: 'products'.

create or replace function public.get_variant_movements(
  target_variant_id uuid,
  movement_limit integer default 50
)
returns table (
  movement_id uuid,
  movement_type text,
  quantity integer,
  reason text,
  order_id uuid,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_require_section('products');
  return query
    select im.id, im.movement_type, im.quantity, im.reason, im.order_id, im.created_at
    from public.inventory_movements im
    where im.variant_id = target_variant_id
    order by im.created_at desc
    limit greatest(coalesce(movement_limit, 50), 1);
end;
$$;

create or replace function public.get_waste_summary(days_back integer default 30)
returns table (
  product_name text,
  size_ml integer,
  units_lost integer,
  cost_per_unit numeric,
  total_lost numeric,
  last_movement timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_require_section('overview');
  return query
    select p.name,
           pv.size_ml,
           sum(-im.quantity)::integer,
           coalesce(pv.cost, 0),
           sum(-im.quantity * coalesce(pv.cost, 0)),
           max(im.created_at)
    from public.inventory_movements im
    join public.product_variants pv on pv.id = im.variant_id
    join public.products p on p.id = pv.product_id
    where im.movement_type in ('merma', 'rotura', 'robo', 'vencimiento')
      and im.quantity < 0
      and im.created_at >= now() - make_interval(days => greatest(coalesce(days_back, 30), 1))
    group by p.name, pv.size_ml, pv.cost
    having sum(-im.quantity) > 0
    order by 5 desc;
end;
$$;

-- register_stock_movement ya tiene el guard de is_admin y lo reescribe
-- el bloque de arriba. weekly_sales_report lo llama el cron con
-- service_role, que no tiene usuario, asi que admin_require_section lo
-- deja pasar.

-- ------------------------------------------------------------
-- Politicas RLS: ahora preguntan por seccion
-- ------------------------------------------------------------
-- Nota sobre customers: esa tabla guarda tambien el saldo del fiado y
-- los datos de contacto que usa la pantalla Cobrar. Por eso la leen
-- varias secciones y no solo Clientes.

drop policy if exists "Admins can manage promotions" on public.promotions;
create policy "Admins can manage promotions"
  on public.promotions for all to authenticated
  using ((select public.admin_has_any_section('{promotions,transactions}')))
  with check ((select public.admin_has_any_section('{promotions,transactions}')));

drop policy if exists "Admins can manage sales advisors" on public.sales_advisors;
create policy "Admins can manage sales advisors"
  on public.sales_advisors for all to authenticated
  using ((select public.admin_has_any_section('{advisors,transactions}')))
  with check ((select public.admin_has_any_section('{advisors,transactions}')));

drop policy if exists "Admins can manage products" on public.products;
create policy "Admins can manage products"
  on public.products for all to authenticated
  using ((select public.admin_has_any_section('{products}')))
  with check ((select public.admin_has_any_section('{products}')));

drop policy if exists "Admins can manage variants" on public.product_variants;
create policy "Admins can manage variants"
  on public.product_variants for all to authenticated
  using ((select public.admin_has_any_section('{products}')))
  with check ((select public.admin_has_any_section('{products}')));

drop policy if exists "Admins can manage customers" on public.customers;
create policy "Admins can manage customers"
  on public.customers for all to authenticated
  using ((select public.admin_has_any_section('{customers,credit,collect}')))
  with check ((select public.admin_has_any_section('{customers,credit,collect}')));

drop policy if exists "Admins can manage orders" on public.orders;
create policy "Admins can manage orders"
  on public.orders for all to authenticated
  using ((select public.admin_has_any_section('{transactions}')))
  with check ((select public.admin_has_any_section('{transactions}')));

drop policy if exists "Admins can manage order items" on public.order_items;
create policy "Admins can manage order items"
  on public.order_items for all to authenticated
  using ((select public.admin_has_any_section('{transactions}')))
  with check ((select public.admin_has_any_section('{transactions}')));

drop policy if exists "Admins can manage inventory movements" on public.inventory_movements;
create policy "Admins can manage inventory movements"
  on public.inventory_movements for all to authenticated
  using ((select public.admin_has_any_section('{products}')))
  with check ((select public.admin_has_any_section('{products}')));

drop policy if exists "Admins can manage credit payments" on public.customer_credit_payments;
create policy "Admins can manage credit payments"
  on public.customer_credit_payments for all to authenticated
  using ((select public.admin_has_any_section('{credit}')))
  with check ((select public.admin_has_any_section('{credit}')));

drop policy if exists "Admins can manage recurring expenses" on public.recurring_expenses;
create policy "Admins can manage recurring expenses"
  on public.recurring_expenses for all to authenticated
  using ((select public.admin_has_any_section('{expenses,reports}')))
  with check ((select public.admin_has_any_section('{expenses,reports}')));

drop policy if exists "Admins can manage expenses" on public.expenses;
create policy "Admins can manage expenses"
  on public.expenses for all to authenticated
  using ((select public.admin_has_any_section('{expenses,reports}')))
  with check ((select public.admin_has_any_section('{expenses,reports}')));

drop policy if exists "Admins can update store settings" on public.store_settings;
create policy "Admins can update store settings"
  on public.store_settings for update to authenticated
  using ((select public.admin_has_any_section('{settings}')))
  with check ((select public.admin_has_any_section('{settings}')));

-- Leer perfiles: la cuenta siempre puede leer la suya. La lista de
-- cuentas del panel necesita la seccion Perfiles.
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.admin_has_any_section('{profiles}'))
  );

-- Imagenes de producto en Storage.
drop policy if exists "Admins can upload product images" on storage.objects;
create policy "Admins can upload product images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.admin_has_any_section('{products}')));

drop policy if exists "Admins can update product images" on storage.objects;
create policy "Admins can update product images"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (select public.admin_has_any_section('{products}')));

drop policy if exists "Admins can delete product images" on storage.objects;
create policy "Admins can delete product images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (select public.admin_has_any_section('{products}')));

-- ------------------------------------------------------------
-- Verificacion
-- ------------------------------------------------------------
-- Si queda alguna funcion admin con el guard viejo, sale en el NOTICE.
-- No es un error: significa que esa funcion quedo con el
-- comportamiento anterior (solo administradores), que es restrictivo.
-- Si eso es lo que ves, la funcion se puede ajustar a mano.

do $$
declare
  r record;
  conteo integer := 0;
  nombres text := '';
begin
  for r in
    select p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'admin_dashboard_metrics','admin_get_products','admin_create_product',
        'admin_update_product','admin_delete_product','admin_update_variant_cost',
        'admin_update_variant_stock','admin_product_profitability',
        'admin_save_pending_order','admin_update_order_transaction',
        'admin_delete_pending_order','admin_record_credit_payment',
        'admin_check_credit_limit','admin_set_credit_block','admin_set_credit_terms',
        'admin_update_customer','admin_set_profile_role','admin_pay_recurring_expense',
        'admin_delete_credit_payment','admin_update_credit_payment',
        'register_stock_movement'
      )
  loop
    if r.proname in ('admin_set_profile_role', 'admin_set_section_permission') then
      continue;
    end if;
    if exists (
      select 1 from pg_proc p2
      join pg_namespace n2 on n2.oid = p2.pronamespace
      where n2.nspname = 'public' and p2.proname = r.proname
        and p2.prosrc like '%is_admin()%'
    ) then
      conteo := conteo + 1;
      nombres := nombres || r.proname || ' ';
    end if;
  end loop;

  if conteo = 0 then
    raise notice 'Todas las funciones admin exigen la seccion que corresponde.';
  else
    raise notice 'ATENCION: % funciones siguen preguntando solo por el rol: %', conteo, nombres;
  end if;
end;
$$;
