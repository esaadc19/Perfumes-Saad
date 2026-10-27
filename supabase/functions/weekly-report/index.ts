import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendAppsScriptEmail } from "../_shared/apps-script-mail.ts";
import { formatEmailHtml, reportEmailTitle } from "../_shared/report-email.ts";

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

/**
 * Un porcentaje de variacion solo tiene sentido si hay base de comparacion.
 * Cuando la semana anterior fue $0, el correo viejo imprimia "0%" al lado
 * de "+$770.000": el numero grande no era 0%, era indefinido.
 */
function formatVariation(current: number, previous: number): string {
  const diff = current - previous;
  const arrow = diff >= 0 ? "📈" : "📉";
  if (previous <= 0) {
    return current > 0
      ? `${arrow} Sin semana previa para comparar`
      : `${arrow} Igual que la semana pasada`;
  }
  const percent = Math.abs((diff / previous) * 100).toFixed(1);
  return `${arrow} ${diff >= 0 ? "+" : "-"}${formatCurrency(Math.abs(diff))} (${percent}%)`;
}

/**
 * `product_name_snapshot` guarda la marca y la presentacion separadas por
 * comas. El correo viejo armaba el nombre a mano y por eso imprimia
 * "Ariana Grande Ariana Grande Cloud 100ml" con la marca repetida.
 */
function cleanProductName(raw: string | null | undefined): string {
  if (!raw || raw === "N/A") return "Sin ventas";
  const parts = String(raw).split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) return String(raw);
  return parts
    .filter((part, index) => index === 0 || part.toLowerCase() !== parts[0].toLowerCase())
    .join(" ");
}

const num = (value: unknown): number => Number(value ?? 0);

function formatReport(data: any): string {
  const week = data.current_week;
  const previous = data.previous_week;
  const credit = data.credit ?? {};
  const expenses = data.expenses ?? {};
  const profit = num(week.net_profit);
  const missingCost = num(week.missing_cost_items);
  const overdue = num(credit.overdue_balance);
  const periodDays = num(data.period?.days ?? 7);
  const isWeek = periodDays <= 7;
  const periodWord = isWeek ? "SEMANA" : periodDays <= 31 ? "MES" : `${periodDays} DÍAS`;
  const prevWord = isWeek ? "Semana pasada" : "Periodo anterior";

  // Igual que en el HTML: se separan la utilidad de lo cobrado y el costo
  // de lo vendido a fiado, para que un negativo no se lea como perdida.
  // Los abonos de fiados abiertos ya son plata cobrada y suman a la utilidad.
  const creditCost = num(week.credit_cost);
  const creditCollected = num(week.credit_collected);
  const cashCollected = num(week.cash_collected ?? (num(week.sales) + creditCollected));
  const cashProfit = profit + creditCost;

  // Si falta el costo de alguna venta, la utilidad no es un numero que se
  // pueda defender. Se declara incompleta en vez de rellenar con cero.
  const profitComplete = missingCost === 0;
  const profitLine = profitComplete
    ? `*Utilidad cobrada:* ${formatCurrency(cashProfit)}`
    : `⚠️ *Utilidad incompleta* — ${missingCost} ${missingCost === 1 ? "pedido no tiene" : "pedidos no tienen"} costo registrado`;
  const margin = profitComplete && cashCollected > 0
    ? ` (margen ${((cashProfit / cashCollected) * 100).toFixed(1)}%)`
    : "";

  const collectedLines = creditCollected > 0
    ? [
        `Ventas cobradas: ${formatCurrency(num(week.sales))}`,
        `+ Abonos de fiado: ${formatCurrency(creditCollected)}`,
        `= Total cobrado: ${formatCurrency(cashCollected)}`,
      ]
    : [`Ventas cobradas: ${formatCurrency(num(week.sales))}`];

  const lines: string[] = [
    `💰 *UTILIDAD COBRADA — ${periodWord}*`,
    `${data.week_start} al ${data.week_end}`,
    profitLine + margin,
    ``,
    ...collectedLines,
    `− Costo productos: ${formatCurrency(num(week.product_cost))}`,
    `− Costo domicilio: ${formatCurrency(num(week.delivery_cost))}`,
    `− Gastos: ${formatCurrency(num(week.expenses))}`,
    ``,
    `📊 *INGRESOS*`,
    `${isWeek ? "Esta semana" : "Este periodo"}: ${formatCurrency(num(week.sales))} (${num(week.orders)} pedidos)`,
    ...(creditCollected > 0 ? [`Abonos de fiado: ${formatCurrency(creditCollected)}`] : []),
    `${prevWord}: ${formatCurrency(num(previous.sales))} (${num(previous.orders)} pedidos)`,
    formatVariation(num(week.sales), num(previous.sales)),
    `Ticket promedio: ${formatCurrency(num(week.average_order_value))}`,
    ``,
    `💳 *FIADO Y CARTERA*`,
    `Vendido a crédito ${isWeek ? "esta semana" : "en el periodo"}: ${formatCurrency(num(credit.week_sales))} (${num(credit.week_orders)} pedidos)`,
    `Te pagaron de fiado: ${formatCurrency(num(credit.week_collected))}`,
    ...(creditCollected > 0
      ? [`De fiados abiertos: ${formatCurrency(num(credit.week_collected_open ?? creditCollected))}`]
      : []),
    `Por cobrar en total: ${formatCurrency(num(credit.outstanding_balance))}`,
    `Costo de lo que te deben: ${formatCurrency(num(credit.outstanding_cost))}`,
  ];

  if (creditCost > 0) {
    lines.push(
      ``,
      `ℹ️ Vendiste ${formatCurrency(num(credit.week_sales))} a fiado ${isWeek ? "esta semana" : "en el periodo"}.`,
      `Ese producto ya te costó ${formatCurrency(creditCost)} y el fiado aún no está saldado.`,
      creditCollected > 0
        ? `De eso ya te abonaron ${formatCurrency(creditCollected)}; el resto vuelve cuando paguen.`
        : `Todavía no te lo pagan.`,
      `_No es pérdida: es plata invertida que vuelve cuando te paguen._`,
    );
  }

  if (overdue > 0) {
    lines.push(`⚠️ *Vencido:* ${formatCurrency(overdue)} (${num(credit.customers_overdue)} clientes)`);
  }

  lines.push(
    ``,
    `📦 *MÁS VENDIDO*`,
    `${cleanProductName(data.best_product_this_week?.name)} (${num(data.best_product_this_week?.quantity)} und)`,
    ``,
    `💸 *GASTOS*`,
    `${isWeek ? "Semana" : "Periodo"}: ${formatCurrency(num(week.expenses))}`,
    `Mes en curso: ${formatCurrency(num(expenses.monthly))}`,
    creditCost > 0 ? `Inversión en fiado (vuelve al cobrar): ${formatCurrency(creditCost)}` : ``,
    ``,
    `📋 *PARA MIRAR*`,
    `Clientes nuevos: ${data.new_customers}`,
    `Pedidos pendientes: ${data.pending_orders}`,
    `Stock bajo: ${data.low_stock_count} ${data.low_stock_count === 1 ? "producto" : "productos"}`,
  );

  return lines.join("\n");
}

