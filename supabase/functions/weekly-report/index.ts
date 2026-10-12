import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendAppsScriptEmail } from "../_shared/apps-script-mail.ts";

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
  const creditCost = num(week.credit_cost);
  const cashProfit = profit + creditCost;

  // Si falta el costo de alguna venta, la utilidad no es un numero que se
  // pueda defender. Se declara incompleta en vez de rellenar con cero.
  const profitComplete = missingCost === 0;
  const profitLine = profitComplete
    ? `*Utilidad cobrada:* ${formatCurrency(cashProfit)}`
    : `⚠️ *Utilidad incompleta* — ${missingCost} ${missingCost === 1 ? "pedido no tiene" : "pedidos no tienen"} costo registrado`;
  const margin = profitComplete && num(week.sales) > 0
    ? ` (margen ${((cashProfit / num(week.sales)) * 100).toFixed(1)}%)`
    : "";

  const lines: string[] = [
    `💰 *UTILIDAD COBRADA — ${periodWord}*`,
    `${data.week_start} al ${data.week_end}`,
    profitLine + margin,
    ``,
    `Ventas cobradas: ${formatCurrency(num(week.sales))}`,
    `− Costo productos: ${formatCurrency(num(week.product_cost))}`,
    `− Costo domicilio: ${formatCurrency(num(week.delivery_cost))}`,
    `− Gastos: ${formatCurrency(num(week.expenses))}`,
    ``,
    `📊 *INGRESOS*`,
    `${isWeek ? "Esta semana" : "Este periodo"}: ${formatCurrency(num(week.sales))} (${num(week.orders)} pedidos)`,
    `${prevWord}: ${formatCurrency(num(previous.sales))} (${num(previous.orders)} pedidos)`,
    formatVariation(num(week.sales), num(previous.sales)),
    `Ticket promedio: ${formatCurrency(num(week.average_order_value))}`,
    ``,
    `💳 *FIADO Y CARTERA*`,
    `Vendido a crédito ${isWeek ? "esta semana" : "en el periodo"}: ${formatCurrency(num(credit.week_sales))} (${num(credit.week_orders)} pedidos)`,
    `Te pagaron de fiado: ${formatCurrency(num(credit.week_collected))}`,
    `Por cobrar en total: ${formatCurrency(num(credit.outstanding_balance))}`,
    `Costo de lo que te deben: ${formatCurrency(num(credit.outstanding_cost))}`,
  ];

  if (creditCost > 0) {
    lines.push(
      ``,
      `ℹ️ Vendiste ${formatCurrency(num(credit.week_sales))} a fiado ${isWeek ? "esta semana" : "en el periodo"}.`,
      `Ese producto ya te costó ${formatCurrency(creditCost)} y todavía no te lo pagan.`,
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

/** Escapa texto antes de insertarlo dentro de HTML. */
function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function row(label: string, value: string, strong = false): string {
  const weight = strong ? "700" : "400";
  return `<tr>
      <td style="padding:6px 0;color:#6b6b6b;font-size:14px;">${escapeHtml(label)}</td>
      <td style="padding:6px 0;text-align:right;color:#1f1f1f;font-size:14px;font-weight:${weight};">${escapeHtml(value)}</td>
    </tr>`;
}

function section(title: string, body: string): string {
  return `
    <h2 style="margin:28px 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8a7a6a;font-weight:700;">${escapeHtml(title)}</h2>
    <table style="width:100%;border-collapse:collapse;">${body}</table>`;
}

function formatReportHtml(data: any): string {
  const week = data.current_week;
  const previous = data.previous_week;
  const credit = data.credit ?? {};
  const expenses = data.expenses ?? {};
  const profit = num(week.net_profit);
  const missingCost = num(week.missing_cost_items);
  const overdue = num(credit.overdue_balance);
  const periodDays = num(data.period?.days ?? 7);
  // El encabezado decia "Reporte semanal" y "Utilidad de la semana" aunque
  // el rango fuera un mes o el año entero.
  const scopeLabel = periodDays === 1
    ? "del día"
    : periodDays <= 7
      ? "de la semana"
      : periodDays <= 31
        ? "del mes"
        : `del periodo`;

  // Sin costo completo la utilidad no se muestra como numero: por muy
  // alto que salga, es mentira.
  const profitComplete = missingCost === 0;

  // La utilidad neta mezcla dos cosas: lo que ganaste de lo que vendiste y
  // cobraste, mas el costo de lo que vendiste a fiado y aun no te pagan. Un
  // numero negativo asi duele sin explicar que esa plata no se perdio, solo
  // esta afuera. Se separan las dos cifras.
  const creditCost = num(week.credit_cost);
  const cashProfit = profit + creditCost;
  const cashMargin = num(week.sales) > 0 && profitComplete
    ? (cashProfit / num(week.sales)) * 100
    : null;

  const heroValue = profitComplete ? formatCurrency(cashProfit) : "Incompleta";
  const heroLabel = profitComplete
    ? `Utilidad cobrada${scopeLabel === "de la semana" ? "" : scopeLabel}${cashMargin !== null ? ` · margen ${cashMargin.toFixed(1)}%` : ""}`
    : `${missingCost} ${missingCost === 1 ? "pedido no tiene" : "pedidos no tienen"} costo registrado`;
  const heroColor = !profitComplete ? "#8a5a00" : cashProfit < 0 ? "#b3261e" : "#1a5c34";

  // Solo aparece cuando hubo venta a fiado. Sin esto, un margen negativo se
  // lee como perdida cuando en realidad es inventario parado: vendiste a
  // credito, el producto ya salio y el costo se reconocieron, pero la plata
  // entra cuando el cliente pague.
  const creditImpact = creditCost > 0 ? `
      <tr><td colspan="2" style="padding:12px;background:#fdf6e8;border-radius:8px;font-size:13px;line-height:1.55;">
        <strong style="color:#8a5a00;">Vendiste ${escapeHtml(formatCurrency(num(credit.week_sales)))} a fiado ${escapeHtml(scopeLabel === "de la semana" ? "esta semana" : "en el periodo")}</strong><br>
        Ese producto ya te costó ${escapeHtml(formatCurrency(creditCost))} y todavía no te lo pagan.<br>
        <span style="color:#6b6b6b;">No es pérdida: es plata invertida, y vuelve a tu utilidad cuando el cliente te pague. Lo que ganaste de lo que sí cobraste fue ${escapeHtml(formatCurrency(cashProfit))}.</span>
      </td></tr>` : "";

  const creditWarning = overdue > 0
    ? `<tr><td colspan="2" style="padding:10px 12px;background:#fdecea;border-radius:8px;color:#b3261e;font-size:13px;font-weight:600;">
        ⚠️ Vencido: ${escapeHtml(formatCurrency(overdue))} en ${escapeHtml(String(num(credit.customers_overdue)))} clientes
      </td></tr>`
    : "";

  const topList = (Array.isArray(data.top_products) ? data.top_products : [])
    .map((product: any, index: number) => `<tr>
      <td style="padding:5px 0;color:#6b6b6b;font-size:13px;width:24px;">${index + 1}.</td>
      <td style="padding:5px 0;color:#1f1f1f;font-size:13px;">${escapeHtml(cleanProductName(product.name))}</td>
      <td style="padding:5px 0;text-align:right;color:#1f1f1f;font-size:13px;font-weight:600;">${escapeHtml(String(num(product.quantity)))} und</td>
    </tr>`).join("");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#faf9f7;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f1f1f;">
    <div style="background:#ffffff;border:1px solid #ece7e1;border-radius:12px;padding:24px;">

      <p style="margin:0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#8a7a6a;font-weight:700;">Perfumes SAAD</p>
      <h1 style="margin:6px 0 2px;font-size:20px;font-weight:600;">Reporte ${periodDays <= 7 ? "semanal" : periodDays <= 31 ? "mensual" : "por periodo"}</h1>
      <p style="margin:0 0 20px;font-size:13px;color:#6b6b6b;">Del ${escapeHtml(String(data.week_start))} al ${escapeHtml(String(data.week_end))}</p>

      <div style="background:#f6f5f3;border-radius:10px;padding:18px;text-align:center;">
        <p style="margin:0 0 6px;font-size:12px;color:#6b6b6b;font-weight:600;">${escapeHtml(heroLabel)}</p>
        <p style="margin:0;font-size:30px;font-weight:700;color:${heroColor};">${escapeHtml(heroValue)}</p>
      </div>

      ${section("Ingresos", [
        row("Ventas cobradas", formatCurrency(num(week.sales)), true),
        row("Pedidos", String(num(week.orders))),
        row(periodDays <= 7 ? "Semana pasada" : "Periodo anterior", formatCurrency(num(previous.sales))),
        row("Variación", formatVariation(num(week.sales), num(previous.sales))),
        row("Ticket promedio", formatCurrency(num(week.average_order_value))),
      ].join(""))}

      ${section("Fiado y cartera", [
        row(`Vendido a crédito ${scopeLabel === "de la semana" ? "esta semana" : "en el periodo"}`, `${formatCurrency(num(credit.week_sales))} (${num(credit.week_orders)} ped.)`),
        row("Te pagaron de fiado", formatCurrency(num(credit.week_collected))),
        row("Por cobrar en total", formatCurrency(num(credit.outstanding_balance)), true),
        row("Costo de lo que te deben", formatCurrency(num(credit.outstanding_cost))),
        creditWarning,
      ].join(""))}
      ${creditImpact}

      ${section("Más vendidos", topList || row("Sin ventas registradas", ""))}

      ${section("Gastos", [
        row(periodDays <= 7 ? "Semana" : "Periodo", formatCurrency(num(week.expenses))),
        row("Mes en curso", formatCurrency(num(expenses.monthly))),
        row("Costo de productos", formatCurrency(num(week.product_cost))),
        row("Costo de domicilio", formatCurrency(num(week.delivery_cost))),
        creditCost > 0 ? row("Inversión en fiado (vuelve al cobrar)", formatCurrency(creditCost)) : "",
      ].join(""))}

      ${section("Para mirar", [
        row("Clientes nuevos", String(data.new_customers)),
        row("Pedidos pendientes", String(data.pending_orders)),
        row("Productos con stock bajo", String(data.low_stock_count)),
      ].join(""))}

      <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #ece7e1;font-size:12px;color:#9a9189;">
        Generado el ${escapeHtml(String(data.report_date))} · La utilidad descuenta el costo de lo vendido a crédito que aún no te pagan.
      </p>
    </div>
  </div>
</body>
</html>`;
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
    // El correo va como HTML real, no dentro de un <pre> monoespaciado:
    // el texto se lee bien en WhatsApp pero por correo salia como un bloque
    // gris plano. Los dos formatos salen del mismo dato.
    const reportHtml = isDailyReport
      ? `<pre style="font-family: monospace; white-space: pre-wrap;">${escapeHtml(reportText)}</pre>`
      : formatReportHtml(data);

    // "Semana del" era incorrecto cuando el rango es un mes o un año.
    const periodDays = Number(data.period?.days ?? 7);
    const periodLabel = periodDays === 1
      ? "Reporte diario"
      : periodDays <= 7
        ? `Reporte semanal - ${data.week_start} al ${data.week_end}`
        : periodDays <= 31
          ? `Reporte mensual - ${data.week_start} al ${data.week_end}`
          : `Reporte de ${periodDays} días - ${data.week_start} al ${data.week_end}`;

    // Send email via Brevo
    const emailResult = await sendAppsScriptEmail(
      isDailyReport ? `📊 Reporte Diario - ${data.report_date}` : `📊 ${periodLabel}`,
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
