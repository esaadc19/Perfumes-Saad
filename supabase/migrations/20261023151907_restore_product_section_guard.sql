-- ------------------------------------------------------------
-- Restaurar el control de permisos en las RPC de productos
-- ------------------------------------------------------------
-- La migracion del SKU volvio a crear admin_create_product y
-- admin_update_product desde schema.sql, donde el guard todavia es
-- "is_admin". Eso dejaba esas dos funciones sin el control por seccion.
-- Este bloque devuelve el guard de la seccion Productos sin reescribir
-- las funciones a mano.

do $$
declare
  r record;
  nueva text;
begin
  for r in
    select p.oid, p.proname, pg_get_functiondef(p.oid) as definicion
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('admin_create_product', 'admin_update_product')
  loop
    if r.definicion like '%admin_require_section(%' then
      continue;
    end if;

    nueva := regexp_replace(
      r.definicion,
      'if not public\.is_admin\(\) then.*?end if;',
      'perform public.admin_require_section(''products'');',
      'g'
    );

    if nueva is not distinct from r.definicion then
      raise exception 'No se pudo restaurar el guard de la seccion en %', r.proname;
    end if;

    execute nueva;
  end loop;
end;
$$;

revoke all on function public.admin_create_product(jsonb, jsonb) from public, anon;
revoke all on function public.admin_update_product(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.admin_create_product(jsonb, jsonb) to authenticated;
grant execute on function public.admin_update_product(uuid, jsonb, jsonb) to authenticated;
