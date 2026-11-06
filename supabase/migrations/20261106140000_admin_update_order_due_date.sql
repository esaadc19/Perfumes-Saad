-- Permite a un administrador actualizar directamente la fecha de vencimiento (credit_due_date) de un pedido a crédito
create or replace function public.admin_update_order_due_date(
  target_order_id uuid,
  new_due_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_require_any_section('{credit,transactions,collect}');

  update public.orders
  set credit_due_date = new_due_date
  where id = target_order_id;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;
end;
$$;

revoke all on function public.admin_update_order_due_date(uuid, date) from public, anon;
grant execute on function public.admin_update_order_due_date(uuid, date) to authenticated;
