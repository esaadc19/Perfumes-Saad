import { lazy, Suspense, useMemo } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Building2,
  CalendarDays,
  Calculator,
  DollarSign,
  Lock,
  Megaphone,
  Package,
  Percent,
  ReceiptText,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import AdminButton from "../../components/admin/AdminButton";
import AlertBlock from "../../components/admin/AlertBlock";
import EmptyState from "../../components/admin/EmptyState";
import Metric from "../../components/admin/Metric";
import MetricGroup from "../../components/admin/MetricGroup";
import MobileOverview from "../../components/admin/MobileOverview";
import { money } from "../../lib/format";
import { isDateInPeriod, toBogotaDateStr, getOrderFinancialBreakdown } from "../../lib/order-finance";
import type { AdminSection } from "../../lib/admin-routes";
import type { AdminDashboardMetrics, AdminOrder, ProductProfitability } from "../../services/admin";
import type { Expense } from "../../services/expenses";
import type { WasteRow } from "../../services/credits";
import type { Product } from "../../services/products";
import type { ReportResult } from "./types";

import DecantsSection from "../../components/admin/DecantsSection";
import PeriodFilterSwitch from "../../components/admin/PeriodFilterSwitch";
import { type PeriodPreset, formatShortDate } from "../../services/admin-periods";
import { getPeriodRange } from "../../lib/decants-metrics";
const Charts = lazy(() => import("../../components/admin/Charts"));
const ProfitabilityTable = lazy(() => import("../../components/admin/ProfitabilityTable"));

export type DashboardDetail = "sold-out" | "low-stock" | "pending" | "profitability" | null;

interface DashboardPageProps {
  metrics: AdminDashboardMetrics;
  orders: AdminOrder[];
  products: Product[];
  expenses?: Expense[];
  soldOut: number;
  lowStock: number;
  totalStock: number;
  avgTicket: number;
  metricsPeriod?: number | null;
  periodPreset: PeriodPreset;
  periodCustomFrom: string;
  periodCustomTo: string;
  isPeriodAllTime?: boolean;
  onPeriodPresetChange: (preset: PeriodPreset) => void;
  onPeriodCustomRangeChange: (from: string, to: string) => void;
  onPeriodToggleAllTime?: () => void;
  onMetricsPeriodChange?: (period: number | null) => void;
  profitability: ProductProfitability | null;
  profitabilityLoading: boolean;
  profitabilityError: string | null;
  dashboardDetail: DashboardDetail;
  onDashboardDetailChange: (detail: DashboardDetail) => void;
  waste: WasteRow[] | null;
  wasteDays: number;
  wasteLoading: boolean;
  wasteError: string | null;
  canOpenOrders: boolean;
  onSectionChange: (section: AdminSection) => void;
  reportLoading: boolean;
  reportError: string | null;
  reportResult: ReportResult | null;
  onGenerateReport: () => void;
}

