import { requireSupabase } from "../lib/supabase";

/**
 * Acceso a las tablas `crm_*` desde el navegador.
 *
 * Todo pasa por la anon key y la sesion del usuario: la seguridad la pone RLS,
 * no este codigo. Por eso no hay que filtrar por `assigned_to` a mano — un
 * asesor ya solo recibe sus filas. Si alguna vez hace falta, es una senal de
 * que la politica quedo mal.
 */

export type ConversationStatus = "open" | "pending" | "closed";

export type Channel = {
  id: string;
  provider: "whatsapp" | "instagram" | "messenger";
  label: string | null;
};

export type Contact = {
  id: string;
  full_name: string | null;
  phone_e164: string | null;
  instagram_handle: string | null;
  email: string | null;
  customer_id: string | null;
  notes: string | null;
  created_at: string;
};

export type Conversation = {
  id: string;
  status: ConversationStatus;
  ai_enabled: boolean;
  assigned_to: string | null;
  last_message_at: string | null;
  created_at: string;
  /** Si esta llena, el hilo existe en Zernio y se puede responder de verdad. */
  zernio_conversation_id: string | null;
  contact: Pick<Contact, "id" | "full_name" | "phone_e164"> | null;
  channel: Pick<Channel, "provider" | "label"> | null;
  last_body: string | null;
  last_direction: "in" | "out" | null;
  last_sender_type: "human" | "ai" | "webhook" | null;
};

export type Message = {
  id: string;
  direction: "in" | "out";
  sender_type: "human" | "ai" | "webhook";
  body: string | null;
  delivery_status: "sending" | "sent" | "delivered" | "read" | "failed";
  sent_at: string;
};

export type Deal = {
  id: string;
  title: string | null;
  value: number | null;
  created_at: string;
  stage: { id: string; name: string; color: string } | null;
};

export type Task = {
  id: string;
  kind: "llamar" | "recordar" | "cobrar" | "otro";
  title: string;
  due_at: string;
  done: boolean;
};

const CONTACT_COLS = "id, full_name, phone_e164, instagram_handle, email, customer_id, notes, created_at";

/**
 * PostgREST devuelve los embeds a-uno como objeto, pero el cliente los tipa
 * como arreglo cuando no hay tipos generados de la base. Normalizar en un solo
 * sitio evita castear a mano en cada consulta y que reviente si la relacion
 * cambia.
 */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value ?? null;
}

/**
 * La consulta del listado usa un embed anidado para traer el ultimo mensaje
 * (`crm_messages(*)` ordenado y limitado) en vez de una segunda ida por
 * contacto: son N+1 consultas que en la bandeja se notan.
 */
export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await requireSupabase()
    .from("crm_conversations")
    .select(
      `id, status, ai_enabled, assigned_to, last_message_at, created_at, zernio_conversation_id,
       contact:crm_contacts (id, full_name, phone_e164),
       channel:crm_channels (provider, label),
       messages:crm_messages (body, direction, sender_type, sent_at)`
    )
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;

  return (data ?? []).map((row) => {
    const messages = (row.messages ?? []) as {
      body: string | null;
      direction: "in" | "out";
      sender_type: "human" | "ai" | "webhook";
      sent_at: string;
    }[];
    const last = messages[0];
    return {
      id: row.id,
      status: row.status,
      ai_enabled: row.ai_enabled,
      assigned_to: row.assigned_to,
      last_message_at: row.last_message_at,
      created_at: row.created_at,
      zernio_conversation_id: row.zernio_conversation_id ?? null,
      contact: one<NonNullable<Conversation["contact"]>>(row.contact as never),
      channel: one<NonNullable<Conversation["channel"]>>(row.channel as never),
      last_body: last?.body ?? null,
      last_direction: last?.direction ?? null,
      last_sender_type: last?.sender_type ?? null,
    };
  });
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await requireSupabase()
    .from("crm_messages")
    .select("id, direction, sender_type, body, delivery_status, sent_at")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Message[];
}

export async function listContacts(): Promise<Contact[]> {
  const { data, error } = await requireSupabase()
    .from("crm_contacts")
    .select(CONTACT_COLS)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as Contact[];
}

export async function getContactDeals(contactId: string): Promise<Deal[]> {
  const { data, error } = await requireSupabase()
    .from("crm_deals")
    // Hay dos FK de `crm_deals` a `crm_pipeline_stages` (la etapa actual y la
    // de cierre), asi que el embed hay que dirigirlo a una de las dos con `!`
    // o PostgREST responde PGRST201 por relacion ambigua.
    .select("id, title, value, created_at, stage:crm_pipeline_stages!crm_deals_stage_id_fkey (id, name, color)")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    stage: one<NonNullable<Deal["stage"]>>(row.stage as never),
  })) as Deal[];
}

export async function getContactTasks(contactId: string): Promise<Task[]> {
  const { data, error } = await requireSupabase()
    .from("crm_tasks")
    .select("id, kind, title, due_at, done")
    .eq("contact_id", contactId)
    .eq("done", false)
    .order("due_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Task[];
}

export async function updateContact(id: string, patch: Partial<Pick<Contact, "full_name" | "phone_e164" | "email" | "notes">>) {
  const { error } = await requireSupabase().from("crm_contacts").update(patch).eq("id", id);
  if (error) throw error;
}

export async function createContact(input: {
  full_name?: string;
  phone_e164?: string;
  email?: string;
  notes?: string;
}): Promise<Contact> {
  const { data, error } = await requireSupabase()
    .from("crm_contacts")
    .insert({
      full_name: input.full_name?.trim() || null,
      phone_e164: input.phone_e164?.trim() || null,
      email: input.email?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .select(CONTACT_COLS)
    .single();
  if (error) throw error;
  return data as Contact;
}

/**
 * Registra un mensaje escrito por una persona.
 *
 * Con `viaZernio` el insert lo hace el servidor y el mensaje sale de verdad.
 * Sin hilo de Zernio (una conversacion creada a mano, o desarrollo sin
 * serverless) el mensaje se guarda solo en `sending`.
 */
export async function sendMessage(
  conversationId: string,
  body: string,
  viaZernio = false,
): Promise<void> {
  const text = body.trim();
  if (!text) return;
  const client = requireSupabase();

  if (viaZernio) {
    const sent = await sendMessageViaZernio(conversationId, text);
    // false = no hay servidor de por medio (desarrollo). Se cae al insert local.
    if (sent) return;
  }

  const { error } = await client.from("crm_messages").insert({
    conversation_id: conversationId,
    direction: "out",
    sender_type: "human",
    body: text,
    delivery_status: "sending",
  });
  if (error) throw error;

  const { error: touchError } = await client
    .from("crm_conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);
  if (touchError) throw touchError;
}

export async function setConversationStatus(id: string, status: ConversationStatus): Promise<void> {
  const { error } = await requireSupabase().from("crm_conversations").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function setConversationAi(id: string, ai_enabled: boolean): Promise<void> {
  const { error } = await requireSupabase().from("crm_conversations").update({ ai_enabled }).eq("id", id);
  if (error) throw error;
}

export async function assignConversation(id: string, assigned_to: string | null): Promise<void> {
  const { error } = await requireSupabase().from("crm_conversations").update({ assigned_to }).eq("id", id);
  if (error) throw error;
}

/**
 * Firma la peticion a `api/zernio/enviar`.
 *
 * El navegador nunca ve `ZERNIO_API_KEY` (no lleva prefijo VITE_). Lo que hace
 * es firmar el cuerpo con esa misma clave para que el servidor pueda comprobar
 * que la llamada viene del CRM y no de cualquier pagina.
 *
 * En desarrollo el endpoint no existe, asi que se resuelve la misma URL contra
 * el servidor de Vite: por eso la funcion devuelve `null` en vez de fallar.
 */
async function signForServer(body: string): Promise<string | null> {
  const secret = (import.meta as ImportMeta & { env: { ZERNIO_API_KEY?: string } }).env
    .ZERNIO_API_KEY;
  if (!secret) return null;

  const bytes = new TextEncoder().encode(secret);
  const key = await crypto.subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Envia el mensaje de verdad por Zernio.
 *
 * Devuelve `{ ok: false }` cuando no hay servidor de por medio (desarrollo),
 * y el mensaje queda guardado en `sending` para no perder lo escrito.
 */
export async function sendMessageViaZernio(conversationId: string, text: string): Promise<boolean> {
  const body = JSON.stringify({ conversationId, text });
  const signature = await signForServer(body);

  // En desarrollo el serverless no existe: se salta el envio y el mensaje se
  // queda en la bandeja como `sending`, igual que antes de la Fase 5.
  if (signature === null && (import.meta as ImportMeta & { env: { DEV?: boolean } }).env.DEV) {
    return false;
  }

  const response = await fetch("/api/zernio/enviar", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(signature ? { "x-crm-signature": signature } : {}),
    },
    body,
  });
  if (!response.ok) throw new Error(`El envio fallo (${response.status}).`);
  return true;
}

/** Un movil colombiano necesita el 57 delante para que el enlace de WhatsApp abra. */
export function waLink(phoneE164: string | null, text?: string): string | null {
  if (!phoneE164) return null;
  const digits = phoneE164.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const base = `https://wa.me/${digits}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export function displayName(contact: { full_name: string | null; phone_e164: string | null } | null): string {
  if (!contact) return "Sin contacto";
  return contact.full_name?.trim() || contact.phone_e164 || "Sin nombre";
}