import { lazy, Suspense, useMemo } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  CalendarDays,
  Calculator,
  CheckCircle2,
  CreditCard,
  DollarSign,
  FileText,
  Lock,
  Megaphone,
  Package,
  Percent,
  ReceiptText,
  Send,
  ShoppingBag,
  Sparkles,
  TrendingDown,
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
import FullBottlesSection from "../../components/admin/FullBottlesSection";
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

  const totalExpenses = Number(metrics.total_expenses ?? 0);
  const netProfit = Number(metrics.sales_profit ?? 0);
  const netMargin = Number(metrics.net_margin_percent ?? 0);

  // Cartera y pendientes
  const creditOutstanding = Number(metrics.credit_outstanding_balance ?? 0);
  const creditOverdue = Number(metrics.credit_overdue_balance ?? 0);
  const creditCustomersWithOverdue = Number(metrics.credit_customers_with_overdue ?? 0);

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

  // Proporciones matemáticas para la barra segmentada de la tarjeta "Net Profit" (estilo Fintech)
  const { profitBarPct, costsBarPct, expensesBarPct, expensePillValue } = useMemo(() => {
    const totalOut = totalDirectCosts + totalExpenses;
    const base = Math.max(totalRevenue, totalOut + Math.max(0, netProfit), 1);
    const pPct = Math.max(0, Math.min(100, Math.round((Math.max(0, netProfit) / base) * 100)));
    const cPct = Math.max(0, Math.min(100, Math.round((totalDirectCosts / base) * 100)));
    const ePct = Math.max(0, Math.min(100, Math.round((totalExpenses / base) * 100)));

    return {
      profitBarPct: pPct,
      costsBarPct: cPct,
      expensesBarPct: ePct,
      expensePillValue: totalExpenses > 0 ? money(totalExpenses) : money(totalDirectCosts),
    };
  }, [totalRevenue, totalDirectCosts, totalExpenses, netProfit]);

  // Delta porcentual de ingresos vs período anterior
  const revenueDelta = useMemo(() => {
    if (!metrics.period_days || !metrics.previous?.sales_revenue) return null;
    const prev = Number(metrics.previous.sales_revenue);
    if (prev <= 0) return null;
    const diff = Math.round(((totalRevenue - prev) / prev) * 100);
    return diff;
  }, [totalRevenue, metrics.period_days, metrics.previous?.sales_revenue]);

  // Delta porcentual de profit vs período anterior
  const profitDelta = useMemo(() => {
    if (!metrics.period_days || !metrics.previous?.sales_profit) return null;
    const prev = Number(metrics.previous.sales_profit);
    if (prev <= 0) return null;
    const diff = Math.round(((netProfit - prev) / prev) * 100);
    return diff;
  }, [netProfit, metrics.period_days, metrics.previous?.sales_profit]);

  return (
    <div className="overview-flow fintech-dashboard-flow">
      {/* Estructura móvil: resumen simplificado */}
      <MobileOverview
        metrics={metrics}
        orders={orders}
        grossMargin={grossMargin}
        grossProfit={grossProfit}
        onOpenOrders={canOpenOrders ? () => onSectionChange("transactions") : undefined}
        onOpenFinance={() => onSectionChange("finance")}
      />

      {/* ========================================================
          BARRA DE NAVEGACIÓN SUPERIOR FINTECH (ESTILO RAXON)
         ======================================================== */}
      <header className="fintech-top-nav">
        <div className="fintech-nav-left">
          <div className="fintech-pills">
            <button
              type="button"
              className="fintech-pill is-active"
              aria-current="page"
            >
              <span>Resumen</span>
            </button>
            <button
              type="button"
              className="fintech-pill"
              onClick={() => onSectionChange("transactions")}
            >
              <ReceiptText size={14} />
              <span>Transacciones</span>
            </button>
            <button
              type="button"
              className="fintech-pill"
              onClick={() => onSectionChange("expenses")}
            >
              <Wallet size={14} />
              <span>Presupuesto y Gastos</span>
            </button>
            <button
              type="button"
              className="fintech-pill"
              onClick={() => onSectionChange("reports")}
            >
              <BarChart3 size={14} />
              <span>Reportes</span>
            </button>
          </div>
        </div>

        <div className="fintech-nav-right">
          <div className="fintech-live-badge" title="Métricas calculadas en tiempo real">
            <span className="fintech-live-dot" />
            <span>En vivo</span>
          </div>
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
      </header>

      {/* Alertas críticas del negocio */}
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

      {/* ========================================================
          PANEL FINTECH PRINCIPAL (INSPIRADO EN LA REFERENCIA)
         ======================================================== */}
      <section className="fintech-grid-container">
        {/* COLUMNA 1: TOTAL BALANCE / CAJA RECAUDADA */}
        <div className="fintech-card fintech-balance-card">
          <div className="fintech-card-header">
            <div className="fintech-header-icon-label">
              <span className="fintech-icon-circle">
                <Wallet size={16} />
              </span>
              <span className="fintech-header-title">Total Recaudado en Caja</span>
            </div>
            <span className="fintech-currency-badge">COP</span>
          </div>

          <div className="fintech-balance-body">
            <h1 className="fintech-main-amount">{money(totalRevenue)}</h1>
            <div className="fintech-delta-row">
              {revenueDelta !== null ? (
                <span className={`fintech-delta-pill ${revenueDelta >= 0 ? "is-up" : "is-down"}`}>
                  {revenueDelta >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                  {revenueDelta >= 0 ? `+${revenueDelta}%` : `${revenueDelta}%`} vs período anterior
                </span>
              ) : (
                <span className="fintech-delta-pill is-neutral">
                  <Sparkles size={13} /> Flujo neto en caja
                </span>
              )}
            </div>
          </div>

          <div className="fintech-quick-actions">
            <button
              type="button"
              className="fintech-action-btn fintech-action-btn--primary"
              onClick={() => onSectionChange("credit")}
            >
              <CreditCard size={15} />
              <span>Cobrar / Abonos</span>
            </button>
            <button
              type="button"
              className="fintech-action-btn fintech-action-btn--secondary"
              onClick={() => onSectionChange("transactions")}
            >
              <ShoppingBag size={15} />
              <span>Registrar Venta</span>
            </button>
            <button
              type="button"
              className="fintech-action-btn fintech-action-btn--secondary"
              onClick={() => onSectionChange("credit")}
            >
              <FileText size={15} />
              <span>Ver Cartera (CXC)</span>
            </button>
          </div>
        </div>

        {/* COLUMNA 2 - ARRIBA IZQ: INGRESOS CON DETALLE */}
        <div className="fintech-card fintech-metric-card">
          <div className="fintech-card-header">
            <div className="fintech-header-icon-label">
              <span className="fintech-icon-circle fintech-icon--income">
                <ArrowUpRight size={16} />
              </span>
              <span className="fintech-header-title">Ingresos Cobrados</span>
            </div>
            <button
              type="button"
              className="fintech-link-btn"
              onClick={() => onSectionChange("finance")}
            >
              Ver detalle
            </button>
          </div>

          <div className="fintech-metric-amount-row">
            <h2 className="fintech-card-amount">{money(totalRevenue)}</h2>
            {revenueDelta !== null && (
              <span className={`fintech-badge-sub ${revenueDelta >= 0 ? "text-emerald" : "text-rose"}`}>
                {revenueDelta >= 0 ? `+${revenueDelta}%` : `${revenueDelta}%`}
              </span>
            )}
          </div>

          <div className="fintech-breakdown-list">
            <div className="fintech-breakdown-item">
              <div className="fintech-breakdown-info">
                <span className="fintech-dot dot-contado" />
                <span className="fintech-breakdown-name">Ventas de contado ({paidOrdersCount})</span>
              </div>
              <strong className="fintech-breakdown-value">{money(paidOrdersTotal)}</strong>
            </div>

            <div className="fintech-breakdown-item">
              <div className="fintech-breakdown-info">
                <span className="fintech-dot dot-abonos" />
                <span className="fintech-breakdown-name">Abonos recibidos ({abonosCount})</span>
              </div>
              <strong className="fintech-breakdown-value">{money(abonosTotal)}</strong>
            </div>

            <div className="fintech-breakdown-item">
              <div className="fintech-breakdown-info">
                <span className="fintech-dot dot-cxc" />
                <span className="fintech-breakdown-name">Cuentas por cobrar (Cartera activa)</span>
              </div>
              <strong className="fintech-breakdown-value">{money(creditOutstanding)}</strong>
            </div>

            {creditOverdue > 0 && (
              <div className="fintech-breakdown-item is-warning">
                <div className="fintech-breakdown-info">
                  <span className="fintech-dot dot-overdue" />
                  <span className="fintech-breakdown-name text-rose">
                    Cartera vencida ({creditCustomersWithOverdue} clientes)
                  </span>
                </div>
                <strong className="fintech-breakdown-value text-rose">{money(creditOverdue)}</strong>
              </div>
            )}
          </div>
        </div>

        {/* COLUMNA 2 - ARRIBA DER: GASTOS TOTALES CON DETALLE */}
        <div className="fintech-card fintech-metric-card">
          <div className="fintech-card-header">
            <div className="fintech-header-icon-label">
              <span className="fintech-icon-circle fintech-icon--expense">
                <ArrowDownRight size={16} />
              </span>
              <span className="fintech-header-title">Gastos Operativos</span>
            </div>
            <button
              type="button"
              className="fintech-link-btn"
              onClick={() => onSectionChange("expenses")}
            >
              Ver gastos
            </button>
          </div>

          <div className="fintech-metric-amount-row">
            <h2 className="fintech-card-amount">{money(totalExpenses)}</h2>
            <span className="fintech-badge-sub text-muted">
              {metrics.committed_expenses > 0 ? "Con pendientes" : "Pagados en el periodo"}
            </span>
          </div>

          <div className="fintech-breakdown-list">
            <div className="fintech-breakdown-item">
              <div className="fintech-breakdown-info">
                <span className="fintech-dot dot-sales-exp" />
                <span className="fintech-breakdown-name">Gastos de ventas y pauta</span>
              </div>
              <strong className="fintech-breakdown-value">{money(salesExpenses)}</strong>
            </div>

            <div className="fintech-breakdown-item">
              <div className="fintech-breakdown-info">
                <span className="fintech-dot dot-admin-exp" />
                <span className="fintech-breakdown-name">Gastos administrativos y fijos</span>
              </div>
              <strong className="fintech-breakdown-value">{money(administrativeExpenses)}</strong>
            </div>

            {metrics.committed_expenses > 0 && (
              <div className="fintech-breakdown-item">
                <div className="fintech-breakdown-info">
                  <span className="fintech-dot dot-committed" />
                  <span className="fintech-breakdown-name">Comprometidos (por pagar)</span>
                </div>
                <strong className="fintech-breakdown-value text-amber">
                  {money(Number(metrics.committed_expenses))}
                </strong>
              </div>
            )}

            <div className="fintech-breakdown-item">
              <div className="fintech-breakdown-info">
                <span className="fintech-dot dot-cost" />
                <span className="fintech-breakdown-name">Costo de logística / fletes</span>
              </div>
              <strong className="fintech-breakdown-value">{money(deliveryCost)}</strong>
            </div>
          </div>
        </div>

        {/* COLUMNA 2 - ABAJO IZQ: NET PROFIT CON BARRA SEGMENTADA (IGUAL A LA IMAGEN) */}
        <div className="fintech-card fintech-profit-card">
          <div className="fintech-card-header">
            <div className="fintech-header-icon-label">
              <span className="fintech-icon-circle fintech-icon--profit">
                <TrendingUp size={16} />
              </span>
              <span className="fintech-header-title">Utilidad Neta Real (Net Profit)</span>
            </div>
            <span className={`fintech-margin-pill ${netProfit >= 0 ? "is-positive" : "is-negative"}`}>
              {netMargin}% Margen
            </span>
          </div>

          <div className="fintech-metric-amount-row">
            <h2 className="fintech-card-amount">
              {metrics.missing_cost_items > 0 ? "Costos incompletos" : money(netProfit)}
            </h2>
            {profitDelta !== null && (
              <span className={`fintech-badge-sub ${profitDelta >= 0 ? "text-emerald" : "text-rose"}`}>
                {profitDelta >= 0 ? `+${profitDelta}%` : `${profitDelta}%`} vs ant.
              </span>
            )}
          </div>

          {/* LA BARRA SEGMENTADA SOLICITADA EXACTAMENTE COMO LA IMAGEN */}
          <div className="fintech-segmented-bar-container">
            {/* Pill flotante indicando el rubro de gastos / utilidad */}
            <div
              className="fintech-bar-floating-tag"
              style={{
                left: `${Math.min(Math.max(profitBarPct, 15), 75)}%`,
              }}
            >
              <span>{expensePillValue}</span>
            </div>

            <div className="fintech-segmented-track">
              {profitBarPct > 0 && (
                <div
                  className="fintech-segment segment--profit"
                  style={{ width: `${profitBarPct}%` }}
                  title={`Utilidad neta: ${profitBarPct}% (${money(netProfit)})`}
                />
              )}
              {costsBarPct > 0 && (
                <div
                  className="fintech-segment segment--costs"
                  style={{ width: `${costsBarPct}%` }}
                  title={`Costos mercancía + fletes: ${costsBarPct}% (${money(totalDirectCosts)})`}
                />
              )}
              {expensesBarPct > 0 && (
                <div
                  className="fintech-segment segment--expenses"
                  style={{ width: `${expensesBarPct}%` }}
                  title={`Gastos operativos: ${expensesBarPct}% (${money(totalExpenses)})`}
                />
              )}
            </div>

            <div className="fintech-segmented-legend">
              <div className="fintech-legend-item">
                <span className="legend-dot dot--profit" />
                <span className="legend-label">Utilidad {profitBarPct}%</span>
              </div>
              <div className="fintech-legend-item">
                <span className="legend-dot dot--costs" />
                <span className="legend-label">Mercancía {costsBarPct}%</span>
              </div>
              <div className="fintech-legend-item">
                <span className="legend-dot dot--expenses" />
                <span className="legend-label">Gastos {expensesBarPct}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* COLUMNA 2 - ABAJO DER: TARJETA DE REPORTE FINANCIERO (ESTILO ELEGANTE DE LA IMAGEN) */}
        <div className="fintech-card fintech-report-banner-card">
          <div className="fintech-report-bg-glow" />
          <div className="fintech-report-content">
            <div className="fintech-report-badge">
              <BarChart3 size={15} />
              <span>Reporte Financiero</span>
            </div>
            <h3 className="fintech-report-title">Balance y Rendimiento</h3>
            <p className="fintech-report-desc">
              Genera el reporte ejecutivo consolidado de ventas, cobranza y rentabilidad listo para enviar o descargar.
            </p>

            <div className="fintech-report-actions">
              <button
                type="button"
                className="fintech-report-cta"
                onClick={onGenerateReport}
                disabled={reportLoading}
              >
                <Sparkles size={15} />
                <span>{reportLoading ? "Generando reporte…" : "Generar reporte semanal"}</span>
              </button>
              <button
                type="button"
                className="fintech-report-secondary-btn"
                onClick={() => onSectionChange("reports")}
              >
                <CalendarDays size={15} />
                <span>Por período</span>
              </button>
            </div>

            {reportError && (
              <p className="fintech-report-error" role="alert">
                {reportError}
              </p>
            )}

            {reportResult && (
              <div className="fintech-report-success">
                <CheckCircle2 size={16} />
                <span>
                  Reporte {reportResult.label} listo.{" "}
                  <a href={reportResult.whatsappUrl} target="_blank" rel="noreferrer">
                    Abrir en WhatsApp →
                  </a>
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ========================================================
          NUEVA SECCIÓN SOLICITADA: PERFUMERÍA COMPLETA (FRASCOS ENTEROS)
          Similar a decants, pero exclusiva para botellas cerradas (> 10 ml)
         ======================================================== */}
      <FullBottlesSection
        orders={orders}
        period={activePeriod}
        periodDays={metricsPeriod}
      />

      {/* ========================================================
          SECCIÓN DE DECANTS (10 ML) CORREGIDA Y FLUIDA
         ======================================================== */}
      <DecantsSection
        orders={orders}
        period={activePeriod}
        periodDays={metricsPeriod}
      />

      {/* ========================================================
          MÉTRICAS COMPLEMENTARIAS: CARTERA, INVENTARIO Y CLIENTES
         ======================================================== */}
      <div className="metric-groups">
        <MetricGroup
          title="Cartera y Créditos"
          hint="Ventas a fiado, saldo pendiente por cobrar y utilidad por liberar."
          icon={<DollarSign />}
        >
          <Metric title="Ventas a crédito" value={String(metrics.credit_sales)} numericValue={metrics.credit_sales} icon={<ReceiptText />} />
          <Metric title="Total colocado a crédito" value={money(Number(metrics.credit_revenue))} numericValue={Number(metrics.credit_revenue)} format="money" icon={<BarChart3 />} />
          <Metric title="Por cobrar (CXC)" value={money(Number(metrics.credit_outstanding_balance))} numericValue={Number(metrics.credit_outstanding_balance)} format="money" icon={<DollarSign />} onClick={() => onSectionChange("credit")} />
          <Metric
            title="Utilidad no cobrada"
            value={money(Number(metrics.locked_credit_profit))}
            numericValue={Number(metrics.locked_credit_profit)}
            format="money"
            icon={<Lock />}
            hint="Margen de los fiados abiertos; se libera a medida que los clientes abonan."
          />
        </MetricGroup>

        <MetricGroup
          title="Inventario y Stock"
          hint="Disponibilidad en bodega y productos activos."
          icon={<Package />}
        >
          <Metric title="Productos activos" value={String(products.filter((product) => !product.archived).length)} numericValue={products.filter((product) => !product.archived).length} icon={<Package />} />
          <Metric title="Unidades en stock" value={String(totalStock)} numericValue={totalStock} icon={<ShoppingBag />} />
          <Metric title="Presentaciones agotadas" value={String(soldOut)} numericValue={soldOut} icon={<X />} onClick={soldOut > 0 ? () => onDashboardDetailChange("sold-out") : undefined} />
        </MetricGroup>

        <MetricGroup
          title="Clientes y Pedidos"
          hint="Base de clientes compradores y volumen de órdenes."
          icon={<Users />}
        >
          <Metric title="Clientes registrados" value={String(metrics.customer_count)} numericValue={metrics.customer_count} icon={<Users />} onClick={() => onSectionChange("customers")} />
          <Metric title="Clientes con mora" value={String(metrics.credit_customers_with_overdue)} numericValue={metrics.credit_customers_with_overdue} icon={<AlertTriangle />} warning={metrics.credit_customers_with_overdue > 0} onClick={metrics.credit_customers_with_overdue > 0 ? () => onSectionChange("credit") : undefined} />
          <Metric title="Pedidos registrados" value={String(metrics.total_orders)} numericValue={metrics.total_orders} icon={<ReceiptText />} onClick={() => onSectionChange("transactions")} />
        </MetricGroup>
      </div>

      {/* Gráficos de evolución y volumen */}
      <Suspense fallback={<div className="loading-state" role="status"><span className="loading-spinner" aria-hidden="true" /><span>Cargando gráficas…</span></div>}>
        <Charts orders={orders} products={metrics.top_products} />
      </Suspense>

      {/* Rentabilidad por producto */}
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
              <h2>Qué perfume deja más utilidad</h2>
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

      {/* Insights y Alertas */}
      <section className="insight-grid">
        <div className="admin-card waste-card">
          <div className="card-title">
            <div>
              <h2>Merma</h2>
              <span>Valor perdido últimos {wasteDays} días</span>
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
              vencimiento desde el botón "Merma o ingreso" de cada presentación, aquí
              aparece cuánto se perdió.
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
                <p className="report-hint">y {waste.length - 6} presentaciones más</p>
              )}
            </>
          )}
        </div>

        <div className="admin-card">
          <div className="card-title"><div><h2>Consejo</h2><span>Lectura de inventario</span></div><Sparkles size={18}/></div>
          <p className="insight">{metrics.top_products[0]
            ? `“${metrics.top_products[0].name}” es el producto más solicitado (${metrics.top_products[0].units} unidades en pedidos). Revisa su stock antes de impulsar nuevas ventas.`
            : "Cuando registres pedidos, aquí aparecerá el producto más solicitado para ayudarte a planificar el inventario."}</p>
        </div>

        <div className="admin-card">
          <div className="card-title"><div><h2>Alertas</h2><span>Inventario y pedidos</span></div><AlertTriangle size={18}/></div>
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