function formatDailyReport(data: any): string {
  const bestProduct = data.best_product;
  return `
📊 *REPORTE DIARIO - PERFUMES SAAD*
📅 Fecha: ${data.report_date}

💰 *VENTAS*
• Total vendido: ${formatCurrency(data.sales)}
• Pedidos completados: ${data.orders}
• Unidades vendidas: ${data.items_sold}

📦 *PRODUCTO MÁS VENDIDO*
• ${bestProduct.name} (${bestProduct.quantity} unidades)

💸 *GASTOS*
• Gastos registrados: ${formatCurrency(data.expenses)}

_Reporte generado el ${data.report_date}_
  `.trim();
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

    const requestBody = await req.json();
    const requestedDate = requestBody?.report_date;
    if (requestedDate !== undefined &&
      (typeof requestedDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate))) {
      throw new Error("La fecha del reporte debe tener el formato AAAA-MM-DD.");
    }
    if (typeof requestedDate === "string") {
      const parsedDate = new Date(`${requestedDate}T00:00:00Z`);
      const parsedDateText = parsedDate.toISOString().slice(0, 10);
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      if (parsedDateText !== requestedDate || requestedDate > today) {
        throw new Error("La fecha del reporte diario no es válida.");
      }
    }

    const isDailyReport = typeof requestedDate === "string";

    // Rango del reporte. Solo aplica al semanal: el diario siempre es un
    // unico dia. Sin rango, la RPC usa la semana completa anterior, que es
    // lo que manda el cron los domingos.
    const isDate = (value: unknown): value is string =>
      typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
    const periodFrom = !isDailyReport && isDate(requestBody?.period_from) ? requestBody.period_from : null;
    const periodTo = !isDailyReport && isDate(requestBody?.period_to) ? requestBody.period_to : null;

    if ((periodFrom || periodTo) && !periodFrom) {
      throw new Error("Para elegir un periodo se necesita la fecha de inicio.");
    }

    const { data, error } = isDailyReport
      ? await serviceClient.rpc("daily_sales_report", { target_date: requestedDate })
      : await serviceClient.rpc("weekly_sales_report", { p_from: periodFrom, p_to: periodTo });
    if (error) throw error;

    const reportText = isDailyReport ? formatDailyReport(data) : formatReport(data);
    // Los dos correos (semanal y diario) salen de la misma plantilla con los
    // datos por variables. El texto va aparte: ese es el que se pega en
    // WhatsApp, donde el HTML no sirve.
    const reportHtml = formatEmailHtml(data, isDailyReport);

    // El asunto nombra el reporte como es: DIARIO / SEMANAL / MENSUAL
    // (o por duracion cuando el rango pasa de un mes) mas el rango.
    const periodDays = Number(data.period?.days ?? 7);
    const emailTitle = reportEmailTitle(isDailyReport, periodDays);
    const emailSubject = isDailyReport
      ? `📊 ${emailTitle} - ${data.report_date}`
      : `📊 ${emailTitle} - ${data.week_start} al ${data.week_end}`;

    // Send email via Brevo
    const emailResult = await sendAppsScriptEmail(emailSubject, reportHtml);

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

    // `error.message` no siempre existe: si viene de Postgres o de un fetch,
    // el mensaje vive en otra propiedad y el panel terminaba mostrando
    // "undefined".
    const rawMessage =
      error instanceof Error
        ? error.message
        : typeof (error as { message?: unknown })?.message === "string"
          ? String((error as { message?: unknown }).message)
          : String(error);

    // Si la RPC no acepta p_from/p_to es que la migracion de periodos no
    // esta aplicada. Es el error mas probable y el mas facil de arreglar.
    const hint = rawMessage.includes("weekly_sales_report") &&
        (rawMessage.includes("p_from") || rawMessage.includes("Could not find the function"))
      ? " Corre la migracion supabase/migrations/20261012110000_weekly_report_period.sql."
      : "";

    return new Response(
      JSON.stringify({ success: false, error: rawMessage + hint }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
