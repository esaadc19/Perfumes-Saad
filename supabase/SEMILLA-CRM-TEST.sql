-- Datos de prueba del CRM para poder ver la bandeja y la ficha funcionando.
-- Correlo en el SQL Editor de Supabase.
-- Todo lleva prefijo `test_` en el nombre para reconocerlo de un vistazo, y al
-- final esta el bloque que los borra.
-- No toca datos reales: solo crea filas nuevas que puedes eliminar.

-- ---------------------------------------------------------------
-- 0. Empezar limpio
-- El nombre del contacto no es una clave unica, asi que `on conflict do
-- nothing` no impediria duplicados al correr esto dos veces. Se borra primero
-- lo anterior; las conversaciones, mensajes, deals y tareas se van por cascada.
-- ---------------------------------------------------------------
delete from public.crm_contacts where full_name like 'test\_%';

-- ---------------------------------------------------------------
-- 1. Contactos
-- ---------------------------------------------------------------
insert into public.crm_contacts (full_name, phone_e164, email, notes)
values
  ('test_ Maria Gomez',   '573001110001', 'test_maria@example.com',  'Pregunta mucho por el Jean Paul Gaultier.'),
  ('test_ Carlos Ramirez','573001110002', null,                      'Pidio un disfraz de hombre.'),
  ('test_ Ana Torres',    '573001110003', null,                      'Escribio por Instagram.'),
  ('test_ Luis Palacio',  '573001110004', null,                      null);

-- ---------------------------------------------------------------
-- 2. Conversaciones y mensajes
-- ---------------------------------------------------------------
insert into public.crm_conversations (contact_id, status, ai_enabled, last_message_at)
select c.id, v.status, v.ai_enabled, v.last_message_at
from (values
  ('test_ Maria Gomez',    'open',    true,  now() - interval '2 minutes'),
  ('test_ Carlos Ramirez', 'open',    true,  now() - interval '3 hours'),
  ('test_ Ana Torres',     'pending', false, now() - interval '1 day'),
  ('test_ Luis Palacio',   'closed',  true,  now() - interval '6 days')
) as v(full_name, status, ai_enabled, last_message_at)
join public.crm_contacts c on c.full_name = v.full_name;

insert into public.crm_messages (conversation_id, direction, sender_type, body, delivery_status, sent_at)
select cv.id, v.direction, v.sender_type, v.body, v.delivery_status, v.sent_at
from (values
  ('test_ Maria Gomez', 'in', 'human', 'Hola, tienen el Jean Paul Gaultier?', 'delivered', now() - interval '5 minutes'),
  ('test_ Maria Gomez', 'out','human', 'Hola! Si, lo tenemos. De que tamano lo buscas?', 'read', now() - interval '4 minutes'),
  ('test_ Maria Gomez', 'in', 'human', 'El de 100ml, y cuanto sale con descuento?', 'delivered', now() - interval '2 minutes'),

  ('test_ Carlos Ramirez','in','human','Buenas, Are there Disney Cologne for man?', 'delivered', now() - interval '3 hours'),

  ('test_ Ana Torres',  'in', 'human', 'Vi el azul ese en Instagram, sigue disponible?', 'delivered', now() - interval '1 day'),
  ('test_ Ana Torres',  'out','ai',   'Hola Ana, si sigue disponible. Te confirmo el precio?', 'read', now() - interval '23 hours'),

  ('test_ Luis Palacio','in','human','Gracias, ya lo recibi.', 'read', now() - interval '6 days'),
  ('test_ Luis Palacio','out','human','Gracias a ti por comprar. Que te guste!', 'read', now() - interval '6 days')
) as v(full_name, direction, sender_type, body, delivery_status, sent_at)
join public.crm_contacts c on c.full_name = v.full_name
join public.crm_conversations cv on cv.contact_id = c.id;

-- ---------------------------------------------------------------
-- 3. Deals en el pipeline
-- ---------------------------------------------------------------
insert into public.crm_deals (contact_id, stage_id, title, value, created_at)
select c.id, s.id, v.title, v.value, now() - (v.days || ' days')::interval
from (values
  ('test_ Maria Gomez',    'Interesado',     'test_ Jean Paul Gaultier 100ml', 385000, 2),
  ('test_ Carlos Ramirez', 'Cotizado',       'test_ Disney Cologne 3 pack',     210000, 3),
  ('test_ Ana Torres',      'Nuevo',          'test_ Aromaz azul',                 145000, 1),
  ('test_ Luis Palacio',   'Entregado',      'test_ Pedido entregado',           null,   8)
) as v(full_name, stage, title, value, days)
join public.crm_contacts c on c.full_name = v.full_name
join public.crm_pipeline_stages s on s.name = v.stage;

-- ---------------------------------------------------------------
-- 4. Tareas pendientes
-- ---------------------------------------------------------------
insert into public.crm_tasks (contact_id, kind, title, due_at)
select c.id, v.kind, v.title, now() + (v.hours || ' hours')::interval
from (values
  ('test_ Maria Gomez',    'cobrar',   'test_ Confirmar si el precio le convence', 3),
  ('test_ Carlos Ramirez', 'recordar', 'test_ Volver a escribir por el Disney',   20)
) as v(full_name, kind, title, hours)
join public.crm_contacts c on c.full_name = v.full_name;

-- ===============================================================
-- LIMPIEZA: corre este bloque cuando ya no necesites los datos.
-- Los deals y las tareas se van por cascada al borrar el contacto.
-- ===============================================================
-- delete from public.crm_contacts where full_name like 'test\_%';

-- ===============================================================
-- Para comprobar que la RLS hace su trabajo, asigna los deals de
-- prueba al asesor con su id de auth.users:
--   update public.crm_deals set owner_id = '<uuid del asesor>'
--   where contact_id in (
--     select id from public.crm_contacts where full_name like 'test\_%'
--   );
-- Con esa sesion abierta, el asesor no deberia ver los deals de otro.
-- ===============================================================