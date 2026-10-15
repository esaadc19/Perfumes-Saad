-- ============================================================
-- CRM de Perfumes SAAD — tablas, roles y RLS
--
-- El CRM es una app aparte (carpeta `crm/`, servida en /crm) pero comparte
-- este mismo proyecto de Supabase y las mismas cuentas de Auth que la tienda.
--
-- Decisiones:
--  - No se modifica ninguna tabla existente de la tienda. Solo se agrega el
--    valor 'asesor' al rol de `profiles`, que hoy solo admite customer/admin.
--  - Los deals y las conversaciones son del asesor que los tiene asignados.
--    Los contactos son compartidos: con dos personas, duplicarlos seria peor
--    que verlos los dos.
--  - Una etapa con deals no se borra nunca, se desactiva (is_active = false).
--    `crm_deals.staged_at_stage_id` conserva la etapa al momento de cerrar, de
--    modo que renombrar o desactivar una etapa no rompe la historia.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Roles
-- ------------------------------------------------------------

-- El CHECK de `profiles.role` venia solo con customer/admin y tiene nombre
-- automatico `profiles_role_check`. El DO protege contra el caso de que el
-- nombre no sea ese: si el CHECK no existiera, el `add constraint` de abajo
-- crearia un segundo CHECK y podriamos dejar dos reglas de rol contradictorias.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  ) then
    alter table public.profiles drop constraint profiles_role_check;
  end if;
end;
$$;

alter table public.profiles
  add constraint profiles_role_check check (role in ('customer', 'admin', 'asesor'));

-- admin_set_profile_role rechazaba 'asesor'; hay que abrirlo para que el
-- dueño pueda convertir una cuenta en asesor desde Perfiles.
create or replace function public.admin_set_profile_role(
  target_profile_id uuid,
  new_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if new_role is null or new_role not in ('customer', 'admin', 'asesor') then
    raise exception 'Invalid profile role';
  end if;
  if target_profile_id = (select auth.uid()) then
    raise exception 'You cannot change your own administrator role';
  end if;
  if new_role = 'customer'
     and exists (
      select 1 from public.profiles
      where id = target_profile_id and role in ('admin', 'asesor')
    )
     and (select count(*) from public.profiles where role in ('admin', 'asesor')) <= 1 then
    raise exception 'At least one administrator must remain';
  end if;

  update public.profiles set role = new_role where id = target_profile_id;
  if not found then
    raise exception 'Profile not found';
  end if;
end;
$$;

revoke all on function public.admin_set_profile_role(uuid, text) from public, anon;
grant execute on function public.admin_set_profile_role(uuid, text) to authenticated;

-- Predicados de rol usados por todas las politicas de abajo.
create or replace function public.is_asesor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'asesor'
  );
$$;

-- Cualquiera de los dos que trabaja en el CRM.
create or replace function public.crm_is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or public.is_asesor();
$$;

revoke all on function public.is_asesor() from public, anon;
revoke all on function public.crm_is_staff() from public, anon;
grant execute on function public.is_asesor() to authenticated;
grant execute on function public.crm_is_staff() to authenticated;

-- ------------------------------------------------------------
-- Etapas del pipeline (editables desde Configuracion)
-- ------------------------------------------------------------

create table if not exists public.crm_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 60),
  position integer not null default 0,
  color text not null default '#00BCD4',
  is_won boolean not null default false,
  is_lost boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Solo puede haber una etapa ganada y una perdida: el tablero y los KPIs
  -- dependen de que sea un unico punto de verdad.
  constraint crm_pipeline_stages_single_won check (not is_won or is_active),
  constraint crm_pipeline_stages_single_lost check (not is_lost or is_active)
);

create unique index if not exists crm_pipeline_stages_won_idx
  on public.crm_pipeline_stages (is_won) where is_won;
create unique index if not exists crm_pipeline_stages_lost_idx
  on public.crm_pipeline_stages (is_lost) where is_lost;
create index if not exists crm_pipeline_stages_position_idx
  on public.crm_pipeline_stages (position) where is_active;

-- Etapas por defecto. Editables: se renombran, reordenan o desactivan desde la
-- pantalla de Configuracion sin tocar el codigo.
insert into public.crm_pipeline_stages (name, position, is_won)
values
  ('Nuevo', 1, false),
  ('Respondido', 2, false),
  ('Interesado', 3, false),
  ('Cotizado', 4, false),
  ('Pedido creado', 5, false),
  ('Entregado', 6, true)
on conflict do nothing;

-- ------------------------------------------------------------
-- Contactos
-- ------------------------------------------------------------

create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  -- Con codigo de pais: un movil colombiano necesita el 57 delante para que
  -- el enlace de WhatsApp abra.
  phone_e164 text,
  instagram_handle text,
  email text,
  -- Enlace opcional con la tabla `customers` de la tienda. Vive ahi el
  -- historial de pedidos y el fiado, aqui el historial de conversaciones.
  customer_id uuid references public.customers(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_contacts_has_identity check (
    coalesce(nullif(btrim(full_name), ''),
             nullif(btrim(phone_e164), ''),
             nullif(btrim(email), ''),
             nullif(btrim(instagram_handle), '')) is not null
  )
);

-- Un telefono no puede aparecer dos veces: es la llave con la que se cruzan
-- WhatsApp, Instagram y el historial de la tienda.
create unique index if not exists crm_contacts_phone_e164_idx
  on public.crm_contacts (phone_e164) where phone_e164 is not null;
create unique index if not exists crm_contacts_email_idx
  on public.crm_contacts (email) where email is not null;
create unique index if not exists crm_contacts_instagram_idx
  on public.crm_contacts (instagram_handle) where instagram_handle is not null;
create index if not exists crm_contacts_customer_id_idx
  on public.crm_contacts (customer_id);

-- ------------------------------------------------------------
-- Canales conectados por Zernio
-- ------------------------------------------------------------

create table if not exists public.crm_channels (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('whatsapp', 'instagram', 'messenger')),
  zernio_channel_id text not null,
  label text,
  is_active boolean not null default true,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, zernio_channel_id)
);

-- ------------------------------------------------------------
-- Conversaciones
-- ------------------------------------------------------------

create table if not exists public.crm_conversations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  channel_id uuid references public.crm_channels(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'pending', 'closed')),
  assigned_to uuid references auth.users(id) on delete set null,
  -- Interruptor por conversacion. El global vive en crm_ai_settings.
  ai_enabled boolean not null default true,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un hilo por contacto y canal: si la persona escribe por Instagram y por
-- WhatsApp, son dos conversaciones y no se mezclan los historiales.
create unique index if not exists crm_conversations_contact_channel_idx
  on public.crm_conversations (contact_id, coalesce(channel_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists crm_conversations_status_last_message_idx
  on public.crm_conversations (status, last_message_at desc);
create index if not exists crm_conversations_assigned_to_idx
  on public.crm_conversations (assigned_to);

-- ------------------------------------------------------------
-- Mensajes
-- ------------------------------------------------------------

create table if not exists public.crm_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.crm_conversations(id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  -- Quien lo mando: la IA, una persona, o el webhook de Zernio.
  sender_type text not null default 'human' check (sender_type in ('human', 'ai', 'webhook')),
  body text,
  zernio_message_id text,
  delivery_status text not null default 'sent'
    check (delivery_status in ('sending', 'sent', 'delivered', 'read', 'failed')),
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Idempotencia del webhook: Zernio reintenta, y el mismo mensaje no puede
-- aparecer dos veces en la bandeja.
create unique index if not exists crm_messages_zernio_id_idx
  on public.crm_messages (zernio_message_id) where zernio_message_id is not null;
create index if not exists crm_messages_conversation_sent_idx
  on public.crm_messages (conversation_id, sent_at desc);

-- ------------------------------------------------------------
-- Deals (pipeline)
-- ------------------------------------------------------------

create table if not exists public.crm_deals (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  stage_id uuid references public.crm_pipeline_stages(id) on delete set null,
  -- Etapa en el momento de cerrar. Es lo que permite medir duracion y
  -- conversion aunque despues la etapa se renombre o se desactive.
  staged_at_stage_id uuid references public.crm_pipeline_stages(id) on delete set null,
  staged_at timestamptz,
  owner_id uuid references auth.users(id) on delete set null,
  title text,
  value numeric(14, 2) check (value is null or value >= 0),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_deals_stage_idx on public.crm_deals (stage_id);
create index if not exists crm_deals_owner_idx on public.crm_deals (owner_id);
create index if not exists crm_deals_contact_idx on public.crm_deals (contact_id);
-- El tablero pide "abiertos, ordenados por columna y fecha de cambio".
create index if not exists crm_deals_open_board_idx
  on public.crm_deals (stage_id, created_at desc) where closed_at is null;

-- ------------------------------------------------------------
-- Tareas de seguimiento
-- ------------------------------------------------------------

create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.crm_contacts(id) on delete cascade,
  deal_id uuid references public.crm_deals(id) on delete cascade,
  kind text not null default 'recordar' check (kind in ('llamar', 'recordar', 'cobrar', 'otro')),
  title text not null,
  notes text,
  due_at timestamptz not null,
  done boolean not null default false,
  done_at timestamptz,
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_tasks_open_due_idx
  on public.crm_tasks (due_at) where not done;
create index if not exists crm_tasks_assigned_to_idx
  on public.crm_tasks (assigned_to);

-- ------------------------------------------------------------
-- Agente de IA
-- ------------------------------------------------------------

-- Una sola fila: el interruptor global y el prompt de la marca.
create table if not exists public.crm_ai_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  tone_prompt text,
  handoff_keywords text,
  catalog_brief text,
  updated_at timestamptz not null default now()
);

insert into public.crm_ai_settings (id) values (true) on conflict do nothing;

-- Bitacora: que herramienta ejecuto la IA y que devolvio. Sin esto no se puede
-- auditar por que el bot dijo lo que dijo.
create table if not exists public.crm_ai_actions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.crm_conversations(id) on delete cascade,
  tool text not null,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  ok boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists crm_ai_actions_conversation_idx
  on public.crm_ai_actions (conversation_id, created_at desc);

-- ------------------------------------------------------------
-- updated_at
-- ------------------------------------------------------------

create or replace function public.crm_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'crm_pipeline_stages', 'crm_contacts', 'crm_channels',
    'crm_conversations', 'crm_deals', 'crm_tasks', 'crm_ai_settings'
  ]
  loop
    execute format('drop trigger if exists crm_touch_updated_at on public.%I', t);
    execute format(
      'create trigger crm_touch_updated_at before update on public.%I
         for each row execute function public.crm_touch_updated_at()',
      t
    );
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- Permisos
-- ------------------------------------------------------------

grant usage on schema public to authenticated;

grant select, insert, update, delete on
  public.crm_pipeline_stages,
  public.crm_contacts,
  public.crm_channels,
  public.crm_conversations,
  public.crm_messages,
  public.crm_deals,
  public.crm_tasks,
  public.crm_ai_settings,
  public.crm_ai_actions
to authenticated;

-- El webhook de Zernio entra por una funcion serverless con service role,
-- pero el role tambien se usa para/scripts y pruebas desde el panel.
grant select, insert, update, delete on
  public.crm_contacts,
  public.crm_channels,
  public.crm_conversations,
  public.crm_messages,
  public.crm_pipeline_stages
to service_role;

grant usage, select on all sequences in schema public to service_role;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

alter table public.crm_pipeline_stages enable row level security;
alter table public.crm_contacts enable row level security;
alter table public.crm_channels enable row level security;
alter table public.crm_conversations enable row level security;
alter table public.crm_messages enable row level security;
alter table public.crm_deals enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.crm_ai_settings enable row level security;
alter table public.crm_ai_actions enable row level security;

-- --- Etapas: lectura para cualquiera del equipo, escritura solo admin ---
drop policy if exists "CRM staff read stages" on public.crm_pipeline_stages;
create policy "CRM staff read stages"
  on public.crm_pipeline_stages for select to authenticated
  using ((select public.crm_is_staff()));

drop policy if exists "Admins manage stages" on public.crm_pipeline_stages;
create policy "Admins manage stages"
  on public.crm_pipeline_stages for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- --- Canales: solo admin ---
drop policy if exists "Admins manage channels" on public.crm_channels;
create policy "Admins manage channels"
  on public.crm_channels for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- --- Contactos: compartidos entre el equipo ---
drop policy if exists "CRM staff read contacts" on public.crm_contacts;
create policy "CRM staff read contacts"
  on public.crm_contacts for select to authenticated
  using ((select public.crm_is_staff()));

drop policy if exists "CRM staff write contacts" on public.crm_contacts;
create policy "CRM staff write contacts"
  on public.crm_contacts for insert to authenticated
  with check ((select public.crm_is_staff()));

drop policy if exists "CRM staff update contacts" on public.crm_contacts;
create policy "CRM staff update contacts"
  on public.crm_contacts for update to authenticated
  using ((select public.crm_is_staff()))
  with check ((select public.crm_is_staff()));

-- Un cliente nunca debe ver la lista de contactos del CRM.
drop policy if exists "Admins delete contacts" on public.crm_contacts;
create policy "Admins delete contacts"
  on public.crm_contacts for delete to authenticated
  using ((select public.is_admin()));

-- --- Conversaciones: el asesor solo ve las suyas ---
drop policy if exists "CRM read conversations" on public.crm_conversations;
create policy "CRM read conversations"
  on public.crm_conversations for select to authenticated
  using (
    (select public.is_admin())
    or ((select public.is_asesor()) and assigned_to = (select auth.uid()))
  );

drop policy if exists "CRM write conversations" on public.crm_conversations;
create policy "CRM write conversations"
  on public.crm_conversations for insert to authenticated
  with check (
    (select public.is_admin())
    or ((select public.is_asesor()) and assigned_to = (select auth.uid()))
  );

drop policy if exists "CRM update conversations" on public.crm_conversations;
create policy "CRM update conversations"
  on public.crm_conversations for update to authenticated
  using (
    (select public.is_admin())
    or ((select public.is_asesor()) and assigned_to = (select auth.uid()))
  )
  with check (
    (select public.is_admin())
    or ((select public.is_asesor()) and assigned_to = (select auth.uid()))
  );

-- --- Mensajes: heredan la conversacion ---
drop policy if exists "CRM read messages" on public.crm_messages;
create policy "CRM read messages"
  on public.crm_messages for select to authenticated
  using (
    exists (
      select 1 from public.crm_conversations c
      where c.id = conversation_id
        and (
          (select public.is_admin())
          or ((select public.is_asesor()) and c.assigned_to = (select auth.uid()))
        )
    )
  );

drop policy if exists "CRM write messages" on public.crm_messages;
create policy "CRM write messages"
  on public.crm_messages for insert to authenticated
  with check (
    exists (
      select 1 from public.crm_conversations c
      where c.id = conversation_id
        and (
          (select public.is_admin())
          or ((select public.is_asesor()) and c.assigned_to = (select auth.uid()))
        )
    )
  );

-- --- Deals: el asesor solo ve los suyos ---
drop policy if exists "CRM read deals" on public.crm_deals;
create policy "CRM read deals"
  on public.crm_deals for select to authenticated
  using (
    (select public.is_admin())
    or ((select public.is_asesor()) and owner_id = (select auth.uid()))
  );

drop policy if exists "CRM write deals" on public.crm_deals;
create policy "CRM write deals"
  on public.crm_deals for insert to authenticated
  with check (
    (select public.is_admin())
    or ((select public.is_asesor()) and owner_id = (select auth.uid()))
  );

drop policy if exists "CRM update deals" on public.crm_deals;
create policy "CRM update deals"
  on public.crm_deals for update to authenticated
  using (
    (select public.is_admin())
    or ((select public.is_asesor()) and owner_id = (select auth.uid()))
  )
  with check (
    (select public.is_admin())
    or ((select public.is_asesor()) and owner_id = (select auth.uid()))
  );

drop policy if exists "Admins delete deals" on public.crm_deals;
create policy "Admins delete deals"
  on public.crm_deals for delete to authenticated
  using ((select public.is_admin()));

-- --- Tareas: el asesor solo ve las suyas ---
drop policy if exists "CRM read tasks" on public.crm_tasks;
create policy "CRM read tasks"
  on public.crm_tasks for select to authenticated
  using (
    (select public.is_admin())
    or ((select public.is_asesor()) and assigned_to = (select auth.uid()))
  );

drop policy if exists "CRM write tasks" on public.crm_tasks;
create policy "CRM write tasks"
  on public.crm_tasks for insert to authenticated
  with check (
    (select public.is_admin())
    or ((select public.is_asesor()) and assigned_to = (select auth.uid()))
  );

drop policy if exists "CRM update tasks" on public.crm_tasks;
create policy "CRM update tasks"
  on public.crm_tasks for update to authenticated
  using (
    (select public.is_admin())
    or ((select public.is_asesor()) and assigned_to = (select auth.uid()))
  )
  with check (
    (select public.is_admin())
    or ((select public.is_asesor()) and assigned_to = (select auth.uid()))
  );

-- --- Ajustes y bitacora de la IA: solo admin ---
drop policy if exists "Admins manage AI settings" on public.crm_ai_settings;
create policy "Admins manage AI settings"
  on public.crm_ai_settings for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "CRM read AI actions" on public.crm_ai_actions;
create policy "CRM read AI actions"
  on public.crm_ai_actions for select to authenticated
  using (
    (select public.is_admin())
    or (
      (select public.is_asesor())
      and exists (
        select 1 from public.crm_conversations c
        where c.id = conversation_id and c.assigned_to = (select auth.uid())
      )
    )
  );

drop policy if exists "CRM write AI actions" on public.crm_ai_actions;
create policy "CRM write AI actions"
  on public.crm_ai_actions for insert to authenticated
  with check ((select public.crm_is_staff()));

commit;