-- ============================================================
-- Bitacora de eventos de Zernio, para deduplicar entregas.
--
-- Por que una tabla y no una columna en `crm_messages`:
-- un mismo mensaje produce varios eventos (received, delivered, read, failed)
-- y cada uno tiene su propio `payload.id`. Guardarlos en una columna del
-- mensaje no alcanza: ademas de que cada mensaje tendria que ir reescribiendo
-- su evento, `message.read` tendria que marcar el mismo id que ya uso
-- `message.received` y se perderia uno de los dos.
--
-- Con esta tabla la deduplicacion es uniforme para todo tipo de evento:
-- se inserta el `event_id` primero y, si choca con el indice unico, el evento
-- ya se proceso y se responde 200 sin volver a hacer nada.
--
-- Zernio reintenta hasta 7 veces con backoff, asi que esto no es teorico.
-- ============================================================

begin;

create table if not exists public.crm_zernio_events (
  -- El id del evento (`payload.id`, repetido en X-Zernio-Event-Id).
  event_id text primary key,
  event text not null,
  status text not null default 'received'
    check (status in ('received', 'processed', 'ignored', 'failed')),
  reason text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

-- Para revisar que llego algo y que se proceso.
create index if not exists crm_zernio_events_received_idx
  on public.crm_zernio_events (received_at desc);

alter table public.crm_zernio_events enable row level security;

-- Solo el service role (el webhook) escribe aca. Los operadores del CRM no la
-- necesitan: el estado real de un mensaje esta en `crm_messages`.
revoke all on public.crm_zernio_events from public, anon;
grant select, insert, update on public.crm_zernio_events to service_role;

commit;