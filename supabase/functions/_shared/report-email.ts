// Plantilla del correo de reportes: diseno del dueno (negro y dorado)
// tomado de reporte_semanal_email.html.
//
// El original usa Tailwind por CDN con <script>: Gmail y Outlook borran
// los scripts y el CSS externo, asi que el correo se veria sin estilo.
// Aqui el mismo diseno se traduce a HTML de correo seguro: tablas con
// estilos en linea, sin scripts, sin recursos externos y con colores
// de respaldo donde el original usa degradados.
//
// El modulo es TypeScript puro (sin APIs de Deno): la funcion Edge lo
// importa y Node lo corre tal cual para las pruebas.
//
// Titulo dinamico: REPORTE DIARIO / SEMANAL / MENSUAL segun el rango.

const MONTHS_LONG = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const MONTHS_SHORT = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

const num = (value: unknown): number => Number(value ?? 0);

const has = (value: unknown): boolean => value !== undefined && value !== null;

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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Monto formateado y escapado, listo para el HTML. */
const money = (value: number): string => escapeHtml(formatCurrency(value));

/**
 * `product_name_snapshot` guarda la marca y la presentacion separadas por
 * comas. Sin limpiar, el correo imprime "Ariana Grande Ariana Grande...".
 */
function cleanProductName(raw: string | null | undefined): string {
  if (!raw || raw === "N/A") return "Sin ventas";
  const parts = String(raw).split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) return String(raw);
  return parts
    .filter((part, index) => index === 0 || part.toLowerCase() !== parts[0].toLowerCase())
    .join(" ");
}

/** Fecha corta 28/09/2026. Sin Date: que la zona horaria no corra el dia. */
function formatDate(iso: string | null | undefined): string {
  const text = String(iso ?? "").slice(0, 10);
  const parts = text.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : text;
}

type IsoParts = { year: number; month: number; day: number };

function parseIso(iso: string | null | undefined): IsoParts | null {
  const parts = String(iso ?? "").slice(0, 10).split("-");
  if (parts.length !== 3) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

const pad2 = (value: number): string => String(value).padStart(2, "0");

/** "28 de Septiembre" (sin anio). */
function longDay(iso: string | null | undefined): string {
  const parts = parseIso(iso);
  if (!parts) return "";
  return `${pad2(parts.day)} de ${MONTHS_LONG[parts.month - 1]}`;
}

/** "11 Oct, 2026" para la linea "Generado". */
function shortGenerated(iso: string | null | undefined): string {
  const parts = parseIso(iso);
  if (!parts) return "";
  return `${pad2(parts.day)} ${MONTHS_SHORT[parts.month - 1]}, ${parts.year}`;
}

/** "11 de Octubre de 2026" para el pie. */
function longFullDate(iso: string | null | undefined): string {
  const parts = parseIso(iso);
  if (!parts) return "";
  return `${parts.day} de ${MONTHS_LONG[parts.month - 1]} de ${parts.year}`;
}

/**
 * Numero de semana ISO (1..53) de una fecha AAAA-MM-DD. Se usa el jueves
 * mas cercano y la semana arranca en lunes, igual que el calendario ISO.
 */
function isoWeek(iso: string | null | undefined): number {
  const parts = parseIso(iso);
  if (!parts) return 0;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const dayNum = (date.getUTCDay() + 6) % 7; // lunes = 0
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // jueves de esa semana
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
}

/** Dia del anio (1..366) del reporte diario. */
function dayOfYear(iso: string | null | undefined): number {
  const parts = parseIso(iso);
  if (!parts) return 0;
  const start = Date.UTC(parts.year, 0, 1);
  const current = Date.UTC(parts.year, parts.month - 1, parts.day);
  return Math.round((current - start) / 86400000) + 1;
}

/**
 * Titulo del correo. El dueno pide REPORTE SEMANAL / DIARIO / MENSUAL
 * segun el reporte escogido; un rango mas largo que un mes no cabe en
 * esas tres y se nombra por su duracion.
 */
export function reportEmailTitle(isDaily: boolean, periodDays: number): string {
  if (isDaily || periodDays <= 1) return "REPORTE DIARIO";
  if (periodDays <= 7) return "REPORTE SEMANAL";
  if (periodDays <= 31) return "REPORTE MENSUAL";
  return `REPORTE DE ${Math.round(periodDays)} DÍAS`;
}

/** "Reporte N° 40-2026": semana ISO, dia del anio o numero de mes. */
function reportNumber(isDaily: boolean, periodDays: number, endIso: string): string {
  const parts = parseIso(endIso);
  const year = parts ? parts.year : "";
  if (isDaily) return `${dayOfYear(endIso)}-${year}`;
  if (periodDays <= 7) return `${isoWeek(endIso)}-${year}`;
  if (periodDays <= 31) return `${parts ? parts.month : 0}-${year}`;
  return `${isoWeek(endIso)}-${year}`;
}

/** "28 de Septiembre al 04 de Octubre, 2026" (o el dia, si es diario). */
function periodRangeLabel(isDaily: boolean, startIso: string, endIso: string): string {
  if (isDaily) {
    const parts = parseIso(endIso);
    if (!parts) return "";
    return `${longDay(endIso)}, ${parts.year}`;
  }
  const start = parseIso(startIso);
  const end = parseIso(endIso);
  if (!start || !end) return "";
  const left = `${longDay(startIso)}${start.year !== end.year ? `, ${start.year}` : ""}`;
  return `${left} al ${longDay(endIso)}, ${end.year}`;
}

/** Como se le llama al rango en los textos: "de la Semana", "del Dia"... */
function periodWords(isDaily: boolean, periodDays: number): { long: string; short: string; word: string } {
  if (isDaily || periodDays <= 1) return { long: "del Día", short: "del día", word: "DÍA" };
  if (periodDays <= 7) return { long: "de la Semana", short: "de la semana", word: "SEMANA" };
  if (periodDays <= 31) return { long: "del Mes", short: "del mes", word: "MES" };
  return { long: "del Periodo", short: "del periodo", word: "PERIODO" };
}

/** Pastilla redondeada (badge) del diseno. */
function pill(text: string, bg: string, color: string, border: string): string {
  return `<span style="display:inline-block;background-color:${bg};color:${color};border:1px solid ${border};border-radius:999px;padding:3px 9px;font-size:11px;font-weight:700;">${escapeHtml(text)}</span>`;
}

const PILL_EMERALD = { bg: "#d1fae5", color: "#047857", border: "#a7f3d0" };
const PILL_ROSE = { bg: "#ffe4e6", color: "#be123c", border: "#fecdd3" };
const PILL_BLUE = { bg: "#dbeafe", color: "#1d4ed8", border: "#bfdbfe" };
const PILL_SLATE = { bg: "#f1f5f9", color: "#334155", border: "#e2e8f0" };
const PILL_AMBER = { bg: "#fef3c7", color: "#92400e", border: "#fde68a" };

type PillColors = { bg: string; color: string; border: string };

const pillHtml = (text: string, tone: PillColors): string => pill(text, tone.bg, tone.color, tone.border);

/**
 * Variacion honesta: un porcentaje solo tiene sentido si hay base de
 * comparacion. Con periodo anterior en cero no se imprime "+100%".
 */
function variationBadge(current: number, previous: number): { text: string; tone: PillColors } {
  if (previous <= 0) {
    return current > 0
      ? { text: "📈 Sin periodo previo", tone: PILL_SLATE }
      : { text: "Sin cambios", tone: PILL_SLATE };
  }
  const diff = current - previous;
  if (diff === 0) return { text: "Sin cambios", tone: PILL_SLATE };
  const percent = Math.abs((diff / previous) * 100).toFixed(1);
  return diff > 0
    ? { text: `📈 +${percent}%`, tone: PILL_EMERALD }
    : { text: `📉 -${percent}%`, tone: PILL_ROSE };
}

/** Crecimiento neto de la tarjeta de ingresos (numero y porcentaje). */
function growthText(current: number, previous: number): { html: string; tone: PillColors } {
  if (previous <= 0) {
    return current > 0
      ? { html: "Sin periodo previo para comparar", tone: PILL_SLATE }
      : { html: "Sin cambios", tone: PILL_SLATE };
  }
  const diff = current - previous;
  if (diff === 0) return { html: "Sin cambios", tone: PILL_SLATE };
  const percent = Math.abs((diff / previous) * 100).toFixed(1);
  return diff > 0
    ? { html: `+${formatCurrency(diff)} (+${percent}%)`, tone: PILL_EMERALD }
    : { html: `-${formatCurrency(Math.abs(diff))} (-${percent}%)`, tone: PILL_ROSE };
}

/** Titulo de seccion con el punto dorado del diseno. */
function heading(title: string, dot = "#d97706"): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
    <tr>
      <td style="padding:0 0 12px 0;font-size:13px;font-weight:900;letter-spacing:1px;text-transform:uppercase;color:#0f172a;">
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background-color:${dot};margin-right:8px;"></span>${escapeHtml(title)}
      </td>
    </tr>
  </table>`;
}

/** Titulo de seccion con etiqueta a la derecha ("Resumen Ejecutivo"). */
function headingWithRight(title: string, rightText: string, dot = "#d97706"): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
    <tr>
      <td style="padding:0 0 12px 0;font-size:13px;font-weight:900;letter-spacing:1px;text-transform:uppercase;color:#0f172a;">
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background-color:${dot};margin-right:8px;"></span>${escapeHtml(title)}
      </td>
      <td align="right" style="padding:0 0 12px 0;font-size:11px;font-weight:500;color:#64748b;vertical-align:middle;">${rightText}</td>
    </tr>
  </table>`;
}

/** Tarjeta blanca con borde del diseno. */
function card(inner: string, bg = "#ffffff", border = "#e2e8f0", radius = "12px", padding = "14px 16px"): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:${bg};border:1px solid ${border};border-radius:${radius};">
    <tr><td style="padding:${padding};">${inner}</td></tr>
  </table>`;
}

/** Fila etiqueta/valor de las tarjetas financieras. */
function financeRow(label: string, valueHtml: string, options: { muted?: boolean; last?: boolean; labelBold?: boolean } = {}): string {
  const border = options.last ? "" : "border-bottom:1px solid #f1f5f9;";
  const labelStyle = options.labelBold
    ? "font-weight:700;color:#0f172a;"
    : "color:#475569;";
  const valueStyle = options.muted
    ? "color:#94a3b8;font-weight:600;"
    : "color:#0f172a;font-weight:700;";
  return `<tr>
    <td style="padding:9px 0;${border}font-size:13px;${labelStyle}">${escapeHtml(label)}</td>
    <td align="right" style="padding:9px 0;${border}font-size:13px;${valueStyle}">${valueHtml}</td>
  </tr>`;
}

/** Espaciador entre secciones (mas confiable que margin en Outlok). */
const spacer = (height = 26): string =>
  `<tr><td style="height:${height}px;line-height:${height}px;font-size:0;">&nbsp;</td></tr>`;

/**
 * Fila de tres tarjetas KPI (en movil se apilan con la media query).
 */
function kpiRow(first: string, second: string, third: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
    <tr>
      <td class="col3" width="33%" valign="top" style="width:33%;padding:0 6px 12px 0;">${first}</td>
      <td class="col3" width="33%" valign="top" style="width:33%;padding:0 6px 12px 6px;">${second}</td>
      <td class="col3" width="34%" valign="top" style="width:34%;padding:0 0 12px 6px;">${third}</td>
    </tr>
  </table>`;
}

/** Fila de dos tarjetas (en movil se apilan). */
function duoRow(left: string, right: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
    <tr>
      <td class="col2" width="50%" valign="top" style="width:50%;padding:0 7px 0 0;">${left}</td>
      <td class="col2" width="50%" valign="top" style="width:50%;padding:0 0 0 7px;">${right}</td>
    </tr>
  </table>`;
}

/** Barra de porcentaje de canal (tabla: funciona en Gmail y Outlok). */
function channelBar(percent: number, color: string): string {
  const safe = Math.max(0, Math.min(100, Math.round(percent)));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:#f1f5f9;border-radius:999px;overflow:hidden;">
    <tr>
      <td width="${safe}%" style="width:${safe}%;background-color:${color};height:10px;line-height:10px;font-size:0;">&nbsp;</td>
      <td width="${100 - safe}%" style="width:${100 - safe}%;background-color:#f1f5f9;height:10px;line-height:10px;font-size:0;">&nbsp;</td>
    </tr>
  </table>`;
}

/**
 * Plantilla completa del correo.
 *
 * Reglas de negocio que no se pueden romper:
 * - Sin costo registrado la utilidad se declara "Incompleta": nunca se
 *   rellena con cero ni se muestra un numero inflado.
 * - La utilidad mostrada es cobrada: ventas pagadas + abonos de fiado -
 *   costo de producto - domicilio - gastos. El costo del fiado no se
 *   descuenta (se explica aparte: no es perdida, es inversion que vuelve
 *   al cobrar).
 * - El diario omite comparaciones: no tiene con que comparar.
 */
export function formatEmailHtml(data: any, isDaily: boolean): string {
  const week = data?.current_week ?? {};
  const previous = data?.previous_week ?? {};
  const credit = data?.credit ?? {};
  const expenses = data?.expenses ?? {};
  const periodDays = isDaily ? 1 : num(data?.period?.days ?? 7);
  const isWeek = periodDays <= 7;
  const words = periodWords(isDaily, periodDays);
  const title = reportEmailTitle(isDaily, periodDays);

  const startDate = isDaily ? String(data?.report_date ?? "") : String(data?.week_start ?? "");
  const endDate = isDaily ? String(data?.report_date ?? "") : String(data?.week_end ?? "");
  const reportDate = String(data?.report_date ?? "");

  // ---------------------------------------------------------------
  // Numeros base (diario y periodo comparten formulas)
  // ---------------------------------------------------------------
  const sales = isDaily ? num(data?.sales) : num(week.sales);
  const orders = isDaily ? num(data?.orders) : num(week.orders);
  const itemsSold = isDaily ? num(data?.items_sold) : num(week.items_sold);
  const productCost = isDaily ? num(data?.product_cost) : num(week.product_cost);
  const deliveryCost = isDaily ? num(data?.delivery_cost) : num(week.delivery_cost);
  const periodExpenses = isDaily ? num(data?.expenses) : num(week.expenses);
  const monthExpenses = isDaily ? num(data?.monthly_expenses) : num(expenses.monthly);
  const missingCost = isDaily ? num(data?.missing_cost_items) : num(week.missing_cost_items);
  const creditCost = isDaily ? 0 : num(week.credit_cost);
  const creditCollected = isDaily ? 0 : num(week.credit_collected);
  const cashCollected = isDaily ? sales : num(week.cash_collected ?? (sales + creditCollected));
  const prevSales = isDaily ? 0 : num(previous.sales);
  const prevOrders = isDaily ? 0 : num(previous.orders);

  const averageOrder = isDaily
    ? (orders > 0 ? sales / orders : 0)
    : num(week.average_order_value);

  // Utilidad cobrada: sin costo completo no hay numero que defender.
  // Los abonos de fiado que siguen abiertos ya entraron a la caja.
  const cashProfit = cashCollected - productCost - deliveryCost - periodExpenses;
  const profitComplete = missingCost === 0;
  const margin = profitComplete && cashCollected > 0 ? (cashProfit / cashCollected) * 100 : null;

  const variation = variationBadge(sales, prevSales);
  const growth = growthText(sales, prevSales);

  // ---------------------------------------------------------------
  // Clientes, canales, inventario
  // ---------------------------------------------------------------
  const hasChannels = Array.isArray(data?.channels) && has(data?.buyers);
  const channels: Array<{ channel?: string; orders?: number; revenue?: number }> =
    Array.isArray(data?.channels) ? data.channels : [];
  const buyersNew = has(data?.buyers) ? num(data.buyers?.new) : null;
  const buyersReturning = has(data.buyers) ? num(data.buyers?.returning) : null;
  const buyersTotal = (buyersNew ?? 0) + (buyersReturning ?? 0);
  const buyersPct = buyersTotal > 0 ? Math.round(((buyersNew ?? 0) / buyersTotal) * 100) : null;

  const newCustomers = has(data?.new_customers) ? num(data.new_customers) : null;
  const pendingOrders = has(data?.pending_orders) ? num(data.pending_orders) : null;
  const lowStock = has(data?.low_stock_count) ? num(data.low_stock_count) : null;
  const lowStockList: Array<{ name?: string; stock?: number; min_stock?: number }> =
    Array.isArray(data?.low_stock_products) ? data.low_stock_products : [];

  // ---------------------------------------------------------------
  // Productos
  // ---------------------------------------------------------------
  const topProducts: Array<{ name?: string; quantity?: number; revenue?: number; family?: string }> =
    Array.isArray(data?.top_products) ? data.top_products : [];
  const bestRaw = isDaily ? data?.best_product : data?.best_product_this_week;
  const bestName = cleanProductName(topProducts[0]?.name ?? bestRaw?.name);
  const bestQty = num(topProducts[0]?.quantity ?? bestRaw?.quantity);
  const bestFamily = topProducts[0]?.family ?? "";
  const bestRevenue = has(topProducts[0]?.revenue) ? num(topProducts[0]?.revenue) : null;
  const restProducts = topProducts.slice(1);

  // ---------------------------------------------------------------
  // Encabezado
  // ---------------------------------------------------------------
  const reportNumberText = reportNumber(isDaily, periodDays, endDate || reportDate);
  const rangeLabel = periodRangeLabel(isDaily, startDate, endDate);

  // ---------------------------------------------------------------
  // 1. KPIs
  // ---------------------------------------------------------------
  const kpiSalesFooter = isDaily
    ? `${itemsSold} ${itemsSold === 1 ? "unidad vendida" : "unidades vendidas"}`
    : `${isWeek ? "Semana" : "Periodo"} anterior: ${money(prevSales)} (${prevOrders} ${prevOrders === 1 ? "ped" : "peds"})`;

  const kpiSales = card(`
    <div style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#065f46;">Ventas Totales</div>
    <div style="font-size:24px;font-weight:900;color:#0f172a;margin-top:6px;line-height:1.15;">${money(sales)} <span style="font-size:11px;font-weight:700;color:#94a3b8;">COP</span></div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:10px;">
      <tr>
        <td style="font-size:12px;color:#475569;font-weight:600;">${orders} ${orders === 1 ? "Pedido" : "Pedidos"}</td>
        <td align="right">${isDaily ? "" : pillHtml(variation.text, variation.tone)}</td>
      </tr>
    </table>
    <div style="border-top:1px solid #d1fae5;margin-top:10px;padding-top:8px;font-size:11px;color:#64748b;">${escapeHtml(kpiSalesFooter)}</div>
    ${!isDaily && creditCollected > 0
      ? `<div style="font-size:11px;color:#047857;margin-top:4px;font-weight:600;">+ Abonos de fiado: ${money(creditCollected)} · Total cobrado: ${money(cashCollected)}</div>`
      : ""}
  `, "#f0fdf9", "#a7f3d0");

  const kpiTicket = card(`
    <div style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#64748b;">Ticket Promedio</div>
    <div style="font-size:24px;font-weight:900;color:#0f172a;margin-top:6px;line-height:1.15;">${money(averageOrder)} <span style="font-size:11px;font-weight:700;color:#94a3b8;">COP</span></div>
    <div style="font-size:12px;color:#475569;font-weight:600;margin-top:8px;">Promedio por pedido ${words.short}</div>
    <div style="border-top:1px solid #f1f5f9;margin-top:10px;padding-top:8px;font-size:11px;color:#64748b;">Muestra de ${orders} ${orders === 1 ? "transacción" : "transacciones"}</div>
  `, "#f8fafc", "#e2e8f0");

  const profitValue = profitComplete
    ? `<span style="color:${cashProfit < 0 ? "#dc2626" : "#059669"};">${money(cashProfit)}</span> <span style="font-size:11px;font-weight:700;color:#94a3b8;">COP</span>`
    : `<span style="color:#b45309;">Incompleta</span>`;

  const kpiProfit = card(`
    <div style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#92400e;">Ganancia Neta Est.</div>
    <div style="font-size:24px;font-weight:900;color:#0f172a;margin-top:6px;line-height:1.15;">${profitValue}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:8px;">
      <tr>
        <td style="font-size:12px;color:#475569;">Gastos ${words.short}:</td>
        <td align="right" style="font-size:12px;font-weight:700;color:#0f172a;">${money(periodExpenses)}</td>
      </tr>
    </table>
    ${profitComplete
      ? `<div style="border-top:1px solid #fef3c7;margin-top:10px;padding-top:8px;font-size:11px;color:#64748b;">Gastos mes ac.: ${money(monthExpenses)}</div>`
      : `<div style="border-top:1px solid #fef3c7;margin-top:10px;padding-top:8px;font-size:11px;color:#b45309;font-weight:600;">⚠️ ${missingCost} ${missingCost === 1 ? "pedido no tiene" : "pedidos no tienen"} costo registrado</div>`}
  `, "#fffbeb", "#fde68a");

  const newClientsBadge = newCustomers === null
    ? pillHtml("s/d", PILL_SLATE)
    : newCustomers > 0
      ? pillHtml(`+${newCustomers} Nuevos`, PILL_BLUE)
      : pillHtml("Sin nuevos", PILL_SLATE);
  const kpiClients = card(`
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      <tr>
        <td style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#64748b;">Nuevos Clientes</td>
        <td align="right">${newClientsBadge}</td>
      </tr>
    </table>
    <div style="font-size:30px;font-weight:900;color:#0f172a;margin-top:8px;line-height:1.1;">${newCustomers === null ? "—" : newCustomers}</div>
    <div style="font-size:12px;color:#64748b;margin-top:4px;">${buyersPct !== null
      ? `${buyersPct}% de los compradores ${words.short}`
      : newCustomers !== null
        ? `Registros en el periodo: ${newCustomers}`
        : "No disponible en este envío"}</div>
  `);

  const pendingBadge = pendingOrders === null
    ? pillHtml("s/d", PILL_SLATE)
    : pendingOrders === 0
      ? pillHtml("Al día", PILL_EMERALD)
      : pillHtml(`${pendingOrders} pendientes`, PILL_ROSE);
  const kpiPending = card(`
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      <tr>
        <td style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#64748b;">Pedidos Pendientes</td>
        <td align="right">${pendingBadge}</td>
      </tr>
    </table>
    <div style="font-size:30px;font-weight:900;color:#0f172a;margin-top:8px;line-height:1.1;">${pendingOrders === null ? "—" : pendingOrders}</div>
    <div style="font-size:12px;color:#64748b;margin-top:4px;">${pendingOrders === null
      ? "No disponible en este envío"
      : pendingOrders === 0
        ? "Todos los pedidos procesados y despachados"
        : "Requiere gestión desde el panel"}</div>
  `);

  const lowStockBadge = lowStock === null
    ? pillHtml("s/d", PILL_SLATE)
    : lowStock > 0
      ? pillHtml("Urgente", PILL_ROSE)
      : pillHtml("Sano", PILL_EMERALD);
  const kpiStock = card(`
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      <tr>
        <td style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#9f1239;">Stock Bajo</td>
        <td align="right">${lowStockBadge}</td>
      </tr>
    </table>
    <div style="font-size:30px;font-weight:900;color:#e11d48;margin-top:8px;line-height:1.1;">${lowStock === null ? "—" : lowStock} <span style="font-size:12px;font-weight:600;color:#475569;">ítems</span></div>
    <div style="font-size:12px;margin-top:4px;font-weight:600;color:${lowStock === null ? "#64748b" : lowStock > 0 ? "#be123c" : "#047857"};">${lowStock === null
      ? "No disponible en este envío"
      : lowStock > 0
        ? "Requiere plan de reorden inmediata"
        : "Inventario por encima del mínimo"}</div>
  `, "#fff1f2", "#fecdd3");

  const kpisSection = `
          ${headingWithRight(`1. Dashboard de Métricas Clave (KPIs)`, "Resumen Ejecutivo")}
          ${kpiRow(kpiSales, kpiTicket, kpiProfit)}
          ${kpiRow(kpiClients, kpiPending, kpiStock)}`;

  // ---------------------------------------------------------------
  // 2. Productos vendidos
  // ---------------------------------------------------------------
  const totalUnitsBadge = pillHtml(
    `Total: ${itemsSold} ${itemsSold === 1 ? "unidad" : "unidades"}`,
    PILL_AMBER
  );

  const noSales = bestQty <= 0 && sales <= 0;

  const featured = `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:#0f172a;background-image:linear-gradient(90deg,#020617 0%,#0f172a 60%,#1e293b 100%);border:1px solid #b45309;border-radius:16px;margin-bottom:12px;">
            <tr>
              <td style="padding:18px 20px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                  <tr>
                    <td class="feat" width="52" valign="top" style="width:52px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                        <td style="background-color:#d97706;border-radius:12px;width:48px;height:48px;line-height:48px;text-align:center;font-size:22px;">👑</td>
                      </tr></table>
                    </td>
                    <td class="feat" style="padding:0 0 0 14px;" valign="middle">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:6px;"><tr>
                        <td style="background-color:#1c1403;border:1px solid #b45309;border-radius:999px;padding:3px 10px;font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#fcd34d;">Producto más vendido / Destacado</td>
                      </tr></table>
                      <div style="font-size:17px;font-weight:800;color:#ffffff;line-height:1.3;">${escapeHtml(noSales ? "Sin ventas registradas en el periodo" : bestName)}</div>
                      ${noSales ? "" : `<div style="font-size:12px;color:#cbd5e1;margin-top:3px;">Líder de ventas ${escapeHtml(words.short)}${bestFamily ? ` · ${escapeHtml(bestFamily)}` : ""}</div>`}
                    </td>
                    ${noSales ? "" : `<td class="feat" align="right" valign="middle" style="padding-left:12px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background-color:#262d3a;border:1px solid #3b4557;border-radius:12px;"><tr>
                        <td style="padding:10px 16px;text-align:right;">
                          <div style="font-size:11px;color:#cbd5e1;">Ventas registradas</div>
                          <div style="font-size:15px;font-weight:800;color:#fcd34d;margin-top:2px;">${bestQty} ${bestQty === 1 ? "Unidad" : "Unidades"}${bestRevenue !== null ? ` <span style="font-size:11px;font-weight:600;color:#e2e8f0;">(~${money(bestRevenue)})</span>` : ""}</div>
                        </td>
                      </tr></table>
                    </td>`}
                  </tr>
                </table>
              </td>
            </tr>
          </table>`;

  const productList = restProducts.length > 0 ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            ${restProducts.map((product, index) => {
              const quantity = num(product.quantity);
              return `<tr>
                <td style="padding:12px 16px;${index < restProducts.length - 1 ? "border-bottom:1px solid #f1f5f9;" : ""}">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                    <tr>
                      <td width="34" valign="middle" style="width:34px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                          <td style="background-color:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;width:30px;height:30px;line-height:30px;text-align:center;font-size:11px;font-weight:800;color:#334155;">#${index + 2}</td>
                        </tr></table>
                      </td>
                      <td style="padding:0 0 0 12px;">
                        <div style="font-size:14px;font-weight:700;color:#0f172a;">${escapeHtml(cleanProductName(product.name))}</div>
                        ${product.family ? `<div style="font-size:12px;color:#64748b;margin-top:2px;">${escapeHtml(product.family)}</div>` : ""}
                      </td>
                      <td align="right" valign="middle">${pillHtml(`${quantity} ${quantity === 1 ? "unidad" : "unidades"}`, PILL_SLATE)}</td>
                    </tr>
                  </table>
                </td>
              </tr>`;
            }).join("")}
          </table>` : "";

  const productsSection = `
          ${headingWithRight(`2. Productos Vendidos ${words.long}`, totalUnitsBadge, "#d97706")}
          ${featured}
          ${productList}`;

  // ---------------------------------------------------------------
  // 3. Resumen financiero
  // ---------------------------------------------------------------
  const ingresosRows = isDaily
    ? [
        financeRow("Ventas del día", `<span style="color:#059669;">${money(sales)}</span>`),
        financeRow("Ticket promedio", money(averageOrder)),
        financeRow("Unidades vendidas", String(itemsSold), { last: true }),
      ].join("")
    : [
        financeRow(`${isWeek ? "Ventas de la semana" : "Ventas del periodo"}`, `<span style="color:#059669;">${money(sales)}</span>`),
        ...(creditCollected > 0
          ? [
              financeRow("Abonos de fiado", `<span style="color:#059669;">${money(creditCollected)}</span>`),
              financeRow("Total cobrado", `<span style="color:#059669;">${money(cashCollected)}</span>`),
            ]
          : []),
        financeRow("Ventas periodo anterior", money(prevSales), { muted: true }),
        financeRow("Crecimiento neto", pillHtml(growth.html, growth.tone), { labelBold: true, last: true }),
      ].join("");

  const gastosRows = [
    financeRow(`Gastos ${words.short}`, money(periodExpenses)),
    financeRow("Gastos acumulados mes", money(monthExpenses)),
    financeRow("Costo domicilio", money(deliveryCost), { last: true }),
  ].join("");

  const ingresosCard = card(`
    <div style="font-size:12px;font-weight:900;letter-spacing:1px;text-transform:uppercase;color:#334155;margin-bottom:6px;">💵 Resumen de Ingresos</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${ingresosRows}</table>
  `);

  const gastosCard = card(`
    <div style="font-size:12px;font-weight:900;letter-spacing:1px;text-transform:uppercase;color:#334155;margin-bottom:6px;">💸 Resumen de Gastos</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${gastosRows}</table>
  `);

  const calcLine = creditCollected > 0
    ? `Calculado: Ventas pagadas (${money(sales)}) + Abonos fiado (${money(creditCollected)}) − Costos (${money(productCost + deliveryCost)}) − Gastos (${money(periodExpenses)})`
    : `Calculado: Ventas (${money(sales)}) − Costos (${money(productCost + deliveryCost)}) − Gastos (${money(periodExpenses)})`;

  const profitBand = `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:#0f172a;background-image:linear-gradient(90deg,#064e3b 0%,#0f172a 55%,#020617 100%);border:2px solid #059669;border-radius:16px;margin-top:12px;">
            <tr>
              <td style="padding:20px 24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                  <tr>
                    <td class="bandcol" valign="middle">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;"><tr>
                        <td style="background-color:#022c22;border:1px solid #059669;border-radius:999px;padding:4px 12px;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#34d399;">💰 Balance Final de Ganancia</td>
                      </tr></table>
                      <div style="font-size:19px;font-weight:900;color:#ffffff;">Utilidad Neta ${words.long}</div>
                      <div style="font-size:12px;color:#cbd5e1;margin-top:6px;">${profitComplete ? calcLine : `${escapeHtml(calcLine)} · ⚠️ Costos incompletos: el número real puede ser distinto.`}</div>
                    </td>
                    <td class="bandcol" align="right" valign="middle" style="padding-left:16px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background-color:#022c22;border:1px solid #059669;border-radius:12px;"><tr>
                        <td style="padding:14px 18px;text-align:left;">
                          <div style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#6ee7b7;">Ganancia Libre Neta</div>
                          <div style="font-size:26px;font-weight:900;color:${profitComplete ? (cashProfit < 0 ? "#f87171" : "#34d399") : "#fcd34d"};margin-top:4px;line-height:1.15;">${profitComplete ? money(cashProfit) : "Incompleta"}${profitComplete ? ` <span style="font-size:11px;font-weight:700;color:#6ee7b7;">COP</span>` : ""}</div>
                          <div style="margin-top:8px;">${profitComplete && margin !== null
                            ? pillHtml(`✨ ${margin.toFixed(1)}% Margen Neto`, { bg: "#064e3b", color: "#6ee7b7", border: "#059669" })
                            : pillHtml("⚠️ Costos incompletos", { bg: "#422006", color: "#fcd34d", border: "#b45309" })}</div>
                        </td>
                      </tr></table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>`;

  // El costo del fiado ya salio de la caja pero la plata no entra hasta
  // que paguen: no es perdida, es inversion que vuelve al cobrar.
  const fiadoNote = creditCost > 0
    ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:#fffbeb;border:1px solid #fde68a;border-radius:12px;margin-top:12px;">
            <tr>
              <td style="padding:12px 16px;font-size:13px;line-height:1.55;color:#78350f;">
                Vendiste ${money(num(credit.week_sales))} a fiado ${isWeek ? "esta semana" : "en el periodo"}: el producto ya salió y su costo ya salió de la caja, pero la plata entra cuando te paguen.
                ${creditCollected > 0 ? `De eso ya te abonaron ${money(creditCollected)}.` : ""}
                <strong>No es pérdida: es inversión que vuelve al cobrar.</strong>
              </td>
            </tr>
          </table>`
    : "";

  const financialSection = `
          ${heading(`3. Resumen Financiero ${words.long}`)}
          ${duoRow(ingresosCard, gastosCard)}
          ${profitBand}
          ${fiadoNote}`;

  // ---------------------------------------------------------------
  // 4. Alertas de inventario
  // ---------------------------------------------------------------
  const visibleAlerts = lowStockList.slice(0, 4);
  const extraAlerts = (lowStock ?? 0) - visibleAlerts.length;

  const alertRows = visibleAlerts.map((item) => {
    const stock = num(item.stock);
    const isOut = stock <= 0;
    const isCritical = stock === 1;
    const row = isOut
      ? { bg: "#1e293b", border: "#fb7185", name: "#ffffff", note: "#fb7185", noteText: "⚠️ Alta demanda - Sin existencias", pill: { bg: "#4c0519", color: "#fda4af", border: "#fb7185" } }
      : isCritical
        ? { bg: "#1e293b", border: "#f59e0b", name: "#e2e8f0", note: "#fbbf24", noteText: "Riesgo de agotamiento", pill: { bg: "#451a03", color: "#fcd34d", border: "#f59e0b" } }
        : { bg: "#1e293b", border: "#334155", name: "#cbd5e1", note: "#94a3b8", noteText: "Poca disponibilidad", pill: { bg: "#334155", color: "#cbd5e1", border: "#475569" } };
    const pillText = isOut
      ? "0 un. (Agotado — Reponer ya)"
      : `${stock} un. (${isCritical ? "Stock Crítico" : "Poco Stock"})`;
    return `<tr>
                      <td style="padding:5px 0;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:${row.bg};border:1px solid ${row.border};border-radius:12px;">
                          <tr>
                            <td style="padding:11px 14px;">
                              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                                <tr>
                                  <td>
                                    <div style="font-size:14px;font-weight:700;color:${row.name};">${escapeHtml(item.name ?? "")}</div>
                                    <div style="font-size:11px;color:${row.note};margin-top:2px;font-weight:500;">${row.noteText}</div>
                                  </td>
                                  <td align="right" valign="middle">${pillHtml(pillText, row.pill)}</td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>`;
  }).join("");

  const inventoryCard = lowStock !== null && lowStock > 0 ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:#0f172a;border:1px solid #1e293b;border-radius:16px;">
            <tr>
              <td style="padding:18px 20px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:8px;">
                  <tr>
                    <td style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#94a3b8;border-bottom:1px solid #1e293b;padding-bottom:10px;">Producto / referencia</td>
                    <td align="right" style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#94a3b8;border-bottom:1px solid #1e293b;padding-bottom:10px;">Estado / Cantidad</td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                  ${alertRows}
                </table>
                ${extraAlerts > 0
                  ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:8px;">
                      <tr><td align="center" style="border-top:1px solid #1e293b;padding-top:12px;font-size:12px;color:#94a3b8;">+${extraAlerts} ${extraAlerts === 1 ? "producto adicional configurado" : "productos adicionales configurados"} en umbral mínimo de stock.</td></tr>
                    </table>`
                  : ""}
              </td>
            </tr>
          </table>`
          : `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:#052e16;border:1px solid #166534;border-radius:16px;">
            <tr>
              <td align="center" style="padding:18px 20px;font-size:13px;color:#86efac;font-weight:600;">✅ Inventario sano: ningún producto por debajo del mínimo.</td>
            </tr>
          </table>`;

  const inventorySection = lowStock === null
    ? ""
    : lowStock > 0
      ? `
          ${heading(`4. Alertas de Inventario Crítico (Total: ${lowStock} ${lowStock === 1 ? "Producto" : "Productos"} en Alerta)`, "#e11d48")}
          ${inventoryCard}`
      : `
          ${heading(`4. Inventario Sin Alertas`, "#059669")}
          ${inventoryCard}`;

  // ---------------------------------------------------------------
  // 5. Canales de venta y clientes
  // ---------------------------------------------------------------
  const channelRows = [
    { key: "direct", label: "📲 WhatsApp / Panel", color: "#10b981" },
    { key: "web", label: "🌐 Tienda Online", color: "#3b82f6" },
  ].map((definition) => {
    const found = channels.find((entry) => entry.channel === definition.key);
    const revenue = num(found?.revenue);
    const orderCount = num(found?.orders);
    const totalRevenue = channels.reduce((sum, entry) => sum + num(entry.revenue), 0);
    const percent = totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0;
    return `<div style="margin-bottom:14px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:6px;">
                        <tr>
                          <td style="font-size:12px;font-weight:800;color:#0f172a;">${definition.label}</td>
                          <td align="right" style="font-size:12px;font-weight:800;color:${definition.color};">${Math.round(percent)}% (${orderCount} ${orderCount === 1 ? "pedido" : "pedidos"})</td>
                        </tr>
                      </table>
                      ${channelBar(percent, definition.color)}
                    </div>`;
  }).join("");

  const channelsCard = card(`
    <div style="font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#64748b;margin-bottom:12px;">Distribución por Canal</div>
    ${hasChannels && channels.length > 0 ? channelRows : `<div style="font-size:12px;color:#94a3b8;">${sales > 0 ? "Sin ventas por canal en el periodo." : "Sin ventas registradas en el periodo."}</div>`}
  `);

  const audienceFooter = (buyersNew ?? 0) > 0
    ? `💡 Oportunidad: Implementar flujo de retención a 30 días para ${buyersNew} ${buyersNew === 1 ? "nuevo cliente" : "nuevos clientes"}.`
    : (buyersReturning ?? 0) > 0
      ? `💡 Sin clientes nuevos: cuida a los ${buyersReturning} ${buyersReturning === 1 ? "recurrente" : "recurrentes"} con una oferta de recompra.`
      : "💡 Sin compradores registrados en el periodo.";

  const audienceCard = card(`
    <div style="font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#64748b;margin-bottom:10px;">Comportamiento de Audiencia</div>
    ${hasChannels ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      <tr>
        <td style="font-size:13px;color:#475569;padding:7px 0;border-bottom:1px solid #f1f5f9;">Nuevos compradores:</td>
        <td align="right" style="padding:7px 0;border-bottom:1px solid #f1f5f9;">${pillHtml(`${buyersNew} ${buyersNew === 1 ? "cliente" : "clientes"}`, PILL_BLUE)}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#475569;padding:7px 0;">Clientes recurrentes:</td>
        <td align="right" style="font-size:13px;font-weight:700;color:#64748b;padding:7px 0;">${buyersReturning} ${buyersReturning === 1 ? "cliente" : "clientes"}</td>
      </tr>
    </table>
    <div style="border-top:1px solid #f1f5f9;margin-top:10px;padding-top:10px;font-size:11px;color:#64748b;">${escapeHtml(audienceFooter)}</div>`
    : `<div style="font-size:12px;color:#94a3b8;">Sin desglose de clientes en este envío.</div>`}
  `);

  const channelsSection = hasChannels
    ? `
          ${heading(`5. Canales de Venta & Clientes Captados`)}
          ${duoRow(channelsCard, audienceCard)}`
    : "";

  // ---------------------------------------------------------------
  // 6. Plan de accion
  // ---------------------------------------------------------------
  const firstAlert = visibleAlerts[0]?.name ? cleanProductName(visibleAlerts[0].name) : "";
  const secondAlert = visibleAlerts[1]?.name ? cleanProductName(visibleAlerts[1].name) : "";
  const restockText = (lowStock ?? 0) > 0 && firstAlert
    ? secondAlert
      ? `Enviar orden de compra a proveedores dando máxima prioridad a <em>${escapeHtml(firstAlert)}</em> y <em>${escapeHtml(secondAlert)}</em>.`
      : `Enviar orden de compra a proveedor para <em>${escapeHtml(firstAlert)}</em>.`
    : lowStock === null
      ? "Sin datos de inventario en este envío: revisa el panel antes de comprar."
      : "No hay productos en alerta: mantén el nivel actual de inventario.";

  const postSaleCount = buyersNew ?? newCustomers ?? 0;
  const postSaleTitle = postSaleCount > 0
    ? `Secuencia de post-venta para ${postSaleCount} ${postSaleCount === 1 ? "nuevo cliente" : "nuevos clientes"}`
    : "Secuencia de post-venta";
  const postSaleText = postSaleCount > 0
    ? "Enviar mensajes directos por WhatsApp con recomendaciones de cuidado de perfumes e incentivo de segunda compra."
    : "Sin clientes nuevos en el periodo: reactiva a los compradores recurrentes con una oferta de recompra.";

  const checkbox = `<span style="display:inline-block;width:14px;height:14px;border:2px solid #d97706;background-color:#ffffff;border-radius:3px;vertical-align:top;margin-top:1px;">&nbsp;</span>`;

  const planItem = (index: number, title: string, body: string): string => `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:10px;">
                <tr>
                  <td width="34" valign="top" style="width:34px;padding:11px 0 11px 12px;font-size:0;">${checkbox}</td>
                  <td style="padding:10px 14px 10px 6px;font-size:12px;color:#334155;line-height:1.55;">
                    <strong style="color:#0f172a;">${index}. ${escapeHtml(title)}</strong><br>${body}
                  </td>
                </tr>
              </table>`;

  const planSection = `
          ${heading(`6. Plan de Acción Recomendado (Checklist)`, "#0f172a")}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:#fffbeb;background-image:linear-gradient(160deg,#fffbeb 0%,#ffffff 55%,#fff7ed 100%);border:1px solid #fde68a;border-radius:16px;">
            <tr>
              <td style="padding:16px 18px;">
                ${planItem(1, "Reabastecimiento urgente de inventario", restockText)}
                ${planItem(2, postSaleTitle, postSaleText)}
                ${planItem(3, "Optimización de anuncios y catálogo digital", "Revisar campañas publicitarias activas para promover los productos con suficiente inventario disponible.")}
              </td>
            </tr>
          </table>`;

  // ---------------------------------------------------------------
  // Ensamble
  // ---------------------------------------------------------------
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} - Perfumes Saad</title>
<style>
  @media only screen and (max-width:620px) {
    .col3, .col2 { display:block !important; width:100% !important; padding:0 0 12px 0 !important; }
  }
  @media only screen and (max-width:520px) {
    .feat, .bandcol { display:block !important; width:100% !important; padding:8px 0 0 0 !important; text-align:left !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:#f8fafc;">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;border-collapse:collapse;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">

          <!-- Encabezado premium: negro y dorado -->
          <tr>
            <td style="background-color:#0f172a;background-image:linear-gradient(180deg,#020617 0%,#0f172a 60%,#1e293b 100%);border-bottom:4px solid #d97706;padding:30px 24px 24px 24px;text-align:center;">
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr>
                  <td style="background-color:#5c2a10;border:1px solid #b45309;border-radius:999px;padding:7px 18px;font-size:11px;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:#fcd34d;">✨ Perfumes Saad ✨</td>
                </tr>
              </table>
              <div style="height:18px;line-height:18px;font-size:0;">&nbsp;</div>
              <div style="font-size:32px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;line-height:1.15;">${escapeHtml(title)}</div>
              <div style="font-size:14px;color:#fbbf24;margin-top:10px;">📅 Periodo: <span style="color:#e2e8f0;font-weight:700;">${escapeHtml(rangeLabel)}</span></div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:16px;">
                <tr>
                  <td align="center" style="border-top:1px solid #1e293b;padding-top:14px;font-size:12px;color:#94a3b8;">
                    📄 Reporte N° ${escapeHtml(reportNumberText)} &nbsp;&nbsp;•&nbsp;&nbsp; Generado: ${escapeHtml(shortGenerated(reportDate))}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Cuerpo -->
          <tr>
            <td style="padding:26px 24px;">
              ${kpisSection}
          ${spacer()}
              ${productsSection}
          ${spacer()}
              ${financialSection}
          ${spacer()}
              ${inventorySection}
          ${inventorySection ? spacer() : ""}
              ${channelsSection}
          ${channelsSection ? spacer() : ""}
              ${planSection}
            </td>
          </tr>

          <!-- Pie elegante -->
          <tr>
            <td style="background-color:#0f172a;padding:22px 24px;text-align:center;border-top:1px solid #1e293b;">
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 10px auto;">
                <tr>
                  <td style="width:6px;height:6px;background-color:#f59e0b;border-radius:50%;font-size:0;">&nbsp;</td>
                  <td style="padding:0 10px;font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#e2e8f0;">Perfumes Saad — Reportes de Dirección</td>
                  <td style="width:6px;height:6px;background-color:#f59e0b;border-radius:50%;font-size:0;">&nbsp;</td>
                </tr>
              </table>
              <div style="font-size:12px;color:#94a3b8;">Este informe fue generado automáticamente el ${escapeHtml(longFullDate(reportDate))}.</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px;">Todos los derechos reservados © ${parseIso(reportDate)?.year ?? ""} Perfumes Saad</div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