export default function DashboardPage({
  metrics,
  orders,
  products,
  expenses = [],
  soldOut,
  lowStock,
  totalStock,
  avgTicket,
  metricsPeriod,
  periodPreset,
  periodCustomFrom,
  periodCustomTo,
  isPeriodAllTime = false,
  onPeriodPresetChange,
  onPeriodCustomRangeChange,
  onPeriodToggleAllTime,
  onMetricsPeriodChange,
  profitability,
  profitabilityLoading,
  profitabilityError,
  dashboardDetail,
  onDashboardDetailChange,
  waste,
  wasteDays,
  wasteLoading,
  wasteError,
  canOpenOrders,
  onSectionChange,
  reportLoading,
  reportError,
  reportResult,
  onGenerateReport,
}: DashboardPageProps) {
  const activePeriod = useMemo(() => {
    return getPeriodRange(metricsPeriod ?? 30, metrics.period_from, metrics.period_to);
  }, [metricsPeriod, metrics.period_from, metrics.period_to]);

  // Cálculos de P&L corporativo (Ingresos, Costos, Margen Bruto, Gastos, Margen Neto)
  const totalRevenue = Number(metrics.sales_revenue ?? 0);
  const salesCost = Number(metrics.sales_cost ?? 0);
  const deliveryCost = Number(metrics.sales_delivery_cost ?? 0);
  const totalDirectCosts = salesCost + deliveryCost;
  const grossProfit = totalRevenue - totalDirectCosts;
  const grossMargin = totalRevenue > 0
    ? Math.round((grossProfit / totalRevenue) * 1000) / 10
    : 0;

  // Desglose de ingresos cobrados: ventas de contado vs abonos de cartera
  const { paidOrdersTotal, paidOrdersCount, abonosTotal, abonosCount } = useMemo(() => {
    let paidTotal = 0;
    let paidCount = 0;
    let abonoTot = 0;
    let abonoCount = 0;
    const from = metrics.period_from;
    const to = metrics.period_to;

    for (const order of orders) {
      const isPaid = order.payment_status === "paid";
      const isOpenCredit = order.payment_status === "credit" || order.payment_status === "partial";
      const dateStr = toBogotaDateStr(isPaid ? (order.paid_at ?? order.created_at) : order.created_at);

      if (isDateInPeriod(dateStr, from, to)) {
        if (isPaid) {
          paidTotal += Number(order.total ?? 0);
          paidCount += 1;
        } else if (isOpenCredit) {
          const b = getOrderFinancialBreakdown(order);
          if (b.collectedRevenue > 0) {
            abonoTot += b.collectedRevenue;
            abonoCount += 1;
          }
        }
      }
    }

    return {
      paidOrdersTotal: paidTotal,
      paidOrdersCount: paidCount,
      abonosTotal: abonoTot,
      abonosCount: abonoCount,
    };
  }, [orders, metrics.period_from, metrics.period_to]);

  // Clasificación de Gastos Operativos: Administrativos vs Ventas
  const { administrativeExpenses, salesExpenses } = useMemo(() => {
    const from = metrics.period_from;
    const to = metrics.period_to;
    const filtered = (expenses ?? []).filter((e) =>
      isDateInPeriod(e.expense_date, from, to)
    );

    let admin = 0;
    let sales = 0;
    const salesCategories = new Set([
      "marketing",
      "pauta",
      "publicidad",
      "transporte",
      "insumos",
      "empaques",
      "ventas",
      "comisiones",
    ]);

    for (const e of filtered) {
      const cat = (e.category || "").toLowerCase().trim();
      const amount = Number(e.amount ?? 0);
      if (
        salesCategories.has(cat) ||
        cat.includes("market") ||
        cat.includes("paut") ||
        cat.includes("vent") ||
        cat.includes("public")
      ) {
        sales += amount;
      } else {
        admin += amount;
      }
    }

    const totalFromMetrics = Number(metrics.total_expenses ?? 0);
    if (admin === 0 && sales === 0 && totalFromMetrics > 0) {
      admin = totalFromMetrics;
    }

    return { administrativeExpenses: admin, salesExpenses: sales };
  }, [expenses, metrics.period_from, metrics.period_to, metrics.total_expenses]);

  return (
    <div className="overview-flow">
      {/* Estructura movil: resumen, ingresos y pedidos recientes. En
          escritorio este bloque no se muestra y el orden no cambia. */}
      <MobileOverview
        metrics={metrics}
        orders={orders}
        grossMargin={grossMargin}
        grossProfit={grossProfit}
        onOpenOrders={canOpenOrders ? () => onSectionChange("transactions") : undefined}
        onOpenFinance={() => onSectionChange("finance")}
      />
      {/* El panel completo vive en la seccion Reportes. Acá quedan solo las
          dos acciones rapidas, sin formulario de fechas: el dashboard
          es para mirar, no para configurar. */}
      <div className="report-actions report-actions--dashboard">
        <span className="report-actions-label">Reportes</span>
        <div className="report-actions-buttons">
          <AdminButton
            tone="secondary"
            compact
            type="button"
            onClick={onGenerateReport}
            disabled={reportLoading}
          >
            <BarChart3 size={16} /> {reportLoading ? "Generando..." : "Generar reporte semanal"}
          </AdminButton>
          <AdminButton
            tone="secondary"
            compact
            type="button"
            onClick={() => onSectionChange("reports")}
          >
            <CalendarDays size={16} /> Reportes por periodo
          </AdminButton>
        </div>
      </div>
      {reportError && <p className="form-error" role="alert">{reportError}</p>}
      {reportResult && (
        <p className="report-result" role="status">
          Reporte {reportResult.label} generado. {reportResult.emailSent
            ? "Correo enviado. "
            : `${reportResult.emailError ?? "No se pudo enviar el correo."} `}
          <a href={reportResult.whatsappUrl} target="_blank" rel="noreferrer">Abrir reporte en WhatsApp</a>
        </p>
      )}
      <AlertBlock
        items={[
          lowStock > 0 ? (
            <Metric key="low-stock" title="Presentaciones con stock bajo" value={String(lowStock)} numericValue={lowStock} icon={<AlertTriangle />} warning onClick={() => onDashboardDetailChange("low-stock")} />
          ) : null,
          soldOut > 0 ? (
            <Metric key="sold-out" title="Presentaciones agotadas" value={String(soldOut)} numericValue={soldOut} icon={<X />} warning onClick={() => onDashboardDetailChange("sold-out")} />
          ) : null,
          metrics.pending_orders > 0 ? (
            <Metric key="pending" title="Pedidos pendientes de pago" value={String(metrics.pending_orders)} numericValue={metrics.pending_orders} icon={<AlertTriangle />} warning onClick={() => onDashboardDetailChange("pending")} />
          ) : null,
          metrics.missing_cost_items > 0 ? (
            <Metric key="missing-cost" title="Costos por completar" value={String(metrics.missing_cost_items)} numericValue={metrics.missing_cost_items} icon={<AlertTriangle />} warning onClick={() => onSectionChange("products")} />
          ) : null,
          metrics.credit_overdue_balance > 0 ? (
            <Metric key="overdue" title="Cartera vencida" value={money(Number(metrics.credit_overdue_balance))} numericValue={Number(metrics.credit_overdue_balance)} format="money" icon={<AlertTriangle />} warning onClick={() => onSectionChange("credit")} />
          ) : null,
          metrics.credit_customers_with_overdue > 0 ? (
            <Metric key="overdue-clients" title="Clientes con cartera vencida" value={String(metrics.credit_customers_with_overdue)} numericValue={metrics.credit_customers_with_overdue} icon={<Users />} warning onClick={() => onSectionChange("credit")} />
          ) : null,
        ]}
      />
      <div className="metrics-period">
        <span className="metrics-period-label">Período</span>
        <PeriodFilterSwitch
          preset={periodPreset}
          customFrom={periodCustomFrom}
          customTo={periodCustomTo}
          isAllTime={isPeriodAllTime}
          onPresetChange={onPeriodPresetChange}
          onCustomRangeChange={onPeriodCustomRangeChange}
          onToggleAllTime={onPeriodToggleAllTime}
        />
      </div>

      {/* ========================================================
          1. SECCIÓN: INGRESOS (Ventas de contado + Abonos de créditos)
         ======================================================== */}
      <MetricGroup
        title="Ingresos"
        hint="Flujo total cobrado en caja: ventas pagadas de contado y abonos de cartera recibidos."
        icon={<ArrowUpRight />}
        wide
      >
        <Metric
          title="Total ingresos cobrados"
          value={money(totalRevenue)}
          numericValue={totalRevenue}
          format="money"
          icon={<ReceiptText />}
          emphasis
          hint="Ventas pagadas de contado + abonos de créditos que ya entraron a caja."
          delta={metrics.period_days ? { current: totalRevenue, previous: Number(metrics.previous.sales_revenue) } : undefined}
          onClick={() => onSectionChange("finance")}
        />
        <Metric
          title={`Ventas de contado (${paidOrdersCount})`}
          value={money(paidOrdersTotal)}
          numericValue={paidOrdersTotal}
          format="money"
          icon={<ShoppingBag />}
          hint="Total cobrado por ventas pagadas 100% de inmediato."
        />
        <Metric
          title={`Abonos de créditos (${abonosCount})`}
          value={money(abonosTotal)}
          numericValue={abonosTotal}
          format="money"
          icon={<Wallet />}
          hint="Total recaudado por abonos a ventas fiadas en el periodo."
          onClick={() => onSectionChange("credit")}
        />
        <Metric
          title="Ventas completadas"
          value={String(metrics.completed_sales)}
          numericValue={metrics.completed_sales}
          icon={<ShoppingBag />}
          hint="Pedidos pagados y entregados en el periodo."
        />
        <Metric
          title="Ticket promedio"
          value={money(avgTicket)}
          numericValue={avgTicket}
          format="money"
          icon={<Calculator />}
          hint="Ingreso cobrado promedio por venta."
        />
      </MetricGroup>

      {/* ========================================================
          2. SECCIÓN: COSTOS DIRECTOS Y MARGEN BRUTO
         ======================================================== */}
      <MetricGroup
        title="Costos Directos y Margen Bruto"
        hint="Costos de mercancía y logística, generando la utilidad y el margen comercial bruto."
        icon={<Package />}
        wide
      >
        <Metric
          title="Utilidad bruta"
          value={metrics.missing_cost_items > 0 ? "Incompleta" : money(grossProfit)}
          numericValue={metrics.missing_cost_items > 0 ? undefined : grossProfit}
          format="money"
          icon={<TrendingUp />}
          warning={grossProfit < 0}
          emphasis
          hint="Ingresos cobrados menos mercancía mayorista y costos de logística."
          onClick={() => onSectionChange("finance")}
        />
        <Metric
          title="Margen bruto"
          value={`${grossMargin}%`}
          numericValue={grossMargin}
          format="percent"
          icon={<Percent />}
          hint="Rentabilidad comercial bruta sobre los ingresos cobrados."
        />
        <Metric
          title="Total costos directos"
          value={money(totalDirectCosts)}
          numericValue={totalDirectCosts}
          format="money"
          icon={<Calculator />}
          hint="Mercancía mayorista vendida + costos de logística y fletes."
        />
        <Metric
          title="Mercancía mayorista"
          value={money(Number(metrics.sales_cost))}
          numericValue={Number(metrics.sales_cost)}
          format="money"
          icon={<Package />}
          hint="Costo mayorista de los perfumes vendidos en el periodo."
          onClick={() => onSectionChange("products")}
        />
        <Metric
          title="Costo de logística (Fletes y domicilios)"
          value={money(Number(metrics.sales_delivery_cost))}
          numericValue={Number(metrics.sales_delivery_cost)}
          format="money"
          icon={<Truck />}
          hint="Fletes, mensajería y domicilios pagados o asumidos por la tienda."
        />
        <Metric
          title="Costo de fiado por cobrar"
          value={money(Number(metrics.credit_cost_pending))}
          numericValue={Number(metrics.credit_cost_pending)}
          format="money"
          icon={<Lock />}
          hint="Parte del costo de ventas a fiado que aún falta por recuperar con próximos abonos."
          onClick={() => onSectionChange("credit")}
        />
      </MetricGroup>

      {/* ========================================================
          3. SECCIÓN: GASTOS OPERATIVOS Y MARGEN NETO
         ======================================================== */}
      <MetricGroup
        title="Gastos Operativos y Margen Neto"
        hint="Gastos de administración y ventas del negocio, determinando la utilidad neta real final."
        icon={<Wallet />}
        wide
      >
        <Metric
          title="Utilidad neta real"
          value={metrics.missing_cost_items > 0 ? "Incompleta" : money(Number(metrics.sales_profit))}
          numericValue={metrics.missing_cost_items > 0 ? undefined : Number(metrics.sales_profit)}
          format="money"
          icon={<TrendingUp />}
          warning={metrics.sales_profit < 0}
          emphasis
          delta={metrics.period_days ? { current: Number(metrics.sales_profit), previous: Number(metrics.previous.sales_profit) } : undefined}
          hint="Ganancia libre después de costos, fletes, fiados abiertos y todos los gastos operativos."
          onClick={() => onSectionChange("finance")}
        />
        <Metric
          title="Margen neto real"
          value={`${Number(metrics.net_margin_percent)}%`}
          numericValue={Number(metrics.net_margin_percent)}
          format="percent"
          icon={<Percent />}
          delta={metrics.period_days ? { current: Number(metrics.net_margin_percent), previous: Number(metrics.previous.net_margin_percent) } : undefined}
          deltaFormat="points"
          hint="Margen neto final libre sobre los ingresos totales cobrados."
        />
        <Metric
          title="Gastos de ventas"
          value={money(salesExpenses)}
          numericValue={salesExpenses}
          format="money"
          icon={<Megaphone />}
          hint="Pauta digital (Meta/TikTok), publicidad, empaques, comisiones y transporte comercial."
          onClick={() => onSectionChange("expenses")}
        />
        <Metric
          title="Gastos administrativos"
          value={money(administrativeExpenses)}
          numericValue={administrativeExpenses}
          format="money"
          icon={<Building2 />}
          hint="Servicios públicos, arriendo, nómina administrativa, herramientas y gastos generales."
          onClick={() => onSectionChange("expenses")}
        />
        <Metric
          title="Total gastos registrados"
          value={money(Number(metrics.total_expenses))}
          numericValue={Number(metrics.total_expenses)}
          format="money"
          icon={<Wallet />}
          hint="Suma total de gastos operativos pagados en el periodo."
          onClick={() => onSectionChange("expenses")}
        />
        {metrics.committed_expenses > 0 && (
          <Metric
            title="Gastos comprometidos"
            value={money(Number(metrics.committed_expenses))}
            numericValue={Number(metrics.committed_expenses)}
            format="money"
            icon={<CalendarDays />}
            hint="Recordatorios ya creados que aún no se han pagado."
            onClick={() => onSectionChange("expenses")}
          />
        )}
      </MetricGroup>

      <div className="metric-groups">
        <MetricGroup
          title="Cartera"
          hint="Lo vendido a fiado y lo que todavía no es tuyo."
          icon={<DollarSign />}
        >
          <Metric title="Ventas a crédito" value={String(metrics.credit_sales)} numericValue={metrics.credit_sales} icon={<ReceiptText />} />
          <Metric title="Total a crédito" value={money(Number(metrics.credit_revenue))} numericValue={Number(metrics.credit_revenue)} format="money" icon={<BarChart3 />} />
          <Metric title="Por cobrar (CXC)" value={money(Number(metrics.credit_outstanding_balance))} numericValue={Number(metrics.credit_outstanding_balance)} format="money" icon={<DollarSign />} />
          <Metric
            title="Utilidad no cobrada"
            value={money(Number(metrics.locked_credit_profit))}
            numericValue={Number(metrics.locked_credit_profit)}
            format="money"
            icon={<Lock />}
            hint="Margen de los fiados abiertos; se reduce cuando los abonos superan el costo."
          />
        </MetricGroup>

        <MetricGroup
          title="Inventario"
          hint="Lo que tienes disponible para vender hoy."
          icon={<Package />}
        >
          <Metric title="Productos activos" value={String(products.filter((product) => !product.archived).length)} numericValue={products.filter((product) => !product.archived).length} icon={<Package />} />
          <Metric title="Unidades en stock" value={String(totalStock)} numericValue={totalStock} icon={<ShoppingBag />} />
          <Metric title="Presentaciones agotadas" value={String(soldOut)} numericValue={soldOut} icon={<X />} onClick={soldOut > 0 ? () => onDashboardDetailChange("sold-out") : undefined} />
        </MetricGroup>

        <MetricGroup
          title="Clientes"
          hint="Cuánta gente te ha comprado y quién te debe."
          icon={<Users />}
        >
          <Metric title="Clientes registrados" value={String(metrics.customer_count)} numericValue={metrics.customer_count} icon={<Users />} />
          <Metric title="Clientes con cartera vencida" value={String(metrics.credit_customers_with_overdue)} numericValue={metrics.credit_customers_with_overdue} icon={<AlertTriangle />} onClick={metrics.credit_customers_with_overdue > 0 ? () => onSectionChange("credit") : undefined} />
          <Metric title="Pedidos registrados" value={String(metrics.total_orders)} numericValue={metrics.total_orders} icon={<ReceiptText />} />
        </MetricGroup>
      </div>

      <Suspense fallback={<div className="loading-state" role="status"><span className="loading-spinner" aria-hidden="true" /><span>Cargando gráficas…</span></div>}>
        <Charts orders={orders} products={metrics.top_products} />
      </Suspense>

      {/* SECCIÓN DE DECANTS (10 ML) Y COMPARATIVO DE CHARTS */}
      <DecantsSection orders={orders} period={activePeriod} periodDays={metricsPeriod} />

      {/* Rentabilidad por producto: no dice cuanto se vendio, sino que
          perfume deja mas utilidad. Se abre a pedido porque la consulta
          es pesada. */}
      <div className="profitability-toggle">
        <AdminButton
          tone="secondary"
          compact
          type="button"
          aria-expanded={dashboardDetail === "profitability"}
          onClick={() =>
            onDashboardDetailChange(dashboardDetail === "profitability" ? null : "profitability")
          }
        >
          <BarChart3 size={16} />
          {dashboardDetail === "profitability" ? "Ocultar rentabilidad" : "Ver rentabilidad por producto"}
        </AdminButton>
      </div>

      {dashboardDetail === "profitability" && (
        <div className="admin-card profitability-card">
          <div className="card-title">
            <div>
              <h2>Que perfume deja mas utilidad</h2>
              <span>
                {metrics.period_from && metrics.period_to
                  ? `Del ${formatShortDate(metrics.period_from, true)} al ${formatShortDate(metrics.period_to, true)}`
                  : metricsPeriod
                  ? `Últimos ${metricsPeriod} días`
                  : "Todo el historial"}
              </span>
            </div>
            <Percent size={18} />
          </div>
          {profitabilityLoading && (
            <div className="loading-state" role="status">
              <span className="loading-spinner" aria-hidden="true" />
              <span>Calculando rentabilidad…</span>
            </div>
          )}
          {profitabilityError && <p className="form-error" role="alert">{profitabilityError}</p>}
          {!profitabilityLoading && !profitabilityError && (
            <Suspense fallback={<div className="loading-state" role="status"><span className="loading-spinner" aria-hidden="true" /><span>Cargando tabla…</span></div>}>
              <ProfitabilityTable data={profitability} />
            </Suspense>
          )}
        </div>
      )}
      <section className="insight-grid">
        {/* Merma: la pregunta que sin registro no tiene respuesta.
            Dice cuanto se perdio, no solo cuantas unidades faltaron. */}
        <div className="admin-card waste-card">
          <div className="card-title">
            <div>
              <h2>Merma</h2>
              <span>Valor perdido ultimos {wasteDays} dias</span>
            </div>
            <Package size={18} />
          </div>
          {wasteLoading && (
            <div className="loading-state" role="status">
              <span className="loading-spinner" aria-hidden="true" />
              <span>Calculando…</span>
            </div>
          )}
          {wasteError && <p className="form-error" role="alert">{wasteError}</p>}
          {!wasteLoading && !wasteError && waste && waste.length === 0 && (
            <p className="insight">
              Sin merma registrada. Cuando registres una rotura, un robo o un
              vencimiento desde el boton "Merma o ingreso" de cada presentacion, aqui
              aparece cuanto se perdio.
            </p>
          )}
          {!wasteLoading && !wasteError && waste && waste.length > 0 && (
            <>
              <p className="waste-total">
                <span>Perdido</span>
                <strong>{money(waste.reduce((sum, row) => sum + Number(row.total_lost), 0))}</strong>
              </p>
              <div className="waste-list">
                {waste.slice(0, 6).map((row) => (
                  <div className="waste-row" key={`${row.product_name}-${row.size_ml}`}>
                    <span className="waste-name">
                      {row.product_name}
                      <small>{row.size_ml} ml</small>
                    </span>
                    <span className="waste-units">{row.units_lost} und</span>
                    <span className="waste-money">{money(Number(row.total_lost))}</span>
                  </div>
                ))}
              </div>
              {waste.length > 6 && (
                <p className="report-hint">y {waste.length - 6} presentations mas</p>
              )}
            </>
          )}
        </div>

        <div className="admin-card">
          <div className="card-title"><div><h2>Consejo</h2><span>Lectura inicial del inventario</span></div><Sparkles size={18}/></div>
          <p className="insight">{metrics.top_products[0]
            ? `“${metrics.top_products[0].name}” es el producto más solicitado (${metrics.top_products[0].units} unidades en pedidos). Revisa su stock antes de impulsar nuevas ventas.`
            : "Cuando registres pedidos, aquí aparecerá el producto más solicitado para ayudarte a planificar el inventario."}</p>
        </div>
        <div className="admin-card">
          <div className="card-title"><div><h2>Alertas</h2><span>Inventario y pedidos por atender</span></div><AlertTriangle size={18}/></div>
          <div className="alert-list">
            <button className="alert-link" onClick={() => onDashboardDetailChange("sold-out")}>
              <span>Productos agotados</span><strong>{soldOut}</strong>
            </button>
            <button className="alert-link" onClick={() => onDashboardDetailChange("low-stock")}>
              <span>Presentaciones con stock bajo</span><strong>{lowStock}</strong>
            </button>
            <button className="alert-link" onClick={() => onDashboardDetailChange("pending")}>
              <span>Confirmados pendientes de pago</span><strong>{metrics.pending_orders}</strong>
            </button>
            {soldOut === 0 && lowStock === 0 && metrics.pending_orders === 0 && (
              <EmptyState
                title="Todo en orden"
                hint="No hay productos agotados, stock bajo ni pedidos pendientes."
              />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
