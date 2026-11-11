// Servicio de envio de correos ejecutivos para Perfumes SAAD.
// Cuenta con alta disponibilidad:
// 1. Intenta envio via Google Apps Script (Webhook HTTPS de implementacion).
// 2. Si Google Apps Script falla (limite de cuota Google, error de auth, timeout),
//    hace failover automatico a la API de Brevo (transaccional).

const APPS_SCRIPT_WEB_APP_URL = Deno.env.get("GOOGLE_APPS_SCRIPT_URL") ?? "";
const APPS_SCRIPT_SHARED_SECRET = Deno.env.get("GOOGLE_APPS_SCRIPT_SECRET") ?? "";
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const BREVO_SENDER_EMAIL = Deno.env.get("BREVO_SENDER_EMAIL") ?? "noreply@brevo.com";
const REPORT_RECIPIENT_EMAIL = Deno.env.get("REPORT_RECIPIENT_EMAIL") ?? "";

async function sendViaAppsScript(
  subject: string,
  html: string,
): Promise<{ sent: boolean; error: string | null }> {
  if (!APPS_SCRIPT_WEB_APP_URL || !APPS_SCRIPT_SHARED_SECRET) {
    return {
      sent: false,
      error: "Faltan secretos GOOGLE_APPS_SCRIPT_URL o GOOGLE_APPS_SCRIPT_SECRET.",
    };
  }

  let endpoint: URL;
  try {
    endpoint = new URL(APPS_SCRIPT_WEB_APP_URL);
  } catch {
    return { sent: false, error: "GOOGLE_APPS_SCRIPT_URL no es una URL válida." };
  }

  if (
    endpoint.protocol !== "https:" ||
    endpoint.hostname !== "script.google.com" ||
    !/^\/macros\/s\/[^/]+\/exec$/.test(endpoint.pathname)
  ) {
    return { sent: false, error: "GOOGLE_APPS_SCRIPT_URL debe ser URL HTTPS terminada en /exec." };
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ secret: APPS_SCRIPT_SHARED_SECRET, subject, html }),
    });

    if (!response.ok) {
      console.error("Apps Script mail request failed with HTTP status:", response.status);
      return { sent: false, error: `Apps Script rechazó el envío (HTTP ${response.status}).` };
    }

    let result: unknown;
    try {
      result = await response.json();
    } catch {
      console.error("Apps Script returned a non-JSON mail response.");
      return { sent: false, error: "Apps Script devolvió una respuesta que no es JSON." };
    }

    if (
      typeof result !== "object" ||
      result === null ||
      !("success" in result) ||
      result.success !== true
    ) {
      const scriptError = typeof result === "object" && result !== null && "error" in result &&
        typeof result.error === "string"
        ? result.error
        : "Apps Script no confirmó el envío.";
      console.error("Apps Script reported a mail error:", scriptError);
      return { sent: false, error: scriptError };
    }

    return { sent: true, error: null };
  } catch (error) {
    console.error("Could not reach Apps Script mail endpoint:", error);
    return { sent: false, error: "No se pudo conectar con Apps Script para enviar el correo." };
  }
}

async function sendViaBrevo(
  subject: string,
  html: string,
): Promise<{ sent: boolean; error: string | null }> {
  if (!BREVO_API_KEY) {
    return { sent: false, error: "BREVO_API_KEY no está configurada." };
  }
  if (!REPORT_RECIPIENT_EMAIL) {
    return { sent: false, error: "REPORT_RECIPIENT_EMAIL no está configurada." };
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: "Perfumes SAAD", email: BREVO_SENDER_EMAIL },
        to: [{ email: REPORT_RECIPIENT_EMAIL, name: "Saad" }],
        subject,
        htmlContent: html,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Brevo mail request failed (HTTP ${response.status}):`, errText.slice(0, 500));
      return { sent: false, error: `Brevo rechazó el envío (HTTP ${response.status}).` };
    }

    return { sent: true, error: null };
  } catch (error) {
    console.error("Could not reach Brevo mail API:", error);
    return { sent: false, error: "No se pudo conectar con la API de Brevo." };
  }
}

export async function sendAppsScriptEmail(
  subject: string,
  html: string,
): Promise<{ sent: boolean; error: string | null }> {
  // 1. Intento primario: Apps Script si esta configurado
  if (APPS_SCRIPT_WEB_APP_URL && APPS_SCRIPT_SHARED_SECRET) {
    const appsScriptResult = await sendViaAppsScript(subject, html);
    if (appsScriptResult.sent) {
      return appsScriptResult;
    }
    console.warn("Apps Script mail falló:", appsScriptResult.error, "- Intentando fallback via Brevo...");
  }

  // 2. Fallback secundario: Brevo transaccional
  if (BREVO_API_KEY && REPORT_RECIPIENT_EMAIL) {
    const brevoResult = await sendViaBrevo(subject, html);
    if (brevoResult.sent) {
      console.info("Reporte enviado exitosamente mediante fallback de Brevo.");
      return brevoResult;
    }
    console.error("Brevo mail también falló:", brevoResult.error);
    return {
      sent: false,
      error: `Error de envío: Apps Script falló y Brevo también (${brevoResult.error}).`,
    };
  }

  return {
    sent: false,
    error: "No hay un proveedor de correo disponible (revisa GOOGLE_APPS_SCRIPT o BREVO en los secretos de Supabase).",
  };
}
