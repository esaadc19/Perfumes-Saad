-- Prueba de aislamiento del CRM.
--
-- Regla vigente (desde 2026-10-22): el CRM es SOLO del administrador.
-- Un asesor no ve ni una fila de las tablas del CRM.
--
-- Comprueba dos cosas con sesion real simulada: que el dueno ve todo y
-- que el asesor no ve nada.

create or replace function public.prueba_crm(usuario uuid, etiqueta text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deals bigint;
  v_ajenos bigint;
  v_contactos bigint;
  v_admin boolean;
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', usuario::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  select count(*) into v_deals from public.crm_deals;
  select count(*) into v_ajenos from public.crm_deals
    where owner_id <> usuario;
  select count(*) into v_contactos from public.crm_contacts;
  select (select public.is_admin()) into v_admin;

  reset role;
  raise notice '% | deals que ve=% | deals ajenos=% | contactos=% | es_admin=%',
    etiqueta, v_deals, v_ajenos, v_contactos, v_admin;
end;
$$;

do $$
begin
  perform public.prueba_crm('fe940285-0468-476b-bc26-23686a4c4ac7', 'DUENO ');
  perform public.prueba_crm('2a5e2cb5-1156-41f5-ae56-53b64c909a87', 'ASESOR');
end;
$$;

drop function if exists public.prueba_crm(uuid, text);
