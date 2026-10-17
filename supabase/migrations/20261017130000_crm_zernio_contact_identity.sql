-- ============================================================
-- Identidad de contacto de Zernio.
--
-- Sale de observar un mensaje real de Instagram (2026-10-17):
--
--   sender.id        = "1152905440512086"  -> id de usuario de Instagram
--   sender.username  = "eliassaadc"
--   sender.contactId = "6ad3da3b06890d0565eaa78f"
--   sender.phone     = no viene
--
-- O sea que en Instagram NO hay telefono. `phoneFromSender` devolvia null y
-- el mensaje se descartaba en silencio. La identidad util es el
-- `contactId` de Zernio, que es estable, con el `username` como respaldo.
--
-- En WhatsApp si llega el numero, y ahi `phone_e164` sigue siendo la llave.
-- Por eso el contacto necesita las dos rutas.
-- ============================================================

begin;

alter table public.crm_contacts
  add column if not exists zernio_contact_id text;

-- Es la llave mas estable que da Zernio: no cambia aunque la persona se
-- renombre o se cambie el usuario. Unico para no duplicar.
create unique index if not exists crm_contacts_zernio_contact_id_idx
  on public.crm_contacts (zernio_contact_id) where zernio_contact_id is not null;

-- Respaldo para cuando llega el username pero no el contactId.
create index if not exists crm_contacts_instagram_lookup_idx
  on public.crm_contacts (lower(instagram_handle));

commit;