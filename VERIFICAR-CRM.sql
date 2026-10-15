-- Verificación de la Fase 2 del CRM.
-- Correlo en el SQL Editor de Supabase (o con psql). Debe devolver todo en OK.
-- No modifica nada.

select '1. Tablas del CRM' as check_name;
select tablename
from pg_tables
where schemaname = 'public' and tablename like 'crm\_%'
order by tablename;

select '2. RLS activo en las 9 tablas' as check_name;
select c.relname as tabla, c.relrowsecurity as rls_activo,
       (c.relrowsecurity and c.relforcerowsecurity) as rls_forzado
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname like 'crm\_%'
order by c.relname;

select '3. Politicas por tabla' as check_name;
select tablename, count(*)::text as politicas
from pg_policies
where schemaname = 'public' and tablename like 'crm\_%'
group by tablename order by tablename;

select '4. Rol 'asesor' ya permitido' as check_name;
select conname, pg_get_constraintdef(oid) as definicion
from pg_constraint
where conrelid = 'public.profiles'::regclass
  and pg_get_constraintdef(oid) ilike '%asesor%';

select '5. Funciones de rol' as check_name;
select proname from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('is_asesor', 'crm_is_staff', 'crm_touch_updated_at')
order by proname;

select '6. Etapas por defecto' as check_name;
select position, name, is_won, is_active from public.crm_pipeline_stages
order by position;

select '7. Ajustes de la IA (una sola fila)' as check_name;
select id, enabled from public.crm_ai_settings;

select '8. Ningun cliente ve el CRM' as check_name;
-- Debe salir vacio: sin rol admin/asesor no hay policy que deje leer.
select policyname, tablename from pg_policies
where schemaname = 'public' and tablename like 'crm\_%'
  and qual is null and with_check is null;