-- Prueba funcional del sistema de permisos por seccion.
-- Corre en el Postgres local de Supabase.
--
-- Simula tres cuentas con claims de sesion reales (request.jwt.claims) y
-- comprueba que cada una ve lo que debe y nada mas:
--
--   dueno      -> todas las secciones
--   advisor    -> solo Pedidos
--   asesor_cero-> ninguna seccion
--
-- Para correrlo:  docker exec -i supabase_db_Perfume_SAAD psql -U postgres -d postgres -f -

\set ON_ERROR_STOP on

-- ------------------------------------------------------------------
-- Limpieza
-- ------------------------------------------------------------------
delete from public.admin_section_permissions;
delete from public.profiles where id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333'
);

-- profiles.id apunta a auth.users.id, asi que hay que crear las cuentas
-- de autenticacion primero.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                       raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'dueno@correo.com',
   crypt('prueba', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'advisor@correo.com',
   crypt('prueba', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'cero@correo.com',
   crypt('prueba', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

-- ------------------------------------------------------------------
-- Las tres cuentas
-- ------------------------------------------------------------------
-- El trigger on_auth_user_created ya creo la fila en profiles al insertar
-- en auth.users. Aqui solo se ajusta el rol y los datos.
insert into public.profiles (id, role, full_name, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin',  'Dueno',      'dueno@correo.com'),
  ('22222222-2222-2222-2222-222222222222', 'asesor', 'Advisor',    'advisor@correo.com'),
  ('33333333-3333-3333-3333-333333333333', 'admin',  'AsesorCero', 'cero@correo.com')
on conflict (id) do update
  set role = excluded.role,
      full_name = excluded.full_name,
      email = excluded.email;

-- El dueno tiene todas.
insert into public.admin_section_permissions (profile_id, section_id, allowed)
select '11111111-1111-1111-1111-111111111111', id, true
from public.admin_sections;

-- El advisor solo Pedidos.
insert into public.admin_section_permissions (profile_id, section_id, allowed)
values ('22222222-2222-2222-2222-222222222222', 'transactions', true);

-- AsesorCero no tiene ninguna fila: no ve nada.

-- ------------------------------------------------------------------
-- Datos de prueba
-- ------------------------------------------------------------------
-- Sin filas, "cuenta 0" no dice nada: hay que poner datos para que la
-- RLS se note. Si la cuenta sin permiso ve 0 gastos y la con permiso
-- ve 1, la restriction funciona.
insert into public.customers (id, full_name, phone)
values ('99999999-9999-9999-9999-999999999999', 'Cliente de prueba', '3000000000')
on conflict (id) do nothing;

insert into public.orders (id, customer_id, status, payment_status, total)
values ('99999999-0000-0000-0000-000000000001', '99999999-9999-9999-9999-999999999999',
        'confirmed', 'paid', 100000)
on conflict (id) do nothing;

insert into public.expenses (id, name, amount, category, expense_date)
values ('99999999-0000-0000-0000-000000000002', 'Gasto de prueba', 50000, 'general', current_date)
on conflict (id) do nothing;

-- ------------------------------------------------------------------
-- Sesiones simuladas
-- ------------------------------------------------------------------
create or replace function public.prueba_como(
  usuario uuid,
  etiqueta text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ordenes bigint;
  v_gastos bigint;
  v_secciones text;
  v_error text;
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', usuario::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  begin
    select count(*) into v_ordenes from public.orders;
  exception when others then
    v_ordenes := -1;
  end;

  begin
    select count(*) into v_gastos from public.expenses;
  exception when others then
    v_gastos := -1;
  end;

  begin
    -- La funcion devuelve setof text: su columna de salida se llama como
    -- la funcion, no "section_id". Por eso el alias.
    select string_agg(seccion, ',' order by seccion) into v_secciones
    from public.admin_allowed_sections() as seccion;
  exception when others then
    v_secciones := 'ERROR: ' || sqlerrm;
  end;

  reset role;

  raise notice '% | ordenes=% | gastos=% | secciones=%',
    etiqueta, v_ordenes, v_gastos, coalesce(v_secciones, '(ninguna)');
end;
$$;

-- ------------------------------------------------------------------
-- Las pruebas
-- ------------------------------------------------------------------
do $$
begin
  perform public.prueba_como('11111111-1111-1111-1111-111111111111', 'DUENO    ');
  perform public.prueba_como('22222222-2222-2222-2222-222222222222', 'ADVISOR  ');
  perform public.prueba_como('33333333-3333-3333-3333-333333333333', 'ASESOR 0 ');
end;
$$;

-- ------------------------------------------------------------------
-- Las funciones admin deben rechazar segun la seccion
-- ------------------------------------------------------------------
create or replace function public.prueba_rpc(
  usuario uuid,
  fn text,
  args text,
  etiqueta text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_error text;
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', usuario::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  begin
    execute format('select public.%s(%s)', fn, args);
    v_error := 'PERMITIO (correcto)';
  exception when others then
    v_error := 'RECHAZO: ' || sqlerrm;
  end;

  reset role;
  raise notice '% -> %', etiqueta, v_error;
end;
$$;

do $$
begin
  -- El advisor NO puede leer el dashboard (seccion overview).
  perform public.prueba_rpc(
    '22222222-2222-2222-2222-222222222222',
    'admin_dashboard_metrics', '', 'advisor -> admin_dashboard_metrics');

  -- El advisor NO puede tocar la Cartera.
  perform public.prueba_rpc(
    '22222222-2222-2222-2222-222222222222',
    'admin_get_products', '', 'advisor -> admin_get_products');

  -- El dueno SI puede.
  perform public.prueba_rpc(
    '11111111-1111-1111-1111-111111111111',
    'admin_dashboard_metrics', '', 'dueno   -> admin_dashboard_metrics');

  -- El dueno SI puede leer productos.
  perform public.prueba_rpc(
    '11111111-1111-1111-1111-111111111111',
    'admin_get_products', '', 'dueno   -> admin_get_products');

  -- Una cuenta sin secciones no puede.
  perform public.prueba_rpc(
    '33333333-3333-3333-3333-333333333333',
    'admin_dashboard_metrics', '', 'cero    -> admin_dashboard_metrics');
end;
$$;

-- ------------------------------------------------------------------
-- Repartir permisos
-- ------------------------------------------------------------------
-- El dueno puede darle una seccion al advisor. Y el advisor NO puede
-- repartirlas, porque no ve todas. Y nadie puede cambiarse las suyas.
create or replace function public.prueba_reparto(
  usuario uuid,
  objetivo uuid,
  seccion text,
  permitida boolean,
  etiqueta text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_error text;
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', usuario::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  begin
    perform public.admin_set_section_permission(objetivo, seccion, permitida);
    v_error := 'PERMITIO (correcto)';
  exception when others then
    v_error := 'RECHAZO: ' || sqlerrm;
  end;

  reset role;
  raise notice '% -> %', etiqueta, v_error;
end;
$$;

do $$
begin
  -- El dueno le da Gastos al advisor.
  perform public.prueba_reparto(
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222', 'expenses', true,
    'dueno le da gastos al advisor');

  -- El advisor, que solo ve Pedidos, NO puede repartir permisos.
  perform public.prueba_reparto(
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333', 'transactions', true,
    'advisor intenta repartir');

  -- Nadie puede cambiarse los suyos: el dueno tampoco.
  perform public.prueba_reparto(
    '11111111-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111111', 'overview', false,
    'dueno intenta quitarse una seccion a si mismo');
end;
$$;

drop function if exists public.prueba_reparto(uuid, uuid, text, boolean, text);

-- ------------------------------------------------------------------
-- Limpieza final
-- ------------------------------------------------------------------
drop function if exists public.prueba_como(uuid, text);
drop function if exists public.prueba_rpc(uuid, text, text, text);
delete from public.admin_section_permissions;
delete from public.expenses where id = '99999999-0000-0000-0000-000000000002';
delete from public.orders where id = '99999999-0000-0000-0000-000000000001';
delete from public.customers where id = '99999999-9999-9999-9999-999999999999';
delete from auth.users where id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333'
);
