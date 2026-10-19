-- ------------------------------------------------------------
-- Permisos por seccion del panel de administracion
-- ------------------------------------------------------------
-- El rol dice QUE PUEDE entrar al panel: admin o asesor. Esta tabla
-- dice QUE PUEDE VER una vez dentro.
--
-- Son dos cosas separadas a proposito. Con el rol solo, un asesor
-- entra al panel y ve Cartera, Gastos y Reportes, que es exactamente
-- lo que uno no quiere. Con las dos capas, el dueño decide seccion por
-- seccion.
--
-- REGLA: una seccion es visible si y solo si existe una fila con
-- allowed = true para ese usuario. Sin filas, no ve NADA. Un asesor
-- nuevo no ve nada hasta que se le asigna, y un administrador tambien
-- se puede restringir.
--
-- Nota: la lista de secciones de abajo tiene que coincidir con el
-- array `sections` de src/App.tsx. Si agregas una seccion alla, agregala
-- tambien aqui, o esa seccion no se podra repartir. Es el mismo error
-- de "la funcion existe en el codigo pero no en la base", aplicado a
-- una tabla.

-- ------------------------------------------------------------
-- Catálogo de secciones
-- ------------------------------------------------------------

create table if not exists public.admin_sections (
  id text primary key,
  title text not null,
  sort_order integer not null default 0
);

comment on table public.admin_sections is
  'Secciones del panel de administracion. Debe coincidir con el array sections de src/App.tsx.';

insert into public.admin_sections (id, title, sort_order) values
  ('overview', 'Dashboard', 1),
  ('products', 'Productos', 2),
  ('promotions', 'Promociones', 3),
  ('transactions', 'Pedidos', 4),
  ('collect', 'Cobrar', 5),
  ('credit', 'Cartera', 6),
  ('customers', 'Clientes', 7),
  ('crm', 'CRM', 8),
  ('expenses', 'Gastos', 9),
  ('advisors', 'Asesores', 10),
  ('reports', 'Reportes', 11),
  ('profiles', 'Perfiles', 12),
  ('settings', 'Configuración', 13)
on conflict (id) do update
  set title = excluded.title, sort_order = excluded.sort_order;

-- ------------------------------------------------------------
-- Permisos
-- ------------------------------------------------------------

create table if not exists public.admin_section_permissions (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  section_id text not null references public.admin_sections(id) on delete cascade,
  allowed boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (profile_id, section_id)
);

comment on table public.admin_section_permissions is
  'Secciones que puede ver cada usuario en el panel. Sin filas, no ve ninguna.';

create index if not exists admin_section_permissions_profile_idx
  on public.admin_section_permissions (profile_id);

-- ------------------------------------------------------------
-- Predicados
-- ------------------------------------------------------------

-- Secciones que ve el usuario actual.
create or replace function public.admin_allowed_sections()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select p.section_id
  from public.admin_section_permissions p
  where p.profile_id = (select auth.uid())
    and p.allowed;
$$;

-- El usuario actual puede ver esta seccion?
create or replace function public.admin_can_access(target_section text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_section_permissions p
    where p.profile_id = (select auth.uid())
      and p.section_id = target_section
      and p.allowed
  );
$$;

-- El usuario actual ve TODO el panel? Quien puede verlo todo puede
-- repartir permisos. Es la unica forma de garantizar que alguien pueda
-- recuperar el acceso si se deja a alguien sin nada.
--
-- El "todo" se calcula contra el catalogo de secciones, no contra una
-- lista escrita a mano: asi agregar una seccion no rompe el chequeo.
create or replace function public.admin_has_all_sections()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.admin_sections s
    where not exists (
      select 1
      from public.admin_section_permissions p
      where p.profile_id = (select auth.uid())
        and p.section_id = s.id
        and p.allowed
    )
  );
$$;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

alter table public.admin_sections enable row level security;
alter table public.admin_section_permissions enable row level security;

