-- ============================================================
-- Campos de Zernio en las tablas del CRM.
--
-- `crm_messages.zernio_message_id` ya existía (creado en crm_core), pero
-- alcanza con un solo campo no nos alcanza: Zernio entrega al menos una vez y
-- un mismo mensaje genera varios eventos distintos.
--
--   message.received   -> inserta el mensaje
--   message.delivered  -> actualiza delivery_status
--   message.read       -> actualiza delivery_status
--   message.failed     -> actualiza delivery_status
--
-- El id que Zernio manda para deduplicar es el del EVENTO (`payload.id`,
-- repetido en la cabecera X-Zernio-Event-Id), no el del mensaje. Por eso va
-- su propia columna con indice unico: si metieramos `message.id` en
-- `zernio_message_id` (que ya es unico), el `message.read` chocaria con el
-- `message.received` y se perderia la confirmacion de lectura.
--
-- `zernio_conversation_id` permite mapear el hilo de Zernio con el nuestro
-- sin deducirlo por telefono, que es la parte fragil.
-- ============================================================

begin;

alter table public.crm_messages
  add column if not exists zernio_event_id text,
  add column if not exists zernio_conversation_id text;

-- Deduplicacion de entregas: Zernio reintenta hasta 7 veces y su entrega es
-- "al menos una vez", asi que este indice es lo que evita mensajes repetidos
-- en la bandeja.
create unique index if not exists crm_messages_zernio_event_id_idx
  on public.crm_messages (zernio_event_id) where zernio_event_id is not null;

-- Buscar el hilo por el id de Zernio al recibir un evento.
create index if not exists crm_messages_zernio_conversation_id_idx
  on public.crm_messages (zernio_conversation_id) where zernio_conversation_id is not null;

alter table public.crm_conversations
  add column if not exists zernio_conversation_id text,
  add column if not exists zernio_profile_id text;

-- Un hilo de Zernio por conversacion nuestra. No es unique para no romper
-- instalaciones donde el mismo id llegue por dos canales, pero si sirve para
-- el indice de busqueda.
create unique index if not exists crm_conversations_zernio_conversation_id_idx
  on public.crm_conversations (zernio_conversation_id) where zernio_conversation_id is not null;

-- En `crm_channels`, `zernio_channel_id` guarda el `accountId` de Zernio, que
-- es la unidad a la que se conecta una linea o una cuenta de Instagram.
alter table public.crm_channels
  add column if not exists zernio_profile_id text;

commit;