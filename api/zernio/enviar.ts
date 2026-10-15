import { createClient } from "@supabase/supabase-js";
import { verifySignature } from "../_lib/zernio";

/**
 * Envio de mensajes salientes por Zernio.
 *
 * La UI llama a esta ruta en vez de escribir directo: la API key y la service
 * role viven solo en el servidor y nunca llegan al navegador.
 *
 * No se acepta llamada suelta desde la web: la peticion tiene que venir firmada
 * por el servidor del CRM con `ZERNIO_API_KEY`, igual que un webhook. Asi
 * nadie puede mandar mensajes en nombre de la perfumeria desde el navegador.
 */

export const config = { runtime: "nodejs" };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function admin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, key, { auth: { persistSession: false } });
}

type SendBody = {
  conversationId?: string;
  text?: string;
  zernioConversationId?: string;
  accountId?: string;
};

export async function POST(request: Request): Promise<Response> {
  // Firma interna: el navegador manda el secreto de la API en una cabecera y
  // se compara su HMAC con el cuerpo. Sin esto, cualquiera podria enviar
  // WhatsApps desde la pagina.
  const raw = await request.text();
  const check = verifySignature(
    raw,
    request.headers.get("x-crm-signature"),
    process.env.ZERNIO_API_KEY,
  );
  if (!check.ok) return json(401, { ok: false, error: check.reason });

  const apiKey = process.env.ZERNIO_API_KEY;
  if (!apiKey) return json(500, { ok: false, error: "falta ZERNIO_API_KEY" });

  let body: SendBody;
  try {
    body = JSON.parse(raw) as SendBody;
  } catch {
    return json(400, { ok: false, error: "JSON invalido" });
  }

  const text = body.text?.trim();
  if (!text) return json(400, { ok: false, error: "el mensaje va vacio" });
  if (!body.zernioConversationId && !body.conversationId) {
    return json(400, { ok: false, error: "falta la conversacion" });
  }

  let supabase: ReturnType<typeof admin>;
  let conversationId = body.conversationId ?? null;
  let zernioConversationId = body.zernioConversationId ?? null;
  let accountId = body.accountId ?? null;
  let channelId: string | null = null;

  try {
    supabase = admin();

    if (conversationId) {
      const { data: conv, error } = await supabase
        .from("crm_conversations")
        .select("id, zernio_conversation_id, channel:crm_channels (id, zernio_channel_id)")
        .eq("id", conversationId)
        .maybeSingle();
      if (error) throw error;
      if (!conv) return json(404, { ok: false, error: "conversacion no encontrada" });

      // PostgREST puede devolver el embed a-uno como objeto o como arreglo
      // segun como se infiera la relacion; se toma el primero de los dos.
      const channelRow = Array.isArray(conv.channel) ? conv.channel[0] : conv.channel;
      const channel = (channelRow ?? null) as { id: string; zernio_channel_id: string } | null;
      zernioConversationId = zernioConversationId ?? conv.zernio_conversation_id;
      channelId = channel?.id ?? null;
      accountId = accountId ?? channel?.zernio_channel_id ?? null;
    }

    // Sin conversacion de Zernio no hay por donde responder: todavia no
    // llego ningun mensaje de esa persona.
    if (!zernioConversationId) {
      return json(400, {
        ok: false,
        error: "esa conversacion todavia no tiene hilo en Zernio: llego un mensaje de esa persona primero",
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "error desconocido";
    return json(500, { ok: false, error: message });
  }

  // 1. Se registra primero, en estado `sending`. Si Zernio falla, la bandeja
  //    muestra el fallo en vez de perder el mensaje en silencio.
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

  // 2. Llamada a Zernio. La ruta exacta de envio se confirma contra la
  //    documentacion antes de salir de modo observacion: aqui se centraliza
  //    en un unico lugar para no dispersar el contrato.
  const ZERNIO_BASE = process.env.ZERNIO_BASE_URL ?? "https://api.zernio.com";
  const sendPath = process.env.ZERNIO_SEND_PATH ?? "/v1/inbox/messages";

  try {
    const upstream = await fetch(`${ZERNIO_BASE}${sendPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        conversationId: zernioConversationId,
        ...(accountId ? { accountId } : {}),
        text,
      }),
    });

    const raw = await upstream.text();
    if (!upstream.ok) {
      await supabase!
        .from("crm_messages")
        .update({ delivery_status: "failed" })
        .eq("id", inserted.id);
      return json(502, { ok: false, error: `Zernio respondio ${upstream.status}`, detail: raw });
    }

    let zernioMessageId: string | null = null;
    try {
      const parsed = JSON.parse(raw) as { data?: { _id?: string; id?: string }; _id?: string; id?: string };
      zernioMessageId = parsed.data?._id ?? parsed.data?.id ?? parsed._id ?? parsed.id ?? null;
    } catch {
      // respuesta sin JSON: se acepta igual, el id llega despues con el evento
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