-- Cualquiera con rol admin o asesor puede LEER el catalogo y los
-- permisos: el panel necesita saber que puede ver cada persona para
-- pintar las casillas.
drop policy if exists "admin_sections_select" on public.admin_sections;
create policy "admin_sections_select"
  on public.admin_sections
  for select
  to authenticated
  using (public.is_admin() or public.is_asesor());

drop policy if exists "admin_section_permissions_select" on public.admin_section_permissions;
create policy "admin_section_permissions_select"
  on public.admin_section_permissions
  for select
  to authenticated
  using (public.is_admin() or public.is_asesor());

-- Escribir pasa por la funcion, no por la politica: asi las reglas
-- (no editarte a ti mismo, solo quien ve todo reparte) quedan en un
-- solo sitio y no se pueden esquivar escribiendo en la tabla.

-- ------------------------------------------------------------
-- RPC
-- ------------------------------------------------------------

create or replace function public.admin_set_section_permission(
  target_profile_id uuid,
  target_section text,
  new_allowed boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.admin_has_all_sections() then
    raise exception 'Only a full-access administrator can manage permissions'
      using errcode = '42501';
  end if;

  if target_profile_id = (select auth.uid()) then
    raise exception 'You cannot change your own permissions';
  end if;

  if not exists (select 1 from public.profiles where id = target_profile_id) then
    raise exception 'Profile not found';
  end if;

  if not exists (select 1 from public.admin_sections where id = target_section) then
    raise exception 'Unknown admin section';
  end if;

  insert into public.admin_section_permissions (profile_id, section_id, allowed)
  values (target_profile_id, target_section, new_allowed)
  on conflict (profile_id, section_id)
  do update set allowed = excluded.allowed, updated_at = now();
end;
$$;

revoke all on function public.admin_set_section_permission(uuid, text, boolean) from public, anon;
grant execute on function public.admin_set_section_permission(uuid, text, boolean) to authenticated;

grant select on public.admin_sections to authenticated;
grant select on public.admin_section_permissions to authenticated;

-- ------------------------------------------------------------
-- La cuenta del propietario
-- ------------------------------------------------------------
-- El dueno de la tienda entra con todas las secciones y es el unico que
-- puede repartir permisos. Los demas quedan sin filas: no ven nada del
-- panel hasta que se les asigne seccion por seccion.

-- El perfil se crea si la cuenta existe en auth.users pero todavia no
-- tiene fila en profiles.
insert into public.profiles (id, role, email)
select u.id, 'admin', u.email
from auth.users u
where lower(u.email) = lower('esaadc19@gmail.com')
on conflict (id) do update
  set role = 'admin',
      email = excluded.email;

-- Se le da acceso a todas las secciones. El cruce con auth.users deja
-- el correo como fuente, porque en cuentas viejas la columna
-- profiles.email puede estar vacia aunque el correo de la cuenta si
-- exista. La lista de secciones se lee del catalogo, asi que no hay
-- ninguna lista escrita a mano que se pueda quedar vieja.
insert into public.admin_section_permissions (profile_id, section_id, allowed)
select p.id, s.id, true
from public.profiles p
join auth.users u on u.id = p.id
cross join public.admin_sections s
where lower(u.email) = lower('esaadc19@gmail.com')
on conflict (profile_id, section_id)
do update set allowed = true, updated_at = now();

-- ------------------------------------------------------------
-- Resumen de lo que quedo
-- ------------------------------------------------------------

do $$
declare
  owner_email text := 'esaadc19@gmail.com';
  owner_id uuid;
  owner_sections integer;
begin
  select p.id into owner_id
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(u.email) = lower(owner_email);

  if owner_id is null then
    raise notice 'ATENCION: la cuenta % no existe todavia. Registrala en la tienda y vuelve a correr esta migracion.', owner_email;
    return;
  end if;

  select count(*) into owner_sections
  from public.admin_section_permissions
  where profile_id = owner_id and allowed;

  raise notice 'Propietario %: rol admin, % de % secciones con acceso.', owner_email, owner_sections, (select count(*) from public.admin_sections);
  raise notice 'Los demas administradores y asesores quedan SIN acceso: asignales secciones desde Configuracion > Permisos.';
end;
$$;
