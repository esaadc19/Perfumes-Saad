import { createClient } from "@supabase/supabase-js";
import { runGeminiConversation, type ChatMessage } from "../_lib/gemini.js";

export const config = { runtime: "nodejs" };

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });

async function isAdminUser(request: Request): Promise<boolean> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  const token = header.slice(7).trim();

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return false;

  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return false;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return false;
  const adminClient = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: profile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return profile?.role === "admin";
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const rawMessages = body.messages as ChatMessage[];
    let mode: "store" | "admin" | "whatsapp" = body.mode === "admin" ? "admin" : "store";

    if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
      return json(400, { error: "El cuerpo debe incluir un arreglo 'messages' con al menos un mensaje." });
    }

    // Validación de seguridad para modo admin
    if (mode === "admin") {
      const authorized = await isAdminUser(request);
      if (!authorized) {
        console.warn("Intento de consulta admin sin rol verificado; cambiando a modo tienda.");
        mode = "store";
      }
    }

    // Ejecución con Gemini 2.5 Flash
    const result = await runGeminiConversation({
      messages: rawMessages,
      mode,
    });

    return json(200, {
      success: true,
      mode,
      model: result.usedModel,
      response: result.text,
      toolsUsed: result.toolCallsRun ?? [],
    });
  } catch (err: any) {
    console.error("Error en /api/gemini/chat:", err);
    const cause = err.cause ? ` (${err.cause.message || err.cause.code || JSON.stringify(err.cause)})` : "";
    return json(500, {
      error: (err.message || "Error interno procesando conversación con Gemini.") + cause,
      step: err.step || "unknown"
    });
  }
}
