// Plantilla del correo de reportes ejecutivos - Perfumes SAAD.
//
// Direccion visual: Dark Luxury / Executive Cards (alineada con la imagen de referencia).
// - Fondo exterior oscuro (#111613).
// - Encabezado verde bosque profundo (#1b2a21) con acento dorado (#c8a264) y tipografia Georgia.
// - Cuadricula 2x2 de tarjetas blancas para KPIs principales:
//     * VENTAS (con conteo de pedidos y estado de tendencia).
//     * UTILIDAD NETA (con indicador si esta pendiente de costos).
//     * TICKET PROMEDIO (por pedido).
//     * CLIENTES NUEVOS (en el periodo).
// - Tarjeta de grafico de barras "Ventas ultimas 8 semanas" (SVG limpio + barras doradas para actual).
// - Tarjeta "Top productos" con lista numerada y unidades.
// - Tarjeta "Requiere atencion" en tono rosa palido (#fdf6f4, borde #fae6e1) para alertas de stock y pagos.
// - Tarjeta "Gastos" (Semana / Periodo y Mes en curso).
// - Auditoria Financiera y Canales para transparencia de costos y abonos.
//
// El correo es HTML seguro para clientes de correo:
// tablas anidadas, estilos en linea, sin scripts, sin CSS externo, sin fuentes bloqueadas.

const MONTHS_LONG = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const MONTHS_SHORT = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

const num = (value: unknown): number => Number(value ?? 0);
const has = (value: unknown): boolean => value !== undefined && value !== null;

/** Escapa texto antes de insertarlo dentro de HTML. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Monto formateado y escapado, listo para el HTML. */
const money = (value: number): string => escapeHtml(formatCurrency(value));

/** Porcentaje con coma decimal, como se lee en Colombia. */
const percentText = (value: number): string => value.toFixed(1).replace(".", ",");

/**
 * `product_name_snapshot` guarda la marca y la presentacion separadas por
 * comas. Limpia duplicaciones como "Ariana Grande, Ariana Grande Cloud".
 */
export function cleanProductName(raw: string | null | undefined): string {
  if (!raw || raw === "N/A") return "Sin ventas";
  const parts = String(raw).split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) return String(raw);
  return parts
    .filter((part, index) => index === 0 || part.toLowerCase() !== parts[0].toLowerCase())
    .join(" ");
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

/** "11 Oct, 2026" */
function shortGenerated(iso: string | null | undefined): string {
  const parts = parseIso(iso);
  if (!parts) return "";
  const monthCap = MONTHS_SHORT[parts.month - 1];
  const capitalized = monthCap.charAt(0).toUpperCase() + monthCap.slice(1);
  return `${pad2(parts.day)} ${capitalized}, ${parts.year}`;
}

/** "11 de Octubre de 2026" */
function longFullDate(iso: string | null | undefined): string {
  const parts = parseIso(iso);
  if (!parts) return "";
  return `${parts.day} de ${MONTHS_LONG[parts.month - 1]} de ${parts.year}`;
}

/** Numero de semana ISO (1..53). */
function isoWeek(iso: string | null | undefined): number {
  const parts = parseIso(iso);
  if (!parts) return 0;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
}

function dayOfYear(iso: string | null | undefined): number {
  const parts = parseIso(iso);
  if (!parts) return 0;
  const start = Date.UTC(parts.year, 0, 1);
  const current = Date.UTC(parts.year, parts.month - 1, parts.day);
  return Math.round((current - start) / 86400000) + 1;
}

export function reportEmailTitle(isDaily: boolean, periodDays: number): string {
  if (isDaily || periodDays <= 1) return "REPORTE DIARIO";
  if (periodDays <= 7) return "REPORTE SEMANAL";
  if (periodDays <= 31) return "REPORTE MENSUAL";
  return `REPORTE DE ${Math.round(periodDays)} DÍAS`;
}

/** Titulo visual en caja mixta (ej. "Reporte semanal") */
function visualReportTitle(isDaily: boolean, periodDays: number): string {
  if (isDaily || periodDays <= 1) return "Reporte diario";
  if (periodDays <= 7) return "Reporte semanal";
  if (periodDays <= 31) return "Reporte mensual";
  return `Reporte de ${Math.round(periodDays)} días`;
}

function periodRangeFormatted(isDaily: boolean, startIso: string, endIso: string): string {
  if (isDaily) {
    const end = parseIso(endIso);
    return end ? `${end.day} de ${MONTHS_LONG[end.month - 1].toLowerCase()} de ${end.year}` : "";
  }
  const start = parseIso(startIso);
  const end = parseIso(endIso);
  if (!start || !end) return "";
  if (start.year === end.year) {
    return `${start.day} ${MONTHS_SHORT[start.month - 1]} al ${end.day} ${MONTHS_SHORT[end.month - 1]} ${end.year}`;
  }
  return `${start.day} ${MONTHS_SHORT[start.month - 1]} ${start.year} al ${end.day} ${MONTHS_SHORT[end.month - 1]} ${end.year}`;
}

function periodWords(isDaily: boolean, periodDays: number): { long: string; short: string; word: string } {
  if (isDaily || periodDays <= 1) return { long: "del Día", short: "del día", word: "DEL DÍA" };
  if (periodDays <= 7) return { long: "de la Semana", short: "de la semana", word: "SEMANA" };
  if (periodDays <= 31) return { long: "del Mes", short: "del mes", word: "DEL MES" };
  return { long: "del Periodo", short: "del periodo", word: "DEL PERIODO" };
}

// ---------------------------------------------------------------
// Paleta Dark Luxury
// ---------------------------------------------------------------
const PALETTE = {
  canvas: "#111613",         // Fondo exterior oscuro profundo
  headerBg: "#1b2a21",       // Verde bosque de cabecera
  headerText: "#ffffff",     // Blanco cabecera
  headerSub: "#8fa296",      // Verde salvia texto cabecera
  gold: "#c8a264",           // Dorado SAAD
  cardBg: "#ffffff",         // Fondo blanco tarjetas
  cardBorder: "#e5e7eb",     // Borde suave
  textDark: "#171717",       // Titulares y cifras
  textMuted: "#737373",      // Etiquetas y subtitulos
  textLight: "#a3a3a3",      // Textos secundarios tenues
  line: "#f2ede7",           // Separador tenue dentro de tarjetas
  positive: "#16a34a",       // Verde subiendo / ganancia
  attentionBg: "#fdf6f4",    // Rosa palido tarjeta atencion
  attentionBorder: "#fae6e1",// Borde tarjeta atencion
  attentionText: "#8b3a30",  // Rojo ladrillo oscuro
  barInactive: "#d8d2c9",    // Barras semanas anteriores
  barActive: "#c8a264",      // Barra actual dorada
};

const FONT_SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const FONT_SERIF = "Georgia,'Times New Roman',serif";

/**
 * Genera el grafico de barras SVG de 8 semanas.
 * Incluye lineas de guia horizontales ($0k..$800k o escalado dinamico),
 * 8 columnas (S-7 a S-1 en gris calido y Actual en dorado SAAD).
 */
function renderBarChartSvg(history: Array<{ label: string; sales: number }>, currentSales: number): string {
  let items = Array.isArray(history) && history.length === 8 ? [...history] : [];
  if (items.length !== 8) {
    items = [
      { label: "S-7", sales: 0 },
      { label: "S-6", sales: 0 },
      { label: "S-5", sales: 0 },
      { label: "S-4", sales: 0 },
      { label: "S-3", sales: 0 },
      { label: "S-2", sales: 0 },
      { label: "S-1", sales: 0 },
      { label: "Actual", sales: currentSales },
    ];
  }

  const rawMax = Math.max(...items.map((i) => i.sales), currentSales, 100000);
  const step = rawMax <= 400000 ? 100000 : rawMax <= 800000 ? 200000 : rawMax <= 2000000 ? 500000 : 1000000;
  const maxScale = Math.ceil(rawMax / step) * step;

  const width = 520;
  const height = 180;
  const topY = 20;
  const bottomY = 140;
  const chartHeight = bottomY - topY;

  const gridLevels = [
    { value: maxScale, y: topY },
    { value: maxScale * 0.75, y: topY + chartHeight * 0.25 },
    { value: maxScale * 0.5, y: topY + chartHeight * 0.5 },
    { value: maxScale * 0.25, y: topY + chartHeight * 0.75 },
    { value: 0, y: bottomY },
  ];

  const formatK = (val: number): string => {
    if (val === 0) return "$0k";
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1).replace(".0", "")}M`;
    return `$${Math.round(val / 1000)}k`;
  };

  const gridLines = gridLevels.map((lvl) => {
    return `<line x1="68" y1="${lvl.y}" x2="495" y2="${lvl.y}" stroke="#f0ede8" stroke-width="1"/>
    <text x="60" y="${lvl.y + 4}" fill="#9ca3af" font-size="10.5" font-family="${FONT_SANS}" font-weight="600" text-anchor="end">${formatK(lvl.value)}</text>`;
  }).join("\n");

  const startX = 85;
  const colSpacing = 51;
  const barWidth = 32;

  const bars = items.map((item, index) => {
    const isActual = index === items.length - 1 || item.label.toLowerCase() === "actual";
    const x = startX + index * colSpacing;
    const barH = maxScale > 0 ? Math.min(chartHeight, Math.round((item.sales / maxScale) * chartHeight)) : 0;
    const y = bottomY - barH;
    const fill = isActual ? PALETTE.barActive : PALETTE.barInactive;

    const barRect = barH > 0
      ? `<rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" rx="3" ry="3" fill="${fill}"/>`
      : "";

    const labelText = escapeHtml(item.label);
    const labelWeight = isActual ? "bold" : "600";
    const labelColor = isActual ? PALETTE.textDark : PALETTE.textMuted;

    return `
      <line x1="${x + barWidth / 2}" y1="${topY}" x2="${x + barWidth / 2}" y2="${bottomY}" stroke="#f0ede8" stroke-width="0.5" stroke-dasharray="2 3"/>
      ${barRect}
      <text x="${x + barWidth / 2}" y="160" fill="${labelColor}" font-size="11" font-family="${FONT_SANS}" font-weight="${labelWeight}" text-anchor="middle">${labelText}</text>
    `;
  }).join("\n");

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="auto" style="display:block;max-width:${width}px;margin:0 auto;overflow:visible;" xmlns="http://www.w3.org/2000/svg">
    ${gridLines}
    ${bars}
  </svg>`;
}

/**
 * Plantilla completa del correo de reportes.
 */
export function formatEmailHtml(data: any, isDaily: boolean): string {
  const week = data?.current_week ?? {};
  const previous = data?.previous_week ?? {};
  const credit = data?.credit ?? {};
  const expenses = data?.expenses ?? {};
  const periodDays = isDaily ? 1 : num(data?.period?.days ?? 7);
  const words = periodWords(isDaily, periodDays);
  const title = reportEmailTitle(isDaily, periodDays);
  const visualTitle = visualReportTitle(isDaily, periodDays);

  const startDate = isDaily ? String(data?.report_date ?? "") : String(data?.week_start ?? "");
  const endDate = isDaily ? String(data?.report_date ?? "") : String(data?.week_end ?? "");
  const reportDate = String(data?.report_date ?? "");

  // ---------------------------------------------------------------
  // Numeros financieros
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

  const averageOrder = isDaily
    ? (orders > 0 ? sales / orders : 0)
    : num(week.average_order_value);

  const cashProfit = cashCollected - productCost - deliveryCost - periodExpenses;
  const profitComplete = missingCost === 0;
  const margin = profitComplete && cashCollected > 0 ? (cashProfit / cashCollected) * 100 : null;

  // Tendencia de ventas
  let trendText = "sin cambios";
  let trendColor = PALETTE.textMuted;
  if (!isDaily && prevSales > 0) {
    if (sales > prevSales) {
      trendText = "subiendo";
      trendColor = PALETTE.positive;
    } else if (sales < prevSales) {
      trendText = "bajando";
      trendColor = "#dc2626";
    }
  } else if (!isDaily && sales > 0) {
    trendText = "primer registro";
    trendColor = PALETTE.positive;
  }

  // ---------------------------------------------------------------
  // Clientes y alertas
  // ---------------------------------------------------------------
  const newCustomers = has(data?.new_customers) ? num(data.new_customers) : null;
  const buyersNew = has(data?.buyers) ? num(data.buyers?.new) : null;
  const buyersReturning = has(data?.buyers) ? num(data.buyers?.returning) : null;
  const newCustomersCount = newCustomers ?? buyersNew;

  const pendingOrders = has(data?.pending_orders) ? num(data.pending_orders) : 0;
  const lowStock = has(data?.low_stock_count) ? num(data.low_stock_count) : 0;
  const lowStockList: Array<{ name?: string; stock?: number; min_stock?: number }> =
    Array.isArray(data?.low_stock_products) ? data.low_stock_products : [];

  // ---------------------------------------------------------------
  // Top Productos
  // ---------------------------------------------------------------
  const topProducts: Array<{ name?: string; quantity?: number; revenue?: number; family?: string }> =
    Array.isArray(data?.top_products) ? data.top_products : [];
  const bestRaw = isDaily ? data?.best_product : data?.best_product_this_week;
  const bestName = cleanProductName(topProducts[0]?.name ?? bestRaw?.name);
  const bestQty = num(topProducts[0]?.quantity ?? bestRaw?.quantity);

  let productItems: Array<{ name: string; quantity: number }> = [];
  if (topProducts.length > 0) {
    productItems = topProducts.slice(0, 5).map((p) => ({
      name: cleanProductName(p.name),
      quantity: num(p.quantity),
    }));
  } else if (bestName && bestName !== "Sin ventas") {
    productItems = [{ name: bestName, quantity: bestQty }];
  }

  // ---------------------------------------------------------------
  // Historial 8 semanas
  // ---------------------------------------------------------------
  const weeklyHistory: Array<{ label: string; sales: number }> =
    Array.isArray(data?.weekly_history) ? data.weekly_history : [];

  const subtitleDate = periodRangeFormatted(isDaily, startDate, endDate);
  const reportNumberText = isDaily
    ? `${dayOfYear(endDate || reportDate)}-${parseIso(endDate || reportDate)?.year ?? ""}`
    : `${isoWeek(endDate || reportDate)}-${parseIso(endDate || reportDate)?.year ?? ""}`;

  const preheader = `Ventas ${formatCurrency(cashCollected)} · Utilidad ${profitComplete ? formatCurrency(cashProfit) : "incompleta"} · ${lowStock} alertas de stock`;

  // ---------------------------------------------------------------
  // RENDER: Cabecera
  // ---------------------------------------------------------------
  const headerCard = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:${PALETTE.headerBg};border-radius:14px;">
      <tr>
        <td style="padding:26px 28px;">
          <div style="font-family:${FONT_SANS};font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${PALETTE.gold};">PERFUMES SAAD</div>
          <div style="margin-top:6px;font-family:${FONT_SERIF};font-size:28px;line-height:1.2;font-weight:400;color:${PALETTE.headerText};">${escapeHtml(visualTitle)}</div>
          <div style="margin-top:4px;font-family:${FONT_SANS};font-size:14px;color:${PALETTE.headerSub};">${escapeHtml(subtitleDate)}</div>
        </td>
      </tr>
    </table>
  `;

  // ---------------------------------------------------------------
  // RENDER: Cuadricula 2x2 de KPIs Principales
  // ---------------------------------------------------------------
  const kpiSalesLabel = `VENTAS ${words.word}`;
  const kpiSalesSub = `${orders} ${orders === 1 ? "pedido" : "pedidos"} · <span style="color:${trendColor};font-weight:600;">${trendText}</span>`;

  const kpiProfitValue = profitComplete ? money(cashProfit) : "$—";
  const kpiProfitSub = profitComplete
    ? (margin !== null ? `${percentText(margin)}% margen real` : "Sin ventas")
    : "Pendiente de costos";

  const kpiTicketValue = money(averageOrder);
  const kpiTicketSub = "por pedido";

  const kpiClientsValue = newCustomersCount !== null ? String(newCustomersCount) : "0";
  const kpiClientsSub = isDaily ? "este día" : words.word === "SEMANA" ? "esta semana" : "en el periodo";

  const renderKpiCard = (label: string, value: string, subHtml: string): string => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:${PALETTE.cardBg};border-radius:12px;">
      <tr>
        <td style="padding:18px 20px;">
          <div style="font-family:${FONT_SANS};font-size:10.5px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:${PALETTE.textMuted};">${escapeHtml(label)}</div>
          <div style="margin-top:6px;font-family:${FONT_SANS};font-size:26px;font-weight:700;line-height:1.1;color:${PALETTE.textDark};">${value}</div>
          <div style="margin-top:6px;font-family:${FONT_SANS};font-size:12px;line-height:1.3;color:${PALETTE.textMuted};">${subHtml}</div>
        </td>
      </tr>
    </table>
  `;

  const kpisGrid = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      <tr>
        <td width="50%" valign="top" style="width:50%;padding:0 6px 12px 0;">
          ${renderKpiCard(kpiSalesLabel, money(cashCollected), kpiSalesSub)}
        </td>
        <td width="50%" valign="top" style="width:50%;padding:0 0 12px 6px;">
          ${renderKpiCard("UTILIDAD NETA", kpiProfitValue, kpiProfitSub)}
        </td>
      </tr>
      <tr>
        <td width="50%" valign="top" style="width:50%;padding:0 6px 0 0;">
          ${renderKpiCard("TICKET PROMEDIO", kpiTicketValue, kpiTicketSub)}
        </td>
        <td width="50%" valign="top" style="width:50%;padding:0 0 0 6px;">
          ${renderKpiCard("CLIENTES NUEVOS", kpiClientsValue, kpiClientsSub)}
        </td>
      </tr>
    </table>
  `;

  // ---------------------------------------------------------------
  // RENDER: Tarjeta "Ventas ultimas 8 semanas" (Grafico de barras)
  // ---------------------------------------------------------------
  const chartCard = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:${PALETTE.cardBg};border-radius:12px;">
      <tr>
        <td style="padding:22px 24px;">
          <div style="font-family:${FONT_SERIF};font-size:20px;font-weight:400;color:${PALETTE.textDark};margin-bottom:16px;">Ventas últimas 8 semanas</div>
          ${renderBarChartSvg(weeklyHistory, cashCollected)}
        </td>
      </tr>
    </table>
  `;

  // ---------------------------------------------------------------
  // RENDER: Tarjeta "Top productos"
  // ---------------------------------------------------------------
  const productRows = productItems.map((prod, index) => {
    const isLast = index === productItems.length - 1;
    const borderStyle = isLast && productItems.length >= 5 ? "" : `border-bottom:1px solid ${PALETTE.line};`;
    return `
      <tr>
        <td style="padding:11px 0;${borderStyle}">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td style="font-family:${FONT_SANS};font-size:13.5px;color:${PALETTE.textDark};font-weight:400;">
                <span style="color:${PALETTE.textMuted};font-weight:600;margin-right:6px;">${index + 1}.</span> ${escapeHtml(prod.name)}
              </td>
              <td align="right" style="font-family:${FONT_SANS};font-size:13px;color:${PALETTE.textMuted};white-space:nowrap;padding-left:12px;">
                <strong style="color:${PALETTE.textDark};">${prod.quantity}</strong> ud
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `;
  }).join("");

  const placeholderNote = productItems.length < 5
    ? `<tr><td style="padding-top:12px;font-family:${FONT_SANS};font-size:11px;color:${PALETTE.textLight};">Los demás lugares se llenan con datos reales al conectar el reporte.</td></tr>`
    : "";

  const topProductsCard = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:${PALETTE.cardBg};border-radius:12px;">
      <tr>
        <td style="padding:22px 24px;">
          <div style="font-family:${FONT_SERIF};font-size:20px;font-weight:400;color:${PALETTE.textDark};margin-bottom:12px;">Top productos</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            ${productRows || `<tr><td style="font-family:${FONT_SANS};font-size:13px;color:${PALETTE.textMuted};">Sin ventas registradas en el periodo.</td></tr>`}
            ${placeholderNote}
          </table>
        </td>
      </tr>
    </table>
  `;

  // ---------------------------------------------------------------
  // RENDER: Tarjeta "Requiere atencion"
  // ---------------------------------------------------------------
  const attentionCard = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:${PALETTE.attentionBg};border:1px solid ${PALETTE.attentionBorder};border-radius:12px;">
      <tr>
        <td style="padding:22px 24px;">
          <div style="font-family:${FONT_SERIF};font-size:20px;font-weight:400;color:${PALETTE.attentionText};margin-bottom:14px;">Requiere atención</div>
          <div style="font-family:${FONT_SANS};font-size:13px;color:#374151;line-height:1.5;">
            <span style="color:${PALETTE.attentionText};font-weight:700;">${lowStock}</span> presentaciones con stock bajo (las 5 más críticas aparecerían aquí)
          </div>
          <div style="height:1px;background-color:${PALETTE.attentionBorder};margin:12px 0;"></div>
          <div style="font-family:${FONT_SANS};font-size:13px;color:#374151;line-height:1.5;">
            <span style="color:${PALETTE.attentionText};font-weight:700;">${pendingOrders}</span> pedidos pendientes de pago
          </div>
        </td>
      </tr>
    </table>
  `;

  // ---------------------------------------------------------------
  // RENDER: Tarjeta "Gastos"
  // ---------------------------------------------------------------
  const gastosPeriodLabel = isDaily ? "Día" : words.word === "SEMANA" ? "Semana" : "Periodo";
  const gastosCard = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:${PALETTE.cardBg};border-radius:12px;">
      <tr>
        <td style="padding:22px 24px;">
          <div style="font-family:${FONT_SERIF};font-size:20px;font-weight:400;color:${PALETTE.textDark};margin-bottom:14px;">Gastos</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td style="padding:8px 0;font-family:${FONT_SANS};font-size:13px;color:${PALETTE.textDark};border-bottom:1px solid ${PALETTE.line};">${escapeHtml(gastosPeriodLabel)}</td>
              <td align="right" style="padding:8px 0;font-family:${FONT_SANS};font-size:13px;color:${PALETTE.textDark};font-weight:600;border-bottom:1px solid ${PALETTE.line};">${money(periodExpenses)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-family:${FONT_SANS};font-size:13px;color:${PALETTE.textDark};">Mes</td>
              <td align="right" style="padding:8px 0;font-family:${FONT_SANS};font-size:13px;color:${PALETTE.textDark};font-weight:600;">${money(monthExpenses)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  // ---------------------------------------------------------------
  // RENDER: Detalle Financiero y Canales
  // ---------------------------------------------------------------
  const channelsList = Array.isArray(data?.channels) ? data.channels : [];
  const channelDetails = channelsList.length > 0
    ? channelsList.map((c: any) => {
        const cName = c.channel === "direct" ? "WhatsApp / Panel" : "Tienda Online";
        return `<tr>
          <td style="padding:6px 0;font-family:${FONT_SANS};font-size:12px;color:${PALETTE.textMuted};">${cName}</td>
          <td align="right" style="padding:6px 0;font-family:${FONT_SANS};font-size:12px;color:${PALETTE.textDark};font-weight:600;">${money(num(c.revenue))} (${num(c.orders)} ped.)</td>
        </tr>`;
      }).join("")
    : "";

  const fiadoNote = creditCost > 0
    ? `<tr>
        <td colspan="2" style="padding-top:12px;font-family:${FONT_SANS};font-size:11px;color:${PALETTE.textMuted};line-height:1.5;">
          Vendiste ${money(num(credit.week_sales))} a fiado: el producto y su costo salieron de la caja, pero la plata entra cuando te paguen.
          ${creditCollected > 0 ? `De eso ya te abonaron ${money(creditCollected)}.` : ""}
          <strong style="color:${PALETTE.textDark};">No es pérdida: es inversión que vuelve al cobrar.</strong>
        </td>
      </tr>`
    : "";

  const breakdownCard = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:${PALETTE.cardBg};border-radius:12px;">
      <tr>
        <td style="padding:22px 24px;">
          <div style="font-family:${FONT_SERIF};font-size:18px;font-weight:400;color:${PALETTE.textDark};margin-bottom:12px;">Auditoría Financiera y Canales</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td style="padding:6px 0;font-family:${FONT_SANS};font-size:12px;color:${PALETTE.textMuted};">Ventas pagadas</td>
              <td align="right" style="padding:6px 0;font-family:${FONT_SANS};font-size:12px;color:${PALETTE.textDark};font-weight:600;">${money(sales)}</td>
            </tr>
            ${creditCollected > 0 ? `<tr>
              <td style="padding:6px 0;font-family:${FONT_SANS};font-size:12px;color:${PALETTE.positive};">+ Abonos de fiado</td>
              <td align="right" style="padding:6px 0;font-family:${FONT_SANS};font-size:12px;color:${PALETTE.positive};font-weight:600;">+${money(creditCollected)}</td>
            </tr>` : ""}
            <tr>
              <td style="padding:6px 0;font-family:${FONT_SANS};font-size:12px;color:${PALETTE.textMuted};">− Costo productos</td>
              <td align="right" style="padding:6px 0;font-family:${FONT_SANS};font-size:12px;color:${PALETTE.textDark};font-weight:600;">−${money(productCost)}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-family:${FONT_SANS};font-size:12px;color:${PALETTE.textMuted};">− Domicilios</td>
              <td align="right" style="padding:6px 0;font-family:${FONT_SANS};font-size:12px;color:${PALETTE.textDark};font-weight:600;">−${money(deliveryCost)}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-family:${FONT_SANS};font-size:12px;color:${PALETTE.textMuted};border-bottom:1px solid ${PALETTE.line};">− Gastos operativos</td>
              <td align="right" style="padding:6px 0;font-family:${FONT_SANS};font-size:12px;color:${PALETTE.textDark};font-weight:600;border-bottom:1px solid ${PALETTE.line};">−${money(periodExpenses)}</td>
            </tr>
            <tr>
              <td style="padding:9px 0;font-family:${FONT_SANS};font-size:13px;color:${PALETTE.textDark};font-weight:700;">= Utilidad neta real</td>
              <td align="right" style="padding:9px 0;font-family:${FONT_SANS};font-size:14px;color:${profitComplete ? PALETTE.positive : PALETTE.gold};font-weight:700;">
                ${profitComplete ? money(cashProfit) : "Incompleta (faltan costos)"}
              </td>
            </tr>
            ${missingCost > 0 ? `
              <tr>
                <td colspan="2" style="padding-top:6px;font-family:${FONT_SANS};font-size:11px;color:#d97706;">
                  ⚠️ ${missingCost} ${missingCost === 1 ? "pedido no tiene" : "pedidos no tienen"} costo registrado.
                </td>
              </tr>
            ` : ""}
            ${fiadoNote}
            ${channelDetails ? `
              <tr>
                <td colspan="2" style="padding-top:14px;border-top:1px solid ${PALETTE.line};">
                  <div style="font-family:${FONT_SANS};font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${PALETTE.textMuted};margin-bottom:6px;">Canales de Venta</div>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                    ${channelDetails}
                  </table>
                </td>
              </tr>
            ` : ""}
          </table>
        </td>
      </tr>
    </table>
  `;

  // ---------------------------------------------------------------
  // RENDER: Boton CTA y Pie
  // ---------------------------------------------------------------
  const ctaButton = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:20px;">
      <tr>
        <td align="center">
          <a href="https://perfumes-saad.vercel.app/admin" target="_blank" style="display:inline-block;background-color:${PALETTE.headerBg};color:${PALETTE.gold};border:1px solid ${PALETTE.gold};padding:13px 28px;border-radius:10px;font-family:${FONT_SANS};font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;text-decoration:none;">
            👉 Abrir Panel de Control
          </a>
        </td>
      </tr>
    </table>
  `;

  const footer = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:24px;">
      <tr>
        <td align="center" style="font-family:${FONT_SANS};font-size:11px;color:#6b7280;line-height:1.6;">
          <div style="font-weight:700;letter-spacing:1.5px;color:${PALETTE.gold};">PERFUMES SAAD</div>
          <div style="margin-top:4px;">Reporte N° ${escapeHtml(reportNumberText)} · Generado automáticamente el ${escapeHtml(longFullDate(reportDate))}</div>
          <div style="margin-top:2px;color:#4b5563;">© ${parseIso(reportDate)?.year ?? "2026"} Perfumes SAAD · Todos los derechos reservados.</div>
        </td>
      </tr>
    </table>
  `;

  const cardGap = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      <tr><td style="height:14px;line-height:14px;font-size:0;">&nbsp;</td></tr>
    </table>
  `;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${escapeHtml(title)} - Perfumes SAAD</title>
<style>
  body, table, td, p, a, li, blockquote {
    -webkit-text-size-adjust: 100%;
    -ms-text-size-adjust: 100%;
  }
  table, td {
    mso-table-lspace: 0pt;
    mso-table-rspace: 0pt;
  }
  @media only screen and (max-width: 600px) {
    .email-container {
      width: 100% !important;
      max-width: 100% !important;
      padding: 12px 8px !important;
    }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${PALETTE.canvas};font-family:${FONT_SANS};">
  <div style="display:none;font-size:1px;color:${PALETTE.canvas};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    ${escapeHtml(preheader)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:${PALETTE.canvas};">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table class="email-container" role="presentation" width="580" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:580px;border-collapse:collapse;">
          <tr>
            <td>
              ${headerCard}
              ${cardGap}
              ${kpisGrid}
              ${cardGap}
              ${chartCard}
              ${cardGap}
              ${topProductsCard}
              ${cardGap}
              ${attentionCard}
              ${cardGap}
              ${gastosCard}
              ${cardGap}
              ${breakdownCard}
              ${ctaButton}
              ${footer}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
