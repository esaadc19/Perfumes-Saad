import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const BREVO_SENDER_EMAIL = Deno.env.get("BREVO_SENDER_EMAIL") ?? "noreply@brevo.com";
const REPORT_RECIPIENT_EMAIL = Deno.env.get("REPORT_RECIPIENT_EMAIL") ?? "";
const WHATSAPP_NUMBERS = (Deno.env.get("WHATSAPP_NUMBERS") ?? "3102318786").split(",");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatReport(data: any): string {
  const currentWeek = data.current_week;
  const previousWeek = data.previous_week;
  const lastMonth = data.last_month;
  const bestThisWeek = data.best_product_this_week;
  const bestLastMonth = data.best_product_last_month;
  const expenses = data.expenses;

  const salesDiff = currentWeek.sales - previousWeek.sales;
  const salesTrend = salesDiff >= 0 ? "📈 Subiendo" : "📉 Bajando";
  const salesDiffPercent = previousWeek.sales > 0 
    ? Math.abs((salesDiff / previousWeek.sales) * 100).toFixed(1)
    : "0";

  return `
📊 *REPORTE SEMANAL - PERFUMES SAAD*
📅 Semana del ${data.week_start} al ${data.week_end}

━━━━━━━━━━━━━━━━━━━━━━

💰 *VENTAS*
• Semana reportada: ${formatCurrency(currentWeek.sales)} (${currentWeek.orders} pedidos)
• Semana pasada: ${formatCurrency(previousWeek.sales)} (${previousWeek.orders} pedidos)
• Tendencia: ${salesTrend} ${salesDiff >= 0 ? "+" : "-"}${formatCurrency(Math.abs(salesDiff))} (${salesDiffPercent}%)

📦 *PRODUCTO MÁS VENDIDO*
• Semana reportada: ${bestThisWeek.name} (${bestThisWeek.quantity} unidades)
• Mes pasado: ${bestLastMonth.name} (${bestLastMonth.quantity} unidades)

💵 *RESUMEN DE INGRESOS*
• Ventas semana: ${formatCurrency(currentWeek.sales)}
• Ventas mes pasado: ${formatCurrency(lastMonth.sales)}
• Promedio por pedido: ${formatCurrency(currentWeek.average_order_value)}

💸 *RESUMEN DE GASTOS*
• Gastos semana: ${formatCurrency(expenses.weekly)}
• Gastos mes: ${formatCurrency(expenses.monthly)}

━━━━━━━━━━━━━━━━━━━━━━

📋 *OTROS DATOS*
• Nuevos clientes: ${data.new_customers}
• Productos con stock bajo: ${data.low_stock_count}
• Pedidos pendientes: ${data.pending_orders}

━━━━━━━━━━━━━━━━━━━━━━

_Reporte generado el ${data.report_date}_
  `.trim();
}

async function sendBrevoEmail(
  subject: string,
  htmlContent: string
): Promise<{ sent: boolean; error: string | null }> {
  if (!BREVO_API_KEY) {
    return { sent: false, error: "Falta configurar BREVO_API_KEY en los secretos de Supabase." };
  }
  if (!BREVO_SENDER_EMAIL || !REPORT_RECIPIENT_EMAIL) {
    return {
      sent: false,
      error: "Configura BREVO_SENDER_EMAIL y REPORT_RECIPIENT_EMAIL en los secretos de Supabase.",
    };
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "api-key": BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { email: BREVO_SENDER_EMAIL, name: "Perfumes SAAD" },
        to: [{ email: REPORT_RECIPIENT_EMAIL }],
        subject: subject,
        htmlContent: htmlContent,
      }),
    });
    if (!response.ok) {
      const providerError = await response.text();
      console.error("Brevo rejected the report email:", response.status, providerError.slice(0, 1000));
      if (response.status === 401) {
        return {
          sent: false,
          error: "Brevo no autorizó la clave (HTTP 401). Actualiza BREVO_API_KEY con una API key de Brevo válida; no uses la clave SMTP.",
        };
      }
      return {
        sent: false,
        error: `Brevo rechazó el envío (HTTP ${response.status}). Verifica el remitente y la configuración de Brevo.`,
      };
    }
    return { sent: true, error: null };
  } catch (error) {
    console.error("Error sending Brevo email:", error);
    return { sent: false, error: "No se pudo conectar con Brevo para enviar el correo." };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 405,
      });
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase report function environment is not configured.");
    }

    const authorization = req.headers.get("authorization") ?? "";
    const accessToken = authorization.replace(/^Bearer\s+/i, "");
    if (!accessToken) {
      return new Response(JSON.stringify({ success: false, error: "Authentication required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    if (accessToken !== SUPABASE_SERVICE_ROLE_KEY) {
      if (!SUPABASE_ANON_KEY) throw new Error("Supabase public key is not configured.");
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      });
      const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);
      if (userError || !userData.user) {
        return new Response(JSON.stringify({ success: false, error: "Valid user authentication is required" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        });
      }

      const { data: profile, error: profileError } = await serviceClient
        .from("profiles")
        .select("role")
        .eq("id", userData.user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (profile?.role !== "admin") {
        return new Response(JSON.stringify({ success: false, error: "Administrator access required" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        });
      }
    }

    const { data, error } = await serviceClient.rpc("weekly_sales_report");
    if (error) throw error;

    const reportText = formatReport(data);
    const escapedReport = reportText.replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character] ?? character);
    const reportHtml = `<pre style="font-family: monospace; white-space: pre-wrap;">${escapedReport}</pre>`;

    // Send email via Brevo
    const emailResult = await sendBrevoEmail(
      `📊 Reporte Semanal - Semana del ${data.week_start}`,
      reportHtml
    );

    // Generate WhatsApp links
    const whatsappLinks = WHATSAPP_NUMBERS.map((number) => {
      let cleanNumber = number.replace(/\D/g, "");
      if (cleanNumber.length === 10) cleanNumber = `57${cleanNumber}`;
      return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(reportText)}`;
    }).filter((link) => !link.startsWith("https://wa.me/?"));

    return new Response(
      JSON.stringify({
        success: true,
        email_sent: emailResult.sent,
        email_error: emailResult.error,
        whatsapp_links: whatsappLinks,
        report_text: reportText,
        report: data,
        message: "Reporte generado exitosamente",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error generating report:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
