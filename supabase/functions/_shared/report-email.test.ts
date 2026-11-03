// Pruebas de la plantilla del correo de reportes ejecutivos - Perfumes SAAD.
//
// Se corre con Node (23.6+) que ejecuta TypeScript nativo:
//   node supabase/functions/_shared/report-email.test.ts
//
// Cubre: titulos dinamicos (DIARIO/SEMANAL/MENSUAL/por dias), numero de
// reporte, fechas en formato ejecutivo, utilidad incompleta, indicador de tendencia,
// nota de fiado, abonos de fiado, canales, grafico de barras SVG de 8 semanas,
// escape de HTML y degradacion limpia ante datos vacios.

import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { formatEmailHtml, reportEmailTitle } from "./report-email.ts";

const money = (value: number): string =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);

let checks = 0;
function check(label: string, condition: boolean): void {
  checks += 1;
  if (!condition) {
    throw new Error(`Fallo la comprobacion #${checks}: ${label}`);
  }
}

function clean(html: string): void {
  check("no trae <script>", !html.includes("<script"));
  check("no trae el CDN de Tailwind", !html.includes("cdn.tailwindcss"));
  check("no trae imagenes externas", !html.includes("<img"));
  check("no trae Google Fonts", !html.includes("fonts.googleapis"));
  check("no trae @import", !html.includes("@import"));
  check("no imprime undefined", !html.includes("undefined"));
  check("no imprime NaN", !html.includes("NaN"));
  check("no imprime [object Object]", !html.includes("[object Object]"));
}

// ---------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------

const weeklyFull = {
  report_date: "2026-10-11",
  week_start: "2026-09-28",
  week_end: "2026-10-04",
  period: { days: 7, from: "2026-09-28", to: "2026-10-04" },
  current_week: {
    sales: 770000,
    orders: 3,
    items_sold: 3,
    average_order_value: 256667,
    product_cost: 410000,
    delivery_cost: 35000,
    credit_cost: 0,
    expenses: 0,
    missing_cost_items: 0,
    net_margin_percent: 41.4,
    net_profit: 325000,
  },
  previous_week: { sales: 480000, orders: 2 },
  last_month: { sales: 1500000 },
  best_product_this_week: { name: "Ariana Grande, Cloud EDP 100ml", quantity: 1 },
  best_product_last_month: { name: "N/A", quantity: 0 },
  top_products: [
    { name: "Ariana Grande, Cloud EDP 100ml", quantity: 1, revenue: 256667, family: "Gourmand" },
    { name: "Armaf, Club de Nuit Intense Man 105ml", quantity: 1, revenue: 210000, family: "Amaderado" },
    { name: "Lattafa, Khamrah Unisex 100ml", quantity: 1, revenue: 303333, family: "Especiado" },
  ],
  channels: [
    { channel: "direct", orders: 2, revenue: 513333 },
    { channel: "web", orders: 1, revenue: 256667 },
  ],
  buyers: { new: 6, returning: 0 },
  new_customers: 6,
  low_stock_count: 5,
  low_stock_products: [
    { name: "Ariana Grande Cloud EDP 100ml", stock: 0, min_stock: 5 },
    { name: "Lattafa Asad EDP 100ml", stock: 1, min_stock: 4 },
    { name: "Club de Nuit Intense Man 105ml", stock: 2, min_stock: 5 },
    { name: "Armaf Odyssey Homme 100ml", stock: 3, min_stock: 5 },
    { name: "Lattafa Yara Moi 100ml", stock: 4, min_stock: 5 },
  ],
  pending_orders: 0,
  expenses: { weekly: 0, monthly: 63175 },
  credit: {
    week_sales: 0,
    week_orders: 0,
    week_collected: 0,
    outstanding_balance: 0,
    overdue_balance: 0,
    customers_overdue: 0,
    outstanding_cost: 0,
  },
  weekly_history: [
    { label: "S-7", sales: 0 },
    { label: "S-6", sales: 0 },
    { label: "S-5", sales: 0 },
    { label: "S-4", sales: 0 },
    { label: "S-3", sales: 0 },
    { label: "S-2", sales: 0 },
    { label: "S-1", sales: 0 },
    { label: "Actual", sales: 770000 },
  ],
};

const dailyFull = {
  report_date: "2026-10-11",
  sales: 450000,
  orders: 2,
  items_sold: 3,
  product_cost: 200000,
  delivery_cost: 25000,
  missing_cost_items: 0,
  expenses: 15000,
  monthly_expenses: 63175,
  best_product: { name: "Lattafa, Khamrah Unisex 100ml", quantity: 2 },
  top_products: [
    { name: "Lattafa, Khamrah Unisex 100ml", quantity: 2, revenue: 300000, family: "Especiado" },
    { name: "Ariana Grande, Cloud EDP 100ml", quantity: 1, revenue: 150000, family: "Gourmand" },
  ],
  channels: [
    { channel: "web", orders: 1, revenue: 150000 },
    { channel: "direct", orders: 1, revenue: 300000 },
  ],
  buyers: { new: 1, returning: 1 },
  new_customers: 1,
  low_stock_count: 0,
  low_stock_products: [],
  pending_orders: 1,
};

// ---------------------------------------------------------------
// 1. Titulos
// ---------------------------------------------------------------
check("diario", reportEmailTitle(true, 7) === "REPORTE DIARIO");
check("semanal", reportEmailTitle(false, 7) === "REPORTE SEMANAL");
check("mensual", reportEmailTitle(false, 31) === "REPORTE MENSUAL");
check("rango de 90 dias", reportEmailTitle(false, 90) === "REPORTE DE 90 DÍAS");
check("un dia sin flag", reportEmailTitle(false, 1) === "REPORTE DIARIO");

// ---------------------------------------------------------------
// 2. Semanal completo (Diseño Dark Luxury)
// ---------------------------------------------------------------
const weekly = formatEmailHtml(weeklyFull, false);
clean(weekly);
check("titulo semanal en subject/head", weekly.includes("REPORTE SEMANAL - Perfumes SAAD"));
check("titulo visual en cabecera", weekly.includes("Reporte semanal"));
check("rango de fechas", weekly.includes("28 sep al 4 oct 2026"));
check("marca dorada en cabecera", weekly.includes("PERFUMES SAAD") && weekly.includes("#c8a264"));
check("fondo canvas oscuro", weekly.includes("#111613"));
check("cabecera verde bosque", weekly.includes("#1b2a21"));
check("kpi ventas semana", weekly.includes("VENTAS SEMANA") && weekly.includes(money(770000)));
check("tendencia subiendo", weekly.includes("subiendo") && weekly.includes("3 pedidos"));
check("kpi utilidad neta", weekly.includes("UTILIDAD NETA") && weekly.includes(money(325000)));
check("margen real", weekly.includes("margen real"));
check("kpi ticket promedio", weekly.includes("TICKET PROMEDIO") && weekly.includes(money(256667)));
check("kpi clientes nuevos", weekly.includes("CLIENTES NUEVOS") && weekly.includes("6"));
check("tarjeta ventas ultimas 8 semanas", weekly.includes("Ventas últimas 8 semanas"));
check("grafico svg con columnas", weekly.includes("<svg") && weekly.includes("Actual") && weekly.includes("S-7"));
check("tarjeta top productos", weekly.includes("Top productos"));
check("producto 1 en lista", weekly.includes("Ariana Grande Cloud EDP 100ml") && weekly.includes("1") && weekly.includes("ud"));
check("tarjeta requiere atencion", weekly.includes("Requiere atención") && weekly.includes("#fdf6f4"));
check("alertas de stock bajo", weekly.includes("5") && weekly.includes("presentaciones con stock bajo"));
check("alertas de pedidos pendientes", weekly.includes("0") && weekly.includes("pedidos pendientes de pago"));
check("tarjeta gastos", weekly.includes("Gastos") && weekly.includes("Semana") && weekly.includes("Mes"));
check("gastos del mes", weekly.includes(money(63175)));
check("auditoria financiera", weekly.includes("Auditoría Financiera y Canales"));
check("detalle canales", weekly.includes("WhatsApp / Panel") && weekly.includes("Tienda Online"));
check("boton cta panel", weekly.includes("Abrir Panel de Control") && weekly.includes("https://perfumes-saad.vercel.app/admin"));
check("numero de reporte", weekly.includes("Reporte N° 40-2026"));
check("preheader con cifras", weekly.includes(`Ventas ${money(770000)}`) && weekly.includes("5 alertas de stock"));

// ---------------------------------------------------------------
// 3. Diario completo
// ---------------------------------------------------------------
const daily = formatEmailHtml(dailyFull, true);
clean(daily);
check("titulo diario visual", daily.includes("Reporte diario"));
check("kpi ventas del dia", daily.includes("VENTAS DEL DÍA") && daily.includes(money(450000)));
check("numero de reporte diario", daily.includes("Reporte N° 284-2026"));
check("utilidad del dia", daily.includes(money(450000 - 200000 - 25000 - 15000)));
check("gastos de dia y mes", daily.includes(money(15000)) && daily.includes(money(63175)));
check("pedidos pendientes diarios", daily.includes("1") && daily.includes("pedidos pendientes de pago"));

// ---------------------------------------------------------------
// 4. Mensual y rango largo
// ---------------------------------------------------------------
const monthly = formatEmailHtml({
  ...weeklyFull,
  week_start: "2026-10-01",
  week_end: "2026-10-31",
  period: { days: 31 },
}, false);
check("titulo mensual visual", monthly.includes("Reporte mensual"));
check("kpi ventas del mes", monthly.includes("VENTAS DEL MES"));
check("numero de mes", monthly.includes("Reporte N° 44-2026"));

const ninety = formatEmailHtml({
  ...weeklyFull,
  period: { days: 90 },
}, false);
check("titulo 90 dias visual", ninety.includes("Reporte de 90 días"));
check("kpi ventas del periodo", ninety.includes("VENTAS DEL PERIODO"));

// ---------------------------------------------------------------
// 5. Costos faltantes: utilidad Pendiente de costos / Incompleta
// ---------------------------------------------------------------
const incomplete = formatEmailHtml({
  ...weeklyFull,
  current_week: { ...weeklyFull.current_week, missing_cost_items: 2, net_profit: 360000 },
}, false);
clean(incomplete);
check("utilidad pendiente de costos en kpi", incomplete.includes("Pendiente de costos"));
check("kpi utilidad con guion", incomplete.includes("$—"));
check("aviso en auditoria", incomplete.includes("2 pedidos no tienen costo registrado"));
check("no muestra margen falso", !incomplete.includes("% margen real"));

// ---------------------------------------------------------------
// 6. Sin periodo anterior
// ---------------------------------------------------------------
const noBase = formatEmailHtml({
  ...weeklyFull,
  previous_week: { sales: 0, orders: 0 },
}, false);
check("sin base previa indica primer registro o sin cambios", noBase.includes("primer registro"));

// ---------------------------------------------------------------
// 7. Fiado activo: la nota de que no es perdida
// ---------------------------------------------------------------
const creditWeek = formatEmailHtml({
  ...weeklyFull,
  current_week: { ...weeklyFull.current_week, credit_cost: 180000 },
  credit: { ...weeklyFull.credit, week_sales: 400000, week_orders: 2 },
}, false);
check("nota de fiado", creditWeek.includes("No es pérdida: es inversión que vuelve al cobrar"));
check("monto fiado visible", creditWeek.includes(money(400000)));

// ---------------------------------------------------------------
// 7b. Abonos de fiado abierto: suman a la utilidad
// ---------------------------------------------------------------
const abonoWeek = formatEmailHtml({
  ...weeklyFull,
  current_week: {
    ...weeklyFull.current_week,
    credit_cost: 270000,
    credit_collected: 200000,
    cash_collected: 970000,
    net_profit: 255000,
  },
  credit: {
    ...weeklyFull.credit,
    week_sales: 400000,
    week_orders: 2,
    week_collected: 520000,
    week_collected_open: 200000,
  },
}, false);
clean(abonoWeek);
const abonoCashProfit = 970000 - 410000 - 35000;
check("abonos suman a la utilidad", abonoWeek.includes(money(abonoCashProfit)));
check("abonos se muestran en auditoria", abonoWeek.includes("Abonos de fiado") && abonoWeek.includes(money(200000)));
check("total cobrado", abonoWeek.includes(money(970000)));
check("nota de fiado con abono", abonoWeek.includes("De eso ya te abonaron"));

// ---------------------------------------------------------------
// 8. Escape de HTML
// ---------------------------------------------------------------
const hostile = formatEmailHtml({
  ...weeklyFull,
  top_products: [
    { name: "<script>alert(1)</script>, EDP", quantity: 1, revenue: 1000, family: "<b>familia</b>" },
  ],
  best_product_this_week: { name: "<script>alert(1)</script>, EDP", quantity: 1 },
}, false);
check("escapa scripts", !hostile.includes("<script>alert"));
check("escapa etiquetas", hostile.includes("&lt;script&gt;"));

// ---------------------------------------------------------------
// 9. Degradacion limpia ante datos vacios
// ---------------------------------------------------------------
const legacy = {
  report_date: "2026-10-11",
  week_start: "2026-10-05",
  week_end: "2026-10-11",
  period: { days: 7 },
  current_week: {
    sales: 0, orders: 0, items_sold: 0, average_order_value: 0,
    product_cost: 0, delivery_cost: 0, credit_cost: 0, expenses: 0,
    missing_cost_items: 0, net_profit: 0,
  },
  previous_week: { sales: 0, orders: 0 },
  last_month: { sales: 0 },
  best_product_this_week: { name: "N/A", quantity: 0 },
  best_product_last_month: { name: "N/A", quantity: 0 },
  top_products: [],
  new_customers: 0,
  low_stock_count: 0,
  low_stock_products: [],
  pending_orders: 0,
  expenses: { weekly: 0, monthly: 0 },
  credit: {
    week_sales: 0, week_orders: 0, week_collected: 0,
    outstanding_balance: 0, overdue_balance: 0, customers_overdue: 0, outstanding_cost: 0,
  },
};
const legacyHtml = formatEmailHtml(legacy, false);
clean(legacyHtml);
check("sin ventas lo declara", legacyHtml.includes("Sin ventas registradas en el periodo"));

console.log(`OK: ${checks} comprobaciones pasaron.`);
