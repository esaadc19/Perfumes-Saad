import { lazy, Suspense } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Calculator,
  DollarSign,
  Lock,
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
import type { AdminSection } from "../../lib/admin-routes";
import type { AdminDashboardMetrics, AdminOrder, ProductProfitability } from "../../services/admin";
import type { WasteRow } from "../../services/credits";
import type { Product } from "../../services/products";
import type { ReportResult } from "./types";

const Charts = lazy(() => import("../../components/admin/Charts"));
const ProfitabilityTable = lazy(() => import("../../components/admin/ProfitabilityTable"));

export type DashboardDetail = "sold-out" | "low-stock" | "pending" | "profitability" | null;

interface DashboardPageProps {
  metrics: AdminDashboardMetrics;
  orders: AdminOrder[];
  products: Product[];
  soldOut: number;
  lowStock: number;
  totalStock: number;
  avgTicket: number;
  metricsPeriod: 7 | 30 | 90 | null;
  onMetricsPeriodChange: (period: 7 | 30 | 90 | null) => void;
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
  soldOut,
  lowStock,
  totalStock,
  avgTicket,
  metricsPeriod,
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
  return (
    <div className="overview-flow">
      {/* Estructura movil: resumen, ingresos y pedidos recientes. En
          escritorio este bloque no se muestra y el orden no cambia. */}
      <MobileOverview
        metrics={metrics}
        orders={orders}
        onOpenOrders={canOpenOrders ? () => onSectionChange("transactions") : undefined}
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
        <div className="chart-period-switch" role="group" aria-label="Rango de tiempo del dashboard">
          {([7, 30, 90] as const).map((days) => (
            <button
              key={days}
              type="button"
              className={metricsPeriod === days ? "selected" : ""}
              aria-pressed={metricsPeriod === days}
              onClick={() => onMetricsPeriodChange(days)}
            >
              {days} días
            </button>
          ))}
          <button
            type="button"
            className={metricsPeriod === null ? "selected" : ""}
            aria-pressed={metricsPeriod === null}
            onClick={() => onMetricsPeriodChange(null)}
          >
            Todo
          </button>
        </div>
      </div>
      {/* La lectura principal va primero: ventas cobradas, utilidad y margen.
          El detalle operativo (cartera, inventario, clientes) queda debajo. */}
      <MetricGroup
        title="Ventas"
        hint="Solo lo cobrado, incluidos los abonos. Lo vendido a fiado se resta por su costo mientras siga abierto."
        icon={<BarChart3 />}
        wide
      >
        <Metric title="Ventas cobradas" value={money(Number(metrics.sales_revenue))} numericValue={Number(metrics.sales_revenue)} format="money" icon={<ReceiptText />} hint="Incluye los abonos de fiados que siguen abiertos." delta={metrics.period_days ? { current: Number(metrics.sales_revenue), previous: Number(metrics.previous.sales_revenue) } : undefined} />
        {/* Sin costo completo no hay numero que contar: la tarjeta dice
            "Incompleta" y el conteo se queda quieto. */}
        <Metric
          title="Utilidad neta"
          value={metrics.missing_cost_items > 0 ? "Incompleta" : money(Number(metrics.sales_profit))}
          numericValue={metrics.missing_cost_items > 0 ? undefined : Number(metrics.sales_profit)}
          format="money"
          icon={<TrendingUp />}
          warning={metrics.sales_profit < 0}
          emphasis
          delta={metrics.period_days ? { current: Number(metrics.sales_profit), previous: Number(metrics.previous.sales_profit) } : undefined}
        />
        <Metric title="Margen" value={`${Number(metrics.net_margin_percent)}%`} numericValue={Number(metrics.net_margin_percent)} format="percent" icon={<Percent />} delta={metrics.period_days ? { current: Number(metrics.net_margin_percent), previous: Number(metrics.previous.net_margin_percent) } : undefined} deltaFormat="points" />
        <Metric title="Ventas completadas" value={String(metrics.completed_sales)} numericValue={metrics.completed_sales} icon={<ShoppingBag />} />
        <Metric title="Ticket promedio" value={money(avgTicket)} numericValue={avgTicket} format="money" icon={<Calculator />} hint="Venta cobrada promedio." />
        <Metric title="Costo de productos" value={money(Number(metrics.sales_cost))} numericValue={Number(metrics.sales_cost)} format="money" icon={<Package />} />
        <Metric title="Costo de domicilio" value={money(Number(metrics.sales_delivery_cost))} numericValue={Number(metrics.sales_delivery_cost)} format="money" icon={<Truck />} />
        <Metric title="Gastos registrados" value={money(Number(metrics.total_expenses))} numericValue={Number(metrics.total_expenses)} format="money" icon={<Wallet />} />
        <Metric
          title="Costo del fiado por cobrar"
          value={money(Number(metrics.credit_cost_pending))}
          numericValue={Number(metrics.credit_cost_pending)}
          format="money"
          icon={<Lock />}
          hint="Costo de las ventas a fiado que siguen abiertas; ya lo pagaste al proveedor. Los abonos ya suman a la utilidad."
        />
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
          {metrics.committed_expenses > 0 && (
            <Metric
              title="Gastos comprometidos"
              value={money(Number(metrics.committed_expenses))}
              numericValue={Number(metrics.committed_expenses)}
              format="money"
              icon={<CalendarDays />}
              hint="Recordatorios ya creados que aún no se han pagado."
            />
          )}
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
                {metricsPeriod
                  ? `Ultimos ${metricsPeriod} dias`
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
