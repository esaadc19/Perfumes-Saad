// Pruebas de la plantilla del correo de reportes.
//
// Se corre con Node (23.6+) que ejecuta TypeScript nativo:
//   node supabase/functions/_shared/report-email.test.ts
//
// Cubre: titulos dinamicos (DIARIO/SEMANAL/MENSUAL/por dias), numero de
// reporte, fechas en largo, utilidad incompleta, falta de periodo de
// comparacion, nota de fiado, canales, escape de HTML y degradacion
// cuando la RPC vieja no trae los datos nuevos.

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
// 2. Semanal completo
// ---------------------------------------------------------------
const weekly = formatEmailHtml(weeklyFull, false);
clean(weekly);
check("titulo semanal", weekly.includes(">REPORTE SEMANAL<"));
check("rango en largo", weekly.includes("28 de Septiembre al 04 de Octubre, 2026"));
check("numero de reporte (semana ISO 40)", weekly.includes("Reporte N° 40-2026"));
check("fecha de generacion", weekly.includes("11 Oct, 2026"));
check("encabezado KPIs", weekly.includes("1. Dashboard de Métricas Clave (KPIs)"));
check("seccion de productos", weekly.includes("2. Productos Vendidos de la Semana"));
check("seccion financiera", weekly.includes("3. Resumen Financiero de la Semana"));
check("banda de utilidad", weekly.includes("Utilidad Neta de la Semana"));
check("utilidad cobrada = ventas - costos - gastos",
  weekly.includes(money(770000 - 410000 - 35000 - 0)));
check("formula visible", weekly.includes("Calculado: Ventas"));
check("margen", weekly.includes("Margen Neto"));
check("variacion con base", weekly.includes("+60.4%"));
check("crecimiento neto", weekly.includes(`+${money(290000)}`));
check("gastos del mes", weekly.includes(money(63175)));
check("canales", weekly.includes("Canales de Venta"));
check("barra de canal directo", weekly.includes("WhatsApp / Panel"));
check("barra de canal web", weekly.includes("Tienda Online"));
check("compradores nuevos", weekly.includes("100% de los compradores de la semana"));
check("pendientes al dia", weekly.includes("Al día"));
check("stock urgente", weekly.includes("Urgente"));
check("alerta agotado", weekly.includes("Agotado"));
check("alerta critico", weekly.includes("Stock Crítico"));
check("resto de alertas", weekly.includes("+1 producto adicional configurado"));
check("plan con productos reales",
  weekly.includes("Ariana Grande Cloud EDP 100ml") && weekly.includes("Lattafa Asad EDP 100ml"));
check("plan de post-venta", weekly.includes("post-venta para 6 nuevos clientes"));
check("destacado con familia", weekly.includes("Gourmand"));
check("producto 2 de la lista", weekly.includes("#2"));
check("sin fiado no muestra la nota", !weekly.includes("No es pérdida"));

// ---------------------------------------------------------------
// 3. Diario completo
// ---------------------------------------------------------------
const daily = formatEmailHtml(dailyFull, true);
clean(daily);
check("titulo diario", daily.includes(">REPORTE DIARIO<"));
check("numero de reporte (dia del anio)", daily.includes("Reporte N° 284-2026"));
check("rango diario", daily.includes("11 de Octubre, 2026"));
check("sin comparaciones de periodo", !daily.includes("Ventas periodo anterior"));
check("sin crecimiento sin base", !daily.includes("Crecimiento neto"));
check("utilidad del dia", daily.includes(money(450000 - 200000 - 25000 - 15000)));
check("gastos del mes en el KPI", daily.includes(money(63175)));
check("inventario sano", daily.includes("4. Inventario Sin Alertas") && daily.includes("Inventario sano"));
check("pendiente del dia", daily.includes("1 pendientes"));
check("seccion de productos diaria", daily.includes("2. Productos Vendidos del Día"));
check("unidades del dia", daily.includes("3 unidades vendidas"));

// ---------------------------------------------------------------
// 4. Mensual y rango largo
// ---------------------------------------------------------------
const monthly = formatEmailHtml({
  ...weeklyFull,
  week_start: "2026-10-01",
  week_end: "2026-10-31",
  period: { days: 31 },
}, false);
check("titulo mensual", monthly.includes(">REPORTE MENSUAL<"));
check("numero de mes", monthly.includes("Reporte N° 10-2026"));
check("palabra de mes", monthly.includes("Utilidad Neta del Mes"));

const ninety = formatEmailHtml({
  ...weeklyFull,
  period: { days: 90 },
}, false);
check("titulo por dias", ninety.includes(">REPORTE DE 90 DÍAS<"));
check("palabra de periodo", ninety.includes("Utilidad Neta del Periodo"));

// ---------------------------------------------------------------
// 5. Costos faltantes: utilidad Incompleta
// ---------------------------------------------------------------
const incomplete = formatEmailHtml({
  ...weeklyFull,
  current_week: { ...weeklyFull.current_week, missing_cost_items: 2, net_profit: 360000 },
}, false);
clean(incomplete);
check("utilidad incompleta", incomplete.includes("Incompleta"));
check("avisa cuantos pedidos", incomplete.includes("2 pedidos no tienen costo registrado"));
check("aviso en la banda", incomplete.includes("Costos incompletos"));
check("no muestra margen falso", !incomplete.includes("Margen Neto"));

// ---------------------------------------------------------------
// 6. Sin periodo anterior: nada de porcentajes inventados
// ---------------------------------------------------------------
const noBase = formatEmailHtml({
  ...weeklyFull,
  previous_week: { sales: 0, orders: 0 },
}, false);
check("sin base no dice +100%", !noBase.includes("+100%"));
check("declara que no hay previo", noBase.includes("Sin periodo previo"));
check("crecimiento honesto", noBase.includes("Sin periodo previo para comparar"));

// ---------------------------------------------------------------
// 7. Fiado activo: la nota de que no es perdida
// ---------------------------------------------------------------
const creditWeek = formatEmailHtml({
  ...weeklyFull,
  current_week: { ...weeklyFull.current_week, credit_cost: 180000 },
  credit: { ...weeklyFull.credit, week_sales: 400000, week_orders: 2 },
}, false);
check("nota de fiado", creditWeek.includes("No es pérdida"));
check("monto fiado visible", creditWeek.includes(money(400000)));

// ---------------------------------------------------------------
// 8. Escape de HTML en nombres de producto
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
check("escapa negritas de familia", hostile.includes("&lt;b&gt;"));

// ---------------------------------------------------------------
// 9. RPC vieja (sin canales ni compradores): degradacion limpia
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
check("sin canales no pinta la seccion", !legacyHtml.includes("Canales de Venta"));
check("sin ventas lo dice", legacyHtml.includes("Sin ventas registradas en el periodo"));
check("cambios sin ventas", legacyHtml.includes("Sin cambios"));
check("stock sano", legacyHtml.includes("Inventario sano"));
check("sin datos de stock no inventa", !legacyHtml.includes("Requiere plan de reorden"));

// ---------------------------------------------------------------
// 10. Diario sin los campos nuevos (RPC diaria vieja)
// ---------------------------------------------------------------
const legacyDaily = formatEmailHtml({
  report_date: "2026-10-11",
  sales: 300000,
  orders: 1,
  items_sold: 2,
  expenses: 8000,
  best_product: { name: "Lattafa, Asad EDP 100ml", quantity: 2 },
}, true);
clean(legacyDaily);
check("diario viejo sin seccion de canales", !legacyDaily.includes("Canales de Venta"));
check("diario viejo sin alertas de inventario", !legacyDaily.includes("Alertas de Inventario"));
check("diario viejo marca no disponible", legacyDaily.includes("No disponible en este envío"));
check("diario viejo no muestra utilidad incompleta", !legacyDaily.includes("Incompleta"));
check("diario viejo muestra gastos del dia", legacyDaily.includes(money(8000)));
check("diario viejo usa el mejor producto", legacyDaily.includes("Lattafa Asad EDP 100ml"));

// ---------------------------------------------------------------
// Vistas previas para la verificacion visual
// ---------------------------------------------------------------
const outDir = process.env.REPORT_PREVIEW_DIR ?? "";
if (outDir) {
  writeFileSync(`${outDir}/report-weekly.html`, weekly, "utf8");
  writeFileSync(`${outDir}/report-daily.html`, daily, "utf8");
  writeFileSync(`${outDir}/report-incomplete.html`, incomplete, "utf8");
}

console.log(`OK: ${checks} comprobaciones pasaron.`);
