import { useMemo } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  FileText,
  ReceiptText,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
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
import { type PeriodPreset } from "../../services/admin-periods";
import { getPeriodRange } from "../../lib/decants-metrics";

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
  onCreateOrder?: () => void;
  reportLoading: boolean;
  reportError: string | null;
  reportResult: ReportResult | null;
  onGenerateReport: () => void;
}

export default function DashboardPage({
  metrics,
  orders,
  expenses = [],
  metricsPeriod,
  periodPreset,
  periodCustomFrom,
  periodCustomTo,
  isPeriodAllTime = false,
  onPeriodPresetChange,
  onPeriodCustomRangeChange,
  onPeriodToggleAllTime,
  onSectionChange,
  onCreateOrder,
  reportLoading,
  reportError,
  reportResult,
  onGenerateReport,
}: DashboardPageProps) {
  const activePeriod = useMemo(() => {
    return getPeriodRange(metricsPeriod ?? 30, metrics.period_from, metrics.period_to);
  }, [metricsPeriod, metrics.period_from, metrics.period_to]);

  // Cálculos de P&L corporativo (Ingresos, Costos, Gastos, Margen Neto)
  const totalRevenue = Number(metrics.sales_revenue ?? 0);
  const salesCost = Number(metrics.sales_cost ?? 0);
  const deliveryCost = Number(metrics.sales_delivery_cost ?? 0);
  const totalDirectCosts = salesCost + deliveryCost;

  const totalExpenses = Number(metrics.total_expenses ?? 0);
  const netProfit = Number(metrics.sales_profit ?? 0);
  const netMargin = Number(metrics.net_margin_percent ?? 0);

  // Cartera y cuentas por cobrar
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

  // Proporciones para la barra segmentada de la tarjeta "Net Profit" (estilo Fintech)
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
      {/* ========================================================
          1. BARRA DE NAVEGACIÓN SUPERIOR FINTECH (TABS + PERÍODO)
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

      {/* ========================================================
          2. PANEL FINTECH PRINCIPAL (SOLO LO PEDIDO)
         ======================================================== */}
      <section className="fintech-grid-container">
        {/* TARJETA 1: TOTAL BALANCE / CAJA RECAUDADA */}
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
              onClick={() => {
                if (onCreateOrder) {
                  onCreateOrder();
                } else {
                  onSectionChange("transactions");
                }
              }}
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

        {/* TARJETA 2: INGRESOS CON DETALLADO DE CONTADO, ABONOS Y CARTERA */}
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

        {/* TARJETA 3: GASTOS TOTALES CON DETALLADO OPERATIVO */}
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

        {/* TARJETA 4: NET PROFIT CON BARRA SEGMENTADA (IGUAL A LA IMAGEN) */}
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

          {/* BARRA SEGMENTADA CON TAG FLOTANTE Y LEYENDA */}
          <div className="fintech-segmented-bar-container">
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

        {/* TARJETA 5: BANNER DE REPORTE FINANCIERO */}
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
          3. SECCIÓN DE PERFUMERÍA COMPLETA (FRASCOS ENTEROS > 10 ML)
         ======================================================== */}
      <FullBottlesSection
        orders={orders}
        period={activePeriod}
        periodDays={metricsPeriod}
      />

      {/* ========================================================
          4. SECCIÓN DE DECANTS (SOLO EL CUADRO DE DECANTS DE 10 ML)
         ======================================================== */}
      <DecantsSection
        orders={orders}
        period={activePeriod}
        periodDays={metricsPeriod}
      />
    </div>
  );
}
