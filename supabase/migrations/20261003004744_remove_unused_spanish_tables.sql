do $$
declare
  legacy_table text;
  row_count bigint;
begin
  foreach legacy_table in array array[
    'orden_items',
    'ordenes',
    'perfumes',
    'presentaciones',
    'usuarios'
  ]
  loop
    if to_regclass(format('public.%I', legacy_table)) is not null then
      execute format('lock table public.%I in access exclusive mode', legacy_table);
      execute format('select count(*) from public.%I', legacy_table) into row_count;

      if row_count > 0 then
        raise exception 'Refusing to drop public.%: it contains % rows',
          legacy_table, row_count;
      end if;
    end if;
  end loop;
end
$$;

drop table if exists
  public.orden_items,
  public.ordenes,
  public.perfumes,
  public.presentaciones,
  public.usuarios
restrict;