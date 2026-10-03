import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendAppsScriptEmail } from "../_shared/apps-script-mail.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return Response.json(
        { success: false, error: "Method not allowed" },
        { status: 405, headers: corsHeaders },
      );
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase reminder function environment is not configured.");
    }

    const authorization = req.headers.get("authorization") ?? "";
    const accessToken = authorization.replace(/^Bearer\s+/i, "");
    if (!accessToken) {
      return Response.json(
        { success: false, error: "Authentication required" },
        { status: 401, headers: corsHeaders },
      );
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    if (accessToken !== SUPABASE_SERVICE_ROLE_KEY) {
      if (!SUPABASE_ANON_KEY) throw new Error("Supabase public key is not configured.");
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      });
      const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);
      if (userError || !userData.user) {
        return Response.json(
          { success: false, error: "Valid user authentication is required" },
          { status: 401, headers: corsHeaders },
        );
      }

      const { data: profile, error: profileError } = await serviceClient
        .from("profiles")
        .select("role")
        .eq("id", userData.user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (profile?.role !== "admin") {
        return Response.json(
          { success: false, error: "Administrator access required" },
          { status: 403, headers: corsHeaders },
        );
      }
    }

    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const { data: reminders, error: reminderError } = await serviceClient
      .from("recurring_expenses")
      .select("id, name, amount, category, next_due_date")
      .eq("active", true)
      .lte("next_due_date", today)
      .or(`last_reminded_for.is.null,last_reminded_for.lt.${today}`)
      .order("next_due_date", { ascending: true });
    if (reminderError) throw reminderError;
    if (!reminders?.length) {
      return Response.json({ success: true, reminders: 0, email_sent: false }, { headers: corsHeaders });
    }

    const rows = reminders.map((reminder) =>
      `<tr><td>${escapeHtml(reminder.name)}</td><td>${escapeHtml(reminder.category)}</td><td>${new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 0,
      }).format(Number(reminder.amount))}</td><td>${escapeHtml(reminder.next_due_date)}</td></tr>`
    ).join("");
    const emailHtml = `
      <h2>Recordatorios de pagos recurrentes - Perfumes SAAD</h2>
      <p>Estos gastos están vencidos o vencen hoy. El aviso se repetirá diariamente hasta registrar el pago.</p>
      <table cellpadding="8" cellspacing="0" border="1">
        <thead><tr><th>Gasto</th><th>Categoría</th><th>Monto</th><th>Vencimiento</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    const emailResult = await sendAppsScriptEmail(
      `Recordatorio: ${reminders.length} pago(s) recurrente(s) pendiente(s)`,
      emailHtml,
    );
    if (!emailResult.sent) {
      throw new Error(emailResult.error ?? "Apps Script no confirmó el envío del recordatorio.");
    }

    const { error: updateError } = await serviceClient
      .from("recurring_expenses")
      .update({ last_reminded_for: today })
      .in("id", reminders.map((reminder) => reminder.id));
    if (updateError) throw updateError;

    return Response.json(
      { success: true, reminders: reminders.length, email_sent: true },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("Error sending recurring expense reminders:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "No se pudo enviar el recordatorio.",
      },
      { status: 500, headers: corsHeaders },
    );
  }
});
