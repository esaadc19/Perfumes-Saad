import { runGeminiConversation } from "../_lib/gemini.js";

export const config = { runtime: "nodejs" };

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN || "saad_perfumes_whatsapp_secret";

  if (mode === "subscribe" && token === expectedToken && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return json(200, { status: "Conector WhatsApp Gemini activo" });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = await request.json().catch(() => ({}));

    // 1. Extraemos el texto del mensaje según el formato entrante
    let incomingText = "";
    let customerSender = "";

    // Formato Meta Cloud API
    const metaMessage = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (metaMessage) {
      incomingText = metaMessage.text?.body || "";
      customerSender = metaMessage.from || "";
    }
    // Formato Zernio
    else if (payload?.message) {
      incomingText = payload.message.text || payload.message.body || "";
      customerSender = payload.message.sender?.id || "";
    }
    // Formato JSON directo genérico { message: "...", phone: "..." }
    else {
      incomingText = payload.message || payload.text || payload.prompt || "";
      customerSender = payload.phone || payload.sender || "";
    }

    if (!incomingText) {
      return json(200, { status: "ignored_empty_message" });
    }

    console.log(`[WhatsApp Bot] Mensaje de ${customerSender}: "${incomingText}"`);

    // 2. Ejecutamos la consulta en Gemini con acceso al catálogo y stock real
    const aiResponse = await runGeminiConversation({
      mode: "whatsapp",
      messages: [{ role: "user", content: incomingText }],
    });

    const replyText = aiResponse.text;

    // 3. Si existe Zernio configurado y viene un conversationId, enviamos el mensaje
    if (process.env.ZERNIO_API_KEY && payload?.message?.conversationId && payload?.message?.accountId) {
      try {
        const zernioBase = process.env.ZERNIO_BASE_URL ?? "https://zernio.com/api";
        const convId = payload.message.conversationId;
        const sendUrl = `${zernioBase}/v1/inbox/conversations/${convId}/messages`;

        await fetch(sendUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.ZERNIO_API_KEY}`,
            "Idempotency-Key": `gemini-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          },
          body: JSON.stringify({
            accountId: payload.message.accountId,
            message: replyText,
          }),
        });
      } catch (zernioErr) {
        console.error("Error enviando respuesta por Zernio:", zernioErr);
      }
    }

    return json(200, {
      success: true,
      sender: customerSender,
      reply: replyText,
      toolsUsed: aiResponse.toolCallsRun || [],
    });
  } catch (err: any) {
    console.error("Error en /api/gemini/whatsapp:", err);
    return json(500, { error: err.message || "Error procesando mensaje en WhatsApp" });
  }
}
