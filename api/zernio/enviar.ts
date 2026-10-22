import { createClient } from "@supabase/supabase-js";

/**
 * Envío de mensajes salientes por Zernio.
 *
 * Contrato verificado contra docs.zernio.com:
 *
 *   POST {base}/v1/inbox/conversations/{conversationId}/messages
 *   Authorization: Bearer <api key>
 *   Idempotency-Key: <uuid>      (una por respuesta; evita el doble envío)
 *   Body: { "accountId": "...", "message": "..." }
 *
 * La base es `https://zernio.com/api`: `api.zernio.com` no existe, y el
 * endpoint lleva el `conversationId` en la ruta, no en el cuerpo.
 *
 * Quién puede llamar: solo una cuenta con sesión de Supabase válida y rol
 * **admin**. Los asesores no envían mensajes desde el CRM mientras el acceso
 * al CRM sea de administradores solamente (Fase 2 podrá abrirlo). La API key
 * nunca sale del servidor, y el navegador se autentica con su propio token
 * de sesión, que es lo que tiene.
 */

export const config = { runtime: "nodejs" };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** Base documentada. Se puede sobreescribir con ZERNIO_BASE_URL. */
const ZERNIO_BASE = process.env.ZERNIO_BASE_URL ?? "https://zernio.com/api";

function admin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Valida el token de sesión del navegador.
 *
 * Se usa la anon key para resolver el usuario: el service role saltaría la
 * comprobación y aceptaría cualquier JWT. Después se mira el rol en
 * `profiles`, que es la misma regla que aplica la RLS.
 */
async function authenticate(request: Request): Promise<{ ok: true; userId: string } | { ok: false; reason: string }> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return { ok: false, reason: "Falta el token de sesion." };

  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  const url = process.env.SUPABASE_URL;
  if (!anon || !url) return { ok: false, reason: "El servidor no tiene la anon key para validar la sesion." };

  const token = header.slice("Bearer ".length);
  const { data, error } = await createClient(url, anon, { auth: { persistSession: false } }).auth.getUser(token);
  if (error || !data.user) return { ok: false, reason: "La sesion no es valida." };

  const { data: profile } = await admin()
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") {
    return { ok: false, reason: "Tu cuenta no tiene acceso al CRM." };
  }
  return { ok: true, userId: data.user.id };
}

type SendBody = {
  conversationId?: string;
  text?: string;
};

export async function POST(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if (!auth.ok) return json(401, { ok: false, error: auth.reason });

  const apiKey = process.env.ZERNIO_API_KEY;
  if (!apiKey) return json(500, { ok: false, error: "falta ZERNIO_API_KEY" });

  let body: SendBody;
  try {
    body = JSON.parse(await request.text()) as SendBody;
  } catch {
    return json(400, { ok: false, error: "JSON invalido" });
  }

  const text = body.text?.trim();
  if (!text) return json(400, { ok: false, error: "el mensaje va vacio" });
  if (!body.conversationId) return json(400, { ok: false, error: "falta la conversacion" });

  let supabase: ReturnType<typeof admin>;
  let conversationId: string | null = null;
  let zernioConversationId: string | null = null;
  let accountId: string | null = null;

  try {
    supabase = admin();
    const { data: conv, error } = await supabase
      .from("crm_conversations")
      .select("id, zernio_conversation_id, channel:crm_channels (id, zernio_channel_id)")
      .eq("id", body.conversationId)
      .maybeSingle();
    if (error) throw error;
    if (!conv) return json(404, { ok: false, error: "conversacion no encontrada" });

    const channelRow = Array.isArray(conv.channel) ? conv.channel[0] : conv.channel;
    const channel = (channelRow ?? null) as { id: string; zernio_channel_id: string } | null;

    conversationId = conv.id;
    zernioConversationId = conv.zernio_conversation_id;
    accountId = channel?.zernio_channel_id ?? null;
  } catch (err) {
    return json(500, { ok: false, error: err instanceof Error ? err.message : "error desconocido" });
  }

  if (!zernioConversationId) {
    return json(400, {
      ok: false,
      error: "esa conversacion todavia no tiene hilo en Zernio: llego un mensaje de esa persona primero",
    });
  }
  if (!accountId) {
    return json(400, { ok: false, error: "no se sabe a que cuenta de Zernio pertenece la conversacion" });
  }

  // 1. Se registra primero, en `sending`. Si Zernio falla, la bandeja muestra
  //    el fallo en vez de perder el mensaje en silencio.
  // 2. El id de esa fila sirve como Idempotency-Key: si el usuario reintenta
  //    el mismo envio, Zernio devuelve el 200 original en vez de mandar el
  //    mensaje dos veces.
  const { data: inserted, error: insertError } = await supabase!
    .from("crm_messages")
    .insert({
      conversation_id: conversationId,
      direction: "out",
      sender_type: "human",
      body: text,
      delivery_status: "sending",
    })
    .select("id")
    .single();
  if (insertError) return json(500, { ok: false, error: insertError.message });

  try {
    const response = await fetch(
      `${ZERNIO_BASE}/v1/inbox/conversations/${encodeURIComponent(zernioConversationId)}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "Idempotency-Key": inserted.id,
        },
        body: JSON.stringify({ accountId, message: text }),
      },
    );

    const raw = await response.text();

    if (!response.ok) {
      await supabase!
        .from("crm_messages")
        .update({ delivery_status: "failed" })
        .eq("id", inserted.id);
      // Se devuelve el cuerpo de Zernio porque dice el motivo real
      // (PLATFORM_LIMITATION, plantilla, ventana de 24h...) y sin eso el
      // error es un "502" mudo.
      return json(502, { ok: false, error: `Zernio respondio ${response.status}`, detail: raw });
    }

    let zernioMessageId: string | null = null;
    try {
      const parsed = JSON.parse(raw) as {
        data?: { _id?: string; id?: string; messageId?: string };
        _id?: string;
        id?: string;
      };
      zernioMessageId = parsed.data?.messageId ?? parsed.data?._id ?? parsed.data?.id ?? parsed._id ?? parsed.id ?? null;
    } catch {
      // Respuesta sin JSON: se acepta igual; el id llega con el evento.
    }

    await supabase!
      .from("crm_messages")
      .update({
        delivery_status: "sent",
        ...(zernioMessageId ? { zernio_message_id: zernioMessageId } : {}),
      })
      .eq("id", inserted.id);

    return json(200, { ok: true, messageId: inserted.id, zernioMessageId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error desconocido";
    await supabase!
      .from("crm_messages")
      .update({ delivery_status: "failed" })
      .eq("id", inserted.id);
    return json(502, { ok: false, error: message });
  }
}