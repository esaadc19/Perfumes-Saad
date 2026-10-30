-- ============================================================
-- Migration: Payment Reconciliation & Channel Tracking
-- Version: 20261029150000
-- ============================================================

-- 1. Añadir columnas a la tabla orders para canal de pago y conciliación
alter table public.orders
  add column if not exists payment_method text not null default 'efectivo',
  add column if not exists reconciled boolean not null default false,
  add column if not exists reconciled_at timestamptz,
  add column if not exists transaction_reference text;

-- Validar métodos de pago permitidos en orders
alter table public.orders
  drop constraint if exists orders_payment_method_check;

alter table public.orders
  add constraint orders_payment_method_check
  check (payment_method in ('efectivo', 'nequi_daviplata', 'bancolombia', 'datafono', 'transferencia', 'otro'));

-- 2. Añadir columnas a customer_credit_payments (Abonos)
alter table public.customer_credit_payments
  add column if not exists reconciled boolean not null default false,
  add column if not exists reconciled_at timestamptz,
  add column if not exists transaction_reference text;

-- Actualizar restricción de método en abonos
alter table public.customer_credit_payments
  drop constraint if exists customer_credit_payments_method_check;

alter table public.customer_credit_payments
  add constraint customer_credit_payments_method_check
  check (method in ('efectivo', 'nequi_daviplata', 'bancolombia', 'datafono', 'transferencia', 'otro'));

-- 3. Añadir canal de pago a gastos
alter table public.expenses
  add column if not exists payment_method text not null default 'efectivo';

alter table public.recurring_expenses
  add column if not exists payment_method text not null default 'efectivo';

-- 4. Tabla de Cierres / Historial de Conciliaciones
create table if not exists public.payment_reconciliations (
  id uuid primary key default gen_random_uuid(),
  period_from date,
  period_to date,
  total_expected numeric(12, 2) not null default 0,
  total_actual numeric(12, 2) not null default 0,
  total_difference numeric(12, 2) not null default 0,
  balances_json jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.payment_reconciliations enable row level security;

drop policy if exists "Admins can view reconciliations" on public.payment_reconciliations;
create policy "Admins can view reconciliations"
  on public.payment_reconciliations for select
  using (public.is_admin() or exists (
    select 1 from public.admin_section_permissions
    where profile_id = auth.uid() and section_id = 'overview' and allowed = true
  ));

drop policy if exists "Admins can insert reconciliations" on public.payment_reconciliations;
create policy "Admins can insert reconciliations"
  on public.payment_reconciliations for insert
  with check (public.is_admin() or exists (
    select 1 from public.admin_section_permissions
    where profile_id = auth.uid() and section_id = 'overview' and allowed = true
  ));

-- 5. RPC para conciliar o cambiar medio de pago de una transacción individual
create or replace function public.admin_toggle_payment_reconciliation(
  target_type text,
  target_id uuid,
  new_reconciled boolean,
  new_method text default null,
  new_reference text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_admin() or exists (
    select 1 from public.admin_section_permissions
    where profile_id = auth.uid() and section_id = 'overview' and allowed = true
  )) then
    raise exception 'Access denied' using errcode = '42501';
  end if;

  if target_type = 'order' then
    update public.orders
    set reconciled = new_reconciled,
        reconciled_at = case when new_reconciled then coalesce(reconciled_at, now()) else null end,
        payment_method = coalesce(new_method, payment_method),
        transaction_reference = coalesce(new_reference, transaction_reference)
    where id = target_id;
  elsif target_type = 'credit_payment' then
    update public.customer_credit_payments
    set reconciled = new_reconciled,
        reconciled_at = case when new_reconciled then coalesce(reconciled_at, now()) else null end,
        method = coalesce(new_method, method),
        transaction_reference = coalesce(new_reference, transaction_reference)
    where id = target_id;
  else
    raise exception 'Invalid target_type: must be order or credit_payment';
  end if;
end;
$$;

revoke all on function public.admin_toggle_payment_reconciliation(text, uuid, boolean, text, text) from public, anon;
grant execute on function public.admin_toggle_payment_reconciliation(text, uuid, boolean, text, text) to authenticated;

-- 6. RPC para conciliar en lote (usada por el cruce de Nequi)
create or replace function public.admin_batch_reconcile_payments(
  matches jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  item_type text;
  item_id uuid;
  item_method text;
  item_ref text;
  updated_count integer := 0;
begin
  if not (public.is_admin() or exists (
    select 1 from public.admin_section_permissions
    where profile_id = auth.uid() and section_id = 'overview' and allowed = true
  )) then
    raise exception 'Access denied' using errcode = '42501';
  end if;

  if jsonb_typeof(matches) is distinct from 'array' then
    raise exception 'Matches must be an array';
  end if;

  for item in select * from jsonb_array_elements(matches)
  loop
    item_type := item->>'type';
    item_id := (item->>'id')::uuid;
    item_method := coalesce(item->>'method', 'nequi_daviplata');
    item_ref := item->>'reference';

    if item_type = 'order' then
      update public.orders
      set reconciled = true,
          reconciled_at = now(),
          payment_method = item_method,
          transaction_reference = coalesce(item_ref, transaction_reference)
      where id = item_id;
      updated_count := updated_count + 1;
    elsif item_type = 'credit_payment' then
      update public.customer_credit_payments
      set reconciled = true,
          reconciled_at = now(),
          method = item_method,
          transaction_reference = coalesce(item_ref, transaction_reference)
      where id = item_id;
      updated_count := updated_count + 1;
    end if;
  end loop;

  return updated_count;
end;
$$;

revoke all on function public.admin_batch_reconcile_payments(jsonb) from public, anon;
grant execute on function public.admin_batch_reconcile_payments(jsonb) to authenticated;
