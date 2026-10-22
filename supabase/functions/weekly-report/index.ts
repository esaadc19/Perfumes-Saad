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

/** Fecha corta 28/09/2026. Sin Date: que la zona horaria no corra el dia. */
function formatDate(iso: string | null | undefined): string {
  const text = String(iso ?? "").slice(0, 10);
  const parts = text.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : text;
}

const unitsText = (quantity: number): string =>
  `(${quantity} ${quantity === 1 ? "unidad" : "unidades"})`;

const ordersText = (count: number): string =>
  `(${count} ${count === 1 ? "pedido" : "pedidos"})`;

/** Monto formateado y escapado, listo para insertarse en el HTML. */
const money = (value: number): string => escapeHtml(formatCurrency(value));

/** Texto secundario en gris, como en la plantilla del dueno. */
const muted = (text: string): string =>
  `<span style="color:#666666;font-weight:normal;">${escapeHtml(text)}</span>`;

function infoRow(label: string, valueHtml: string, bold = false): string {
  return `<tr>
                  <td style="padding:8px 0;color:#666666;">${escapeHtml(label)}</td>
                  <td align="right" style="padding:8px 0;${bold ? "font-weight:bold;" : ""}">${valueHtml}</td>
                </tr>`;
}

function block(title: string, body: string, padding = "0 24px 24px 24px", note = ""): string {
  return `
          <tr>
            <td style="padding:${padding};">
              <div style="font-size:16px;font-weight:bold;color:#2b2b2b;border-bottom:2px solid #c9a96e;padding-bottom:8px;margin-bottom:16px;">${title}</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px;">${body}</table>${note}
            </td>
          </tr>`;
}

/**
 * La variacion del correo usa la palabra que puso el dueno en su plantilla
 * ("Subiendo"/"Bajando"). Y cuando no hay base de comparacion se dice tal
 * cual: el "(0%)" junto a "+$770.000" era un indefinido disfrazado de dato.
 */
function emailVariation(current: number, previous: number, isWeek: boolean): { text: string; color: string } {
  if (previous <= 0) {
    return current > 0
      ? { text: `📈 Sin ${isWeek ? "semana previa" : "periodo previo"} para comparar`, color: "#2b2b2b" }
      : { text: "Sin cambios", color: "#666666" };
  }
  const diff = current - previous;
  if (diff === 0) return { text: "Sin cambios", color: "#666666" };
  const percent = Math.abs((diff / previous) * 100).toFixed(1);
  return diff > 0
    ? { text: `📈 Subiendo +${formatCurrency(diff)} (${percent}%)`, color: "#2e7d32" }
    : { text: `📉 Bajando -${formatCurrency(Math.abs(diff))} (${percent}%)`, color: "#c62828" };
}

/**
 * La plantilla del correo la diseño el dueño: tablas en vez de divs (se ve
 * igual en Gmail y Outlook), fondo beige y encabezado oscuro con acento
 * dorado. Los datos entran por variables y la misma plantilla sirve para el
 * semanal y el diario: el diario omite lo que no tiene con que llenar
 * (comparaciones, utilidad, fiado y "otros datos").
 */
function formatEmailHtml(data: any, isDaily: boolean): string {
  const week = data.current_week ?? {};
  const previous = data.previous_week ?? {};
  const credit = data.credit ?? {};
  const expenses = data.expenses ?? {};
  const periodDays = isDaily ? 1 : num(data.period?.days ?? 7);
  const isWeek = periodDays <= 7;

  const periodLabel = isDaily
    ? "Reporte diario"
    : isWeek
    ? "Reporte semanal"
    : periodDays <= 31
      ? "Reporte mensual"
      : "Reporte por periodo";
  // El encabezado decia "Reporte semanal"... aunque el rango fuera un mes
  // o el año entero. Cada periodo se nombra como es.
  const rangeLabel = isDaily
    ? `Día ${formatDate(data.report_date)}`
    : isWeek
      ? `Semana del ${formatDate(data.week_start)} al ${formatDate(data.week_end)}`
      : periodDays <= 31
        ? `Mes del ${formatDate(data.week_start)} al ${formatDate(data.week_end)}`
        : `Periodo del ${formatDate(data.week_start)} al ${formatDate(data.week_end)}`;

  const sales = isDaily ? num(data.sales) : num(week.sales);
  const orders = isDaily ? num(data.orders) : num(week.orders);
  const prevSales = num(previous.sales);
  const prevOrders = num(previous.orders);
  const currentLabel = isDaily ? "Día reportado" : "Semana reportada";
  const prevLabel = isWeek ? "Semana pasada" : "Periodo anterior";
  const variation = emailVariation(sales, prevSales, isWeek);

  // Utilidad cobrada: la titular del reporte. Sin costo completo el numero
  // no se puede defender: se declara incompleta en vez de rellenar con cero.
  const profit = num(week.net_profit);
  const missingCost = num(week.missing_cost_items);
  const creditCost = num(week.credit_cost);
  const cashProfit = profit + creditCost;
  const profitComplete = missingCost === 0;
  const margin = profitComplete && sales > 0 ? (cashProfit / sales) * 100 : null;
  const profitLabel = profitComplete
    ? `Utilidad cobrada${margin !== null ? ` · margen ${margin.toFixed(1)}%` : ""}`
    : `⚠️ ${missingCost} ${missingCost === 1 ? "pedido no tiene" : "pedidos no tienen"} costo registrado`;
  const profitColor = !profitComplete ? "#8a5a00" : cashProfit < 0 ? "#c62828" : "#2e7d32";

  const bestName = cleanProductName(isDaily ? data.best_product?.name : data.best_product_this_week?.name);
  const bestQty = num(isDaily ? data.best_product?.quantity : data.best_product_this_week?.quantity);
  const bestLastName = cleanProductName(data.best_product_last_month?.name);
  const bestLastQty = num(data.best_product_last_month?.quantity);

  const averageOrder = isDaily
    ? (orders > 0 ? sales / orders : 0)
    : num(week.average_order_value);

  // Fiado: solo cuando hubo actividad. Si no, el correo no se llena de ceros.
  const overdue = num(credit.overdue_balance);
  const overdueCustomers = num(credit.customers_overdue);
  const fiadoActive = !isDaily &&
    (num(credit.week_sales) > 0 || num(credit.week_collected) > 0 ||
      num(credit.outstanding_balance) > 0 || overdue > 0);

  // El costo de lo vendido a fiado ya se desconto de la utilidad: la nota
  // evita que un numero mas bajo se lea como perdida.
  const fiadoNote = creditCost > 0
    ? `<div style="background-color:#fdf6e8;border-radius:6px;padding:12px;margin-top:12px;font-size:13px;line-height:1.5;color:#666666;">
                Vendiste ${money(num(credit.week_sales))} a fiado ${isWeek ? "esta semana" : "en el periodo"}: el producto ya salió y su costo ya se descontó, pero la plata entra cuando te paguen.
                <strong style="color:#8a5a00;">No es pérdida: es inversión que vuelve al cobrar.</strong>
              </div>`
    : "";

  const lowStock = num(data.low_stock_count);

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(periodLabel)} - Perfumes Saad</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f1ec;font-family:Arial,Helvetica,sans-serif;color:#2b2b2b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f1ec;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">

          <!-- Encabezado -->
          <tr>
            <td style="background-color:#2b2b2b;padding:28px 24px;text-align:center;">
              <div style="font-size:12px;letter-spacing:3px;color:#c9a96e;text-transform:uppercase;">${escapeHtml(periodLabel)}</div>
              <div style="font-size:24px;font-weight:bold;color:#ffffff;margin-top:8px;">PERFUMES SAAD</div>
              <div style="font-size:14px;color:#d9d9d9;margin-top:8px;">${escapeHtml(rangeLabel)}</div>
            </td>
          </tr>
${isDaily ? "" : `
          <!-- Utilidad cobrada: la titular del reporte -->
          <tr>
            <td style="padding:24px;">
              <div style="background-color:#faf7f2;border-radius:6px;padding:16px;text-align:center;">
                <div style="font-size:13px;color:#666666;margin-bottom:4px;">${escapeHtml(profitLabel)}</div>
                <div style="font-size:22px;font-weight:bold;color:${profitColor};">${profitComplete ? money(cashProfit) : "Incompleta"}</div>
              </div>
            </td>
          </tr>`}

          <!-- Ventas -->
          ${block("💰 Ventas", [
            infoRow(currentLabel, `${money(sales)} ${muted(ordersText(orders))}`, true),
            isDaily ? "" : infoRow(prevLabel, `${money(prevSales)} ${muted(ordersText(prevOrders))}`),
            isDaily ? "" : infoRow("Tendencia", `<span style="color:${variation.color};">${escapeHtml(variation.text)}</span>`, true),
          ].filter(Boolean).join(""), isDaily ? "24px" : "0 24px 24px 24px")}

          <!-- Producto más vendido -->
          ${block("📦 Producto más vendido", [
            infoRow(currentLabel, `${escapeHtml(bestName)} ${muted(unitsText(bestQty))}`, true),
            isDaily ? "" : infoRow("Mes pasado", `${escapeHtml(bestLastName)} ${muted(unitsText(bestLastQty))}`),
          ].filter(Boolean).join(""))}

          <!-- Ingresos y gastos -->
          <tr>
            <td style="padding:0 24px 24px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="50%" valign="top" style="padding-right:8px;">
                    <div style="background-color:#faf7f2;border-radius:6px;padding:16px;">
                      <div style="font-size:14px;font-weight:bold;margin-bottom:12px;">💵 Ingresos</div>
                      <div style="font-size:13px;color:#666666;">${escapeHtml(isDaily ? "Ventas del día" : "Ventas semana")}</div>
                      <div style="font-size:15px;font-weight:bold;margin-bottom:8px;">${money(sales)}</div>
                      ${isDaily ? "" : `
                      <div style="font-size:13px;color:#666666;">Ventas mes pasado</div>
                      <div style="font-size:15px;font-weight:bold;margin-bottom:8px;">${money(num(data.last_month?.sales))}</div>`}
                      <div style="font-size:13px;color:#666666;">Promedio por pedido</div>
                      <div style="font-size:15px;font-weight:bold;">${money(averageOrder)}</div>
                    </div>
                  </td>
                  <td width="50%" valign="top" style="padding-left:8px;">
                    <div style="background-color:#faf7f2;border-radius:6px;padding:16px;">
                      <div style="font-size:14px;font-weight:bold;margin-bottom:12px;">💸 Gastos</div>
                      <div style="font-size:13px;color:#666666;">${escapeHtml(isDaily ? "Gastos del día" : "Gastos semana")}</div>
                      <div style="font-size:15px;font-weight:bold;margin-bottom:8px;">${money(isDaily ? num(data.expenses) : num(week.expenses))}</div>
                      ${isDaily ? "" : `
                      <div style="font-size:13px;color:#666666;">Gastos mes</div>
                      <div style="font-size:15px;font-weight:bold;">${money(num(expenses.monthly))}</div>`}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
${fiadoActive ? `
          <!-- Fiado y cartera -->
          ${block("💳 Fiado y cartera", [
            infoRow(`Vendido a fiado ${isWeek ? "esta semana" : "en el periodo"}`, `${money(num(credit.week_sales))} ${muted(ordersText(num(credit.week_orders)))}`),
            infoRow("Te pagaron de fiado", money(num(credit.week_collected))),
            infoRow("Por cobrar en total", money(num(credit.outstanding_balance)), true),
            overdue > 0 ? infoRow("⚠️ Vencido", `<span style="color:#c62828;">${money(overdue)}</span> ${muted(`(${overdueCustomers} ${overdueCustomers === 1 ? "cliente" : "clientes"})`)}`, true) : "",
          ].filter(Boolean).join(""), "0 24px 24px 24px", fiadoNote)}` : ""}
${isDaily ? "" : `
          <!-- Otros datos -->
          ${block("📋 Otros datos", [
            infoRow("Nuevos clientes", escapeHtml(String(num(data.new_customers))), true),
            infoRow("Productos con stock bajo", `<span style="color:${lowStock > 0 ? "#c62828" : "inherit"};">${escapeHtml(String(lowStock))}</span>`, true),
            infoRow("Pedidos pendientes", escapeHtml(String(num(data.pending_orders))), true),
          ].join(""))}`}

          <!-- Pie -->
          <tr>
            <td style="background-color:#faf7f2;padding:16px 24px;text-align:center;font-size:12px;color:#888888;">
              Reporte generado el ${escapeHtml(formatDate(data.report_date))}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
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
    // Los dos correos (semanal y diario) salen de la misma plantilla con los
    // datos por variables. El texto va aparte: ese es el que se pega en
    // WhatsApp, donde el HTML no sirve.
    const reportHtml = formatEmailHtml(data, isDailyReport);

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
