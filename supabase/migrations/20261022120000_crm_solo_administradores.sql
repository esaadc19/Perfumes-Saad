-- ============================================================
-- El CRM es de administradores.
--
-- Hasta ahora `crm_is_staff()` dejaba entrar a admin y asesor
-- porque la Fase 2 les iba a armar su propio espacio. Hasta que
-- eso pase, un asesor no lee ni escribe nada del CRM: la puerta
-- (la app), el servidor (api/zernio/enviar) y los datos tienen
-- que decir lo mismo. Un permiso que se respeta en un lado y se
-- ignora en el otro no es un permiso.
--
-- El webhook de Zernio no se toca: escribe con `service_role`,
-- que salta la RLS.
--
-- Cuando los asesores vuelvan al CRM, basta con restaurar:
--
--   select public.is_admin() or public.is_asesor();
--
-- ============================================================

begin;

create or replace function public.crm_is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin();
$$;

comment on function public.crm_is_staff() is
  'Puede tocar tablas del CRM. Hoy solo el administrador; los asesores vuelven con la Fase 2.';

commit;
