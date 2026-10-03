create or replace function public.sales_report_by_date_range(start_date date, end_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  range_start timestamptz := start_date::timestamp at time zone 'America/Bogota';
  range_end timestamptz := (end_date + 1)::timestamp at time zone 'America/Bogota';
  range_sales numeric;
  range_orders integer;
  range_items integer;
  range_expenses numeric;
  best_product text;
  best_product_quantity integer;
begin
  if start_date is null or end_date is null or start_date > end_date then
    raise exception 'A valid report date range is required';
  end if;
  if end_date > (now() at time zone 'America/Bogota')::date then
    raise exception 'Report date range cannot include future dates';
  end if;

  select coalesce(sum(total), 0), count(*),
         coalesce(sum((select sum(oi.quantity) from public.order_items oi where oi.order_id = o.id)), 0)
  into range_sales, range_orders, range_items
  from public.orders o
  where o.payment_status = 'paid'
    and o.paid_at >= range_start
    and o.paid_at < range_end;

  select oi.product_name_snapshot, sum(oi.quantity)
  into best_product, best_product_quantity
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.payment_status = 'paid'
    and o.paid_at >= range_start
    and o.paid_at < range_end
  group by oi.product_name_snapshot
  order by sum(oi.quantity) desc, oi.product_name_snapshot
  limit 1;

  select coalesce(sum(amount), 0)
  into range_expenses
  from public.expenses
  where expense_date between start_date and end_date;

  return jsonb_build_object(
    'start_date', start_date,
    'end_date', end_date,
    'sales', range_sales,
    'orders', range_orders,
    'items_sold', range_items,
    'expenses', range_expenses,
    'best_product', jsonb_build_object(
      'name', coalesce(best_product, 'N/A'),
      'quantity', coalesce(best_product_quantity, 0)
    )
  );
end;
$$;

revoke all on function public.sales_report_by_date_range(date, date) from public, anon, authenticated;
grant execute on function public.sales_report_by_date_range(date, date) to service_role;