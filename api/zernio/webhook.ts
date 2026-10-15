import { createClient } from "@supabase/supabase-js";
import {
  SUBSCRIBED_EVENTS,
  ZERNIO_EVENT,
  phoneFromSender,
  toProvider,
  verifySignature,
} from "../_lib/zernio";
import type { ZernioEvent } from "../_lib/zernio";

/**
 * Webhook entrante de Zernio.
 *
 * Reglas que impone Zernio y que este handler respeta:
 *  - Contestar 2xx en menos de 5 segundos o reintenta (hasta 7 veces).
 *  - La entrega es "al menos una vez": hay que ser idempotente.
 *  - La firma se valida sobre el cuerpo CRUDO, antes de parsear.
 *
 * Modo observacion: mientras `ZERNIO_OBSERVE` no valga "0", el endpoint
 * verifica la firma, anota el evento y devuelve 200 SIN escribir en las tablas
 * del CRM. Sirve para confirmar la forma real del payload (sobre todo que
 * trae `sender.id` en WhatsApp) antes de arriesgar la bandeja a duplicados.
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
  if (!url || !key) {
    throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Zernio entrega "incoming" / "outgoing"; la tabla usa "in" / "out". */
function toDirection(direction: string | undefined): "in" | "out" {
  return direction === "outgoing" || direction === "out" ? "out" : "in";
}

/** Estado de entrega segun el evento, para `crm_messages.delivery_status`. */
function toDeliveryStatus(eventName: string): "delivered" | "read" | "failed" | null {
  switch (eventName) {
    case ZERNIO_EVENT.MESSAGE_DELIVERED:
      return "delivered";
    case ZERNIO_EVENT.MESSAGE_READ:
      return "read";
    case ZERNIO_EVENT.MESSAGE_FAILED:
      return "failed";
    default:
      return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();

  // 1. Firma, sobre el cuerpo crudo, antes de parsear nada.
  const check = verifySignature(
    rawBody,
    request.headers.get("x-zernio-signature"),
    process.env.ZERNIO_WEBHOOK_SECRET,
  );
  if (!check.ok) {
    // No se responde 5xx a propósito: un 400 corta la cadena de reintentos de
    // una firma invalida que no se va a arreglar sola.
    console.warn("[zernio] rechazado:", check.reason);
    return json(400, { ok: false, error: check.reason });
  }

  let event: ZernioEvent;
  try {
    event = JSON.parse(rawBody) as ZernioEvent;
  } catch {
    return json(400, { ok: false, error: "JSON invalido" });
  }

  const eventName = event.event ?? "desconocido";
  const observe = process.env.ZERNIO_OBSERVE !== "0";

  // `webhook.test` llega siempre, este subscribed o no: es la prueba de vida.
  if (eventName === "webhook.test") {
    console.log("[zernio] webhook.test recibido, endpoint vivo");
    return json(200, { ok: true, observed: true, mode: observe ? "observacion" : "persistencia" });
  }

  if (!SUBSCRIBED_EVENTS.includes(eventName as never)) {
    return json(200, { ok: true, ignored: eventName });
  }

  const provider = toProvider(event.account?.platform ?? event.message?.platform);

  if (observe) {
    // Volcado crudo al log: con esto se ve la forma real del payload sin
    // escribir nada en la bandeja.
    console.log(
      "[zernio] OBSERVACION",
      JSON.stringify({
        eventId: event.id,
        event: eventName,
        platform: event.account?.platform ?? event.message?.platform,
        accountId: event.account?.accountId,
        profileId: event.account?.profileId,
        profiles: event.profiles,
        conversationId: event.message?.conversationId ?? event.conversation?.id,
        direction: event.message?.direction,
        sender: event.message?.sender,
        phoneFromSender: phoneFromSender(event.message?.sender),
        status: event.message?.status,
        text: event.message?.text,
        supported: provider !== null,
      })
    );
    return json(200, { ok: true, observed: true });
  }

  // ---------------------------------------------------------------
  // Modo persistencia
  // ---------------------------------------------------------------
  const eventId = event.id;
  if (!eventId) return json(200, { ok: true, ignored: "sin event id" });
  if (!provider) return json(200, { ok: true, ignored: `plataforma no soportada` });

  let supabase: ReturnType<typeof admin>;
  try {
    supabase = admin();
  } catch (err) {
    console.error("[zernio]", err instanceof Error ? err.message : err);
    // 5xx para que Zernio reintente: esto si se puede arreglar solo.
    return json(500, { ok: false, error: "configuracion del servidor incompleta" });
  }

  // 2. Deduplicacion: si el evento ya se vio, se responde 200 y se sale.
  const { error: dupError } = await supabase
    .from("crm_zernio_events")
    .insert({ event_id: eventId, event: eventName, status: "received" });
  if (dupError) {
    console.log("[zernio] evento duplicado, ignorado:", eventId);
    return json(200, { ok: true, duplicate: true });
  }

  const markDone = (status: "processed" | "ignored" | "failed", reason?: string) =>
    supabase
      .from("crm_zernio_events")
      .update({ status, reason: reason ?? null, processed_at: new Date().toISOString() })
      .eq("event_id", eventId);

  try {
    const accountId = event.account?.accountId ?? event.account?.id ?? null;

    // 3. Canal: se crea solo la primera vez que se ve esa cuenta.
    let channelId: string | null = null;
    if (accountId) {
      const { data: existing } = await supabase
        .from("crm_channels")
        .select("id")
        .eq("zernio_channel_id", accountId)
        .maybeSingle();
      channelId = existing?.id ?? null;
      if (!channelId) {
        const { data: created, error: channelError } = await supabase
          .from("crm_channels")
          .insert({
            provider,
            zernio_channel_id: accountId,
            zernio_profile_id: event.account?.profileId ?? null,
            label: event.account?.platform ?? provider,
          })
          .select("id")
          .single();
        if (channelError) throw channelError;
        channelId = created.id;
      }
    }

    const zernioConversationId = event.message?.conversationId ?? event.conversation?.id ?? null;
    const deliveryStatus = toDeliveryStatus(eventName);

    // 4. Los eventos de estado no crean mensajes: actualizan el que ya existe.
    if (deliveryStatus) {
      const zernioMessageId = event.message?.id ?? null;
      if (!zernioMessageId) {
        await markDone("ignored", "evento de estado sin message.id");
        return json(200, { ok: true, ignored: "sin message id" });
      }
      const { error: updateError } = await supabase
        .from("crm_messages")
        .update({ delivery_status: deliveryStatus })
        .eq("zernio_message_id", zernioMessageId);
      if (updateError) throw updateError;
      await markDone("processed");
      return json(200, { ok: true, updated: deliveryStatus });
    }

    if (eventName === ZERNIO_EVENT.CONVERSATION_STARTED) {
      await markDone("ignored", "la conversacion se crea con el primer mensaje");
      return json(200, { ok: true, ignored: "conversation.started" });
    }

    if (eventName !== ZERNIO_EVENT.MESSAGE_RECEIVED && eventName !== ZERNIO_EVENT.MESSAGE_SENT) {
      await markDone("ignored", "evento sin manejo");
      return json(200, { ok: true, ignored: eventName });
    }

    // 5. Contacto. Solo los entrantes crean contacto: un saliente llega a una
    // conversacion que ya existe y no trae un teléfono del remitente util.
    let contactId: string | null = null;
    if (eventName === ZERNIO_EVENT.MESSAGE_RECEIVED) {
      const phone = phoneFromSender(event.message?.sender);
      if (phone) {
        const { data: existing } = await supabase
          .from("crm_contacts")
          .select("id")
          .eq("phone_e164", phone)
          .maybeSingle();
        contactId = existing?.id ?? null;
        if (!contactId) {
          const { data: created, error: contactError } = await supabase
            .from("crm_contacts")
            .insert({
              phone_e164: phone,
              full_name: event.message?.sender?.name ?? null,
              instagram_handle: event.message?.sender?.username ?? null,
            })
            .select("id")
            .single();
          if (contactError) throw contactError;
          contactId = created.id;
        }
      }
    }

    if (!contactId) {
      // Sin contacto no hay donde colgar el mensaje. Es el caso normal de un
      // saliente de una conversacion que todavia no conocemos.
      const { data: fallback } = await supabase
        .from("crm_conversations")
        .select("contact_id")
        .eq("zernio_conversation_id", zernioConversationId ?? "")
        .maybeSingle();
      contactId = fallback?.contact_id ?? null;
    }

    if (!contactId) {
      await markDone("ignored", "sin contacto ni conversacion previa");
      return json(200, { ok: true, ignored: "sin contacto" });
    }

    // 6. Conversacion: se resuelve por el id de Zernio y, si no hay, por
    // contacto + canal, que es la pareja unica de la tabla.
    let conversationId: string | null = null;
    if (zernioConversationId) {
      const { data: existing } = await supabase
        .from("crm_conversations")
        .select("id")
        .eq("zernio_conversation_id", zernioConversationId)
        .maybeSingle();
      conversationId = existing?.id ?? null;
    }
    if (!conversationId) {
      const { data: existing } = await supabase
        .from("crm_conversations")
        .select("id")
        .eq("contact_id", contactId)
        .eq("channel_id", channelId ?? null)
        .is("zernio_conversation_id", null)
        .maybeSingle();
      conversationId = existing?.id ?? null;
    }
    if (!conversationId) {
      const { data: created, error: conversationError } = await supabase
        .from("crm_conversations")
        .insert({
          contact_id: contactId,
          channel_id: channelId,
          zernio_conversation_id: zernioConversationId,
          zernio_profile_id: event.account?.profileId ?? null,
          last_message_at: event.timestamp ?? new Date().toISOString(),
        })
        .select("id")
        .single();
      if (conversationError) throw conversationError;
      conversationId = created.id;
    }

    // 7. Mensaje.
    const { error: messageError } = await supabase.from("crm_messages").insert({
      conversation_id: conversationId,
      direction: toDirection(event.message?.direction),
      sender_type: "webhook",
      body: event.message?.text ?? null,
      zernio_message_id: event.message?.id ?? null,
      zernio_event_id: eventId,
      zernio_conversation_id: zernioConversationId,
      delivery_status: eventName === ZERNIO_EVENT.MESSAGE_SENT ? "sent" : "delivered",
      sent_at: event.timestamp ?? new Date().toISOString(),
    });
    if (messageError) throw messageError;

    await supabase
      .from("crm_conversations")
      .update({ last_message_at: event.timestamp ?? new Date().toISOString() })
      .eq("id", conversationId);

    await markDone("processed");
    return json(200, { ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error desconocido";
    console.error("[zernio] fallo procesando", eventId, message);
    // thenable, no promesa: sin await no se puede encadenar `.catch`.
    await markDone("failed", message).then(
      () => undefined,
      () => undefined,
    );
    // 5xx: Zernio reintenta, que es lo que queremos si fue un fallo puntual.
    return json(500, { ok: false, error: message });
  }
}
