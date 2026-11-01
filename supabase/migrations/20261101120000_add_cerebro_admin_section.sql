-- Agregar seccion 'cerebro' al catalogo de admin_sections
insert into public.admin_sections (id, title, sort_order)
values ('cerebro', 'Cerebro', 2)
on conflict (id) do update
  set title = excluded.title, sort_order = excluded.sort_order;

-- Otorgar permiso de 'cerebro' a todos los administradores (incluyendo el propietario)
insert into public.admin_section_permissions (profile_id, section_id, allowed)
select p.id, 'cerebro', true
from public.profiles p
where p.role = 'admin'
on conflict (profile_id, section_id)
do update set allowed = true, updated_at = now();
