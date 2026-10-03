const APPS_SCRIPT_WEB_APP_URL = Deno.env.get("GOOGLE_APPS_SCRIPT_URL") ?? "";
const APPS_SCRIPT_SHARED_SECRET = Deno.env.get("GOOGLE_APPS_SCRIPT_SECRET") ?? "";

export async function sendAppsScriptEmail(
  subject: string,
  html: string,
): Promise<{ sent: boolean; error: string | null }> {
  if (!APPS_SCRIPT_WEB_APP_URL || !APPS_SCRIPT_SHARED_SECRET) {
    return {
      sent: false,
      error: "Configura GOOGLE_APPS_SCRIPT_URL y GOOGLE_APPS_SCRIPT_SECRET en los secretos de Supabase.",
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
    return { sent: false, error: "GOOGLE_APPS_SCRIPT_URL debe ser la URL HTTPS de implementación que termina en /exec." };
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
