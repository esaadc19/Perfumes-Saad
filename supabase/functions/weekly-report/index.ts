import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const BREVO_SENDER_EMAIL = Deno.env.get("BREVO_SENDER_EMAIL") ?? "perfumes.saadc@gmail.com";
const REPORT_RECIPIENT_EMAIL = Deno.env.get("REPORT_RECIPIENT_EMAIL") ?? "perfumes.saadc@gmail.com";
const WHATSAPP_NUMBERS = (Deno.env.get("WHATSAPP_NUMBERS") ?? "3102318786,3016303982").split(",");

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
• Esta semana: ${formatCurrency(currentWeek.sales)} (${currentWeek.orders} pedidos)
• Semana pasada: ${formatCurrency(previousWeek.sales)} (${previousWeek.orders} pedidos)
• Tendencia: ${salesTrend} ${salesDiff >= 0 ? "+" : "-"}${formatCurrency(Math.abs(salesDiff))} (${salesDiffPercent}%)

📦 *PRODUCTO MÁS VENDIDO*
• Esta semana: ${bestThisWeek.name} (${bestThisWeek.quantity} unidades)
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

_Reporte generado automáticamente el ${data.report_date}_
  `.trim();
}

async function sendBrevoEmail(subject: string, htmlContent: string): Promise<boolean> {
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
    return response.ok;
  } catch (error) {
    console.error("Error sending Brevo email:", error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data, error } = await supabase.rpc("weekly_sales_report");
    if (error) throw error;

    const reportText = formatReport(data);
    const reportHtml = `<pre style="font-family: monospace; white-space: pre-wrap;">${reportText}</pre>`;

    // Send email via Brevo
    const emailSent = await sendBrevoEmail(
      `📊 Reporte Semanal - Semana del ${data.week_start}`,
      reportHtml
    );

    // Generate WhatsApp links
    const whatsappLinks = WHATSAPP_NUMBERS.map((number) => {
      const cleanNumber = number.replace(/\D/g, "");
      return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(reportText)}`;
    });

    return new Response(
      JSON.stringify({
        success: true,
        email_sent: emailSent,
        whatsapp_links: whatsappLinks,
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
