import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Contrato de la API de Zernio (docs.zernio.com).
 *
 * Lo unico que se asume aca es lo que dice la documentacion oficial:
 *  - `X-Zernio-Signature` es el HMAC-SHA256 hexadecimal del CUERPO CRUDO,
 *    con el secreto del endpoint. La comparacion va ANTES de parsear: si se
 *    parsea primero, el cuerpo puede haber cambiado y la firma ya no serviria.
 *  - El secreto lo elige uno al crear el endpoint con
 *    `POST /v1/webhooks/settings`; Zernio nunca lo genera.
 *  - La entrega es "al menos una vez": el mismo evento puede llegar hasta 7
 *    veces y el id de deduplicacion es el del EVENTO (`payload.id`).
 */

export const ZERNIO_EVENT = {
  MESSAGE_RECEIVED: "message.received",
  MESSAGE_SENT: "message.sent",
  MESSAGE_DELIVERED: "message.delivered",
  MESSAGE_READ: "message.read",
  MESSAGE_FAILED: "message.failed",
  CONVERSATION_STARTED: "conversation.started",
} as const;

export type ZernioEventName = (typeof ZERNIO_EVENT)[keyof typeof ZERNIO_EVENT];

/** Eventos a los que nos suscribimos en el CRM. Los demas se descartan. */
export const SUBSCRIBED_EVENTS: ZernioEventName[] = [
  ZERNIO_EVENT.MESSAGE_RECEIVED,
  ZERNIO_EVENT.MESSAGE_SENT,
  ZERNIO_EVENT.MESSAGE_DELIVERED,
  ZERNIO_EVENT.MESSAGE_READ,
  ZERNIO_EVENT.MESSAGE_FAILED,
];

export type ZernioMessage = {
  id?: string;
  conversationId?: string;
  platform?: string;
  /** Zernio usa "incoming" / "outgoing", no "in" / "out". */
  direction?: "incoming" | "outgoing" | string;
  text?: string;
  sender?: { id?: string; name?: string; username?: string } | null;
  status?: string;
};

export type ZernioEvent = {
  id?: string;
  event?: string;
  timestamp?: string;
  message?: ZernioMessage;
  conversation?: { id?: string; status?: string };
  account?: { id?: string; accountId?: string; profileId?: string; platform?: string };
  profiles?: { id?: string; externalId?: string | null }[];
};

/**
 * Verifica la firma del webhook.
 *
 * Devuelve el motivo del rechazo para poder responder con precision en vez
 * de un 400 generico que no dice nada cuando algo falla.
 */
export function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined,
): { ok: true } | { ok: false; reason: string } {
  if (!secret) return { ok: false, reason: "falta ZERNIO_WEBHOOK_SECRET en el servidor" };
  if (!signatureHeader) return { ok: false, reason: "falta la cabecera X-Zernio-Signature" };

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  // timingSafeEqual exige buffers del mismo largo: comparar primero evita que
  // una firma de otra longitud tire una excepcion en vez de fallar limpio.
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signatureHeader.trim(), "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "la firma no coincide" };
  }
  return { ok: true };
}

/**
 * Zernio puede mandar mas de una plataforma en un mismo endpoint
 * (whatsapp, instagram, messenger). El CRM solo tiene columnas para esas
 * tres; cualquier otra (telegram, tiktok, x) se ignora.
 */
export function toProvider(platform: string | undefined): "whatsapp" | "instagram" | "messenger" | null {
  switch ((platform ?? "").toLowerCase()) {
    case "whatsapp":
      return "whatsapp";
    case "instagram":
      return "instagram";
    case "messenger":
    case "facebook":
    case "facebook_messenger":
      return "messenger";
    default:
      return null;
  }
}

/**
 * Telefono del remitente.
 *
 * En el ejemplo de la documentacion el `sender` de Instagram trae
 * `{ id, name, username }`, sin telefono. En WhatsApp el `id` es el numero.
 * Por eso se mira el primero que parezca un telefono y no se assume: el
 * endpoint en modo observacion sirve justamente para confirmar cual es.
 */
export function phoneFromSender(sender: ZernioMessage["sender"]): string | null {
  if (!sender?.id) return null;
  const digits = sender.id.replace(/\D/g, "");
  // Un movil colombiano con el 57 son 12 digitos; sin el 57, 10.
  if (digits.length === 12 && digits.startsWith("57")) return digits;
  if (digits.length === 10) return `57${digits}`;
  return null;
}
