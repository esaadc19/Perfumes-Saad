-- Prueba de escritura del CRM.
--
-- Regla vigente (desde 2026-10-22): el CRM es SOLO del administrador.
-- Un asesor no escribe ni lo que es suyo: no escribe nada.
--
-- Lo que debe salir:
--   DUENO  | tocar deal ajeno: sin cambios (correcto) | crear deal propio: PERMITIDO (correcto)
--   ASESOR | tocar deal ajeno: sin cambios (correcto) | crear deal propio: RECHAZO (correcto)

create or replace function public.prueba_escritura_crm(usuario uuid, etiqueta text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ajeno text;
  v_propio text;
  v_tocados integer := 0;
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', usuario::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  -- Mover un deal que NO es suyo
  begin
    update public.crm_deals
    set title = 'MODIFICADO'
    where owner_id <> usuario;
    get diagnostics v_tocados = row_count;
    if v_tocados = 0 then
      v_ajeno := 'sin cambios (correcto)';
    else
      v_ajeno := 'MODIFICO ' || v_tocados || ' (mal)';
    end if;
  exception when others then
    v_ajeno := 'RECHAZO: ' || sqlerrm;
  end;

  -- Crear un deal propio. El dueno si debe poder; el asesor no, hasta que
  -- la Fase 2 le abra su espacio en el CRM.
  begin
    insert into public.crm_deals (id, contact_id, stage_id, owner_id, title, value)
    values (
      gen_random_uuid(),
      'aaaaaaaa-0000-0000-0000-000000000001',
      'c96be395-719b-4254-bed1-bf85dfadefde',
      usuario,
      'Deal nuevo del asesor', 10000
    );
    v_propio := 'PERMITIO (correcto)';
  exception when others then
    v_propio := 'RECHAZO: ' || sqlerrm;
  end;

  reset role;
  raise notice '% | tocar deal ajeno: % | crear deal propio: %', etiqueta, v_ajeno, v_propio;
end;
$$;

do $$
begin
  perform public.prueba_escritura_crm('fe940285-0468-476b-bc26-23686a4c4ac7', 'DUENO ');
  perform public.prueba_escritura_crm('2a5e2cb5-1156-41f5-ae56-53b64c909a87', 'ASESOR');
end;
$$;

-- Si el titulo quedo como 'MODIFICADO', se toco un deal ajeno: nunca deberia salir filas.
select title, count(*) as veces
from public.crm_deals
where title = 'MODIFICADO'
group by title;

-- Y estos 'Deal nuevo del asesor' tampoco deberian existir: el asesor no crea nada.
select owner_id, count(*) as veces
from public.crm_deals
where title = 'Deal nuevo del asesor'
group by owner_id;

drop function if exists public.prueba_escritura_crm(uuid, text);
