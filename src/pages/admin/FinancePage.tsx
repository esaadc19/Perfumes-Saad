import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CreditCard,
  DollarSign,
  Lock,
  Package,
  Percent,
  Plus,
  ReceiptText,
  Search,
  TrendingDown,
  TrendingUp,
  Truck,
  Wallet,
} from "lucide-react";
import AdminButton from "../../components/admin/AdminButton";
import Delta from "../../components/admin/Delta";
import EmptyState from "../../components/admin/EmptyState";
import { formatBogotaDate, money } from "../../lib/format";
import type { AdminSection } from "../../lib/admin-routes";
import type { AdminDashboardMetrics, AdminOrder } from "../../services/admin";
import type { CreditOrderSummary } from "../../services/credits";
import type { Expense } from "../../services/expenses";

interface FinancePageProps {
  metrics: AdminDashboardMetrics | null;
  orders: AdminOrder[];
  expenses: Expense[];
  creditOrders: CreditOrderSummary[];
  loading: boolean;
  metricsPeriod: 7 | 30 | 90 | null;
  onMetricsPeriodChange: (period: 7 | 30 | 90 | null) => void;
  onSectionChange: (section: AdminSection) => void;
}

type IncomeFilter = "all" | "paid_orders" | "credit_abonos";
type ExpenseFilter = "all" | "operating" | "product_cost" | "credit_cost";

const BOGOTA_ISO_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function toBogotaDate(isoTimestamp: string | null | undefined): string {
  if (!isoTimestamp) return "";
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) return isoTimestamp.slice(0, 10);
  return BOGOTA_ISO_DATE.format(parsed);
}

function inPeriod(
  dateStr: string,
  from: string | null | undefined,
  to: string | null | undefined
): boolean {
  if (!from || !to) return true;
  if (!dateStr) return false;
  return dateStr >= from && dateStr <= to;
}

export default function FinancePage({
  metrics,
  orders,
  expenses,
  creditOrders,
  loading,
  metricsPeriod,
  onMetricsPeriodChange,
  onSectionChange,
}: FinancePageProps) {
  const [incomeFilter, setIncomeFilter] = useState<IncomeFilter>("all");
  const [expenseFilter, setExpenseFilter] = useState<ExpenseFilter>("all");
  const [incomeSearch, setIncomeSearch] = useState("");
  const [expenseSearch, setExpenseSearch] = useState("");

  const periodFrom = metrics?.period_from ?? null;
  const periodTo = metrics?.period_to ?? null;

  // 1. Pedidos pagados en el periodo
  const paidOrdersInPeriod = useMemo(() => {
    return orders.filter((order) => {
      if (order.payment_status !== "paid") return false;
      const paidDate = toBogotaDate(order.paid_at ?? order.created_at);
      return inPeriod(paidDate, periodFrom, periodTo);
    });
  }, [orders, periodFrom, periodTo]);

  // 2. Abonos recibidos en el periodo de creditos que siguen abiertos
  const creditAbonosInPeriod = useMemo(() => {
    const items: Array<{
      id: string;
      orderId: string;
      orderCode: string;
      customerName: string;
      amount: number;
      paidAt: string;
      dateStr: string;
      method: string;
      note: string | null;
    }> = [];

    for (const creditOrder of creditOrders) {
      if (creditOrder.status !== "credit" && creditOrder.status !== "partial") continue;
      for (const payment of creditOrder.payments) {
        const dateStr = toBogotaDate(payment.paid_at);
        if (inPeriod(dateStr, periodFrom, periodTo)) {
          items.push({
            id: payment.id,
            orderId: creditOrder.order_id,
            orderCode: creditOrder.order_code,
            customerName: creditOrder.customer_name || "Cliente",
            amount: Number(payment.amount),
            paidAt: payment.paid_at,
            dateStr,
            method: payment.method,
            note: payment.note,
          });
        }
      }
    }

    return items.sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
  }, [creditOrders, periodFrom, periodTo]);

  // 3. Pedidos a credito abiertos creados en el periodo (cuyo costo ya salio de bolsillo)
  const openCreditOrdersInPeriod = useMemo(() => {
    return orders.filter((order) => {
      if (order.payment_status !== "credit" && order.payment_status !== "partial") return false;
      const createdDate = toBogotaDate(order.created_at);
      return inPeriod(createdDate, periodFrom, periodTo);
    });
  }, [orders, periodFrom, periodTo]);

  // 4. Gastos operativos registrados en el periodo
  const expensesInPeriod = useMemo(() => {
    return expenses.filter((expense) =>
      inPeriod(expense.expense_date, periodFrom, periodTo)
    );
  }, [expenses, periodFrom, periodTo]);

  // Totales de ingresos desglosados
  const paidOrdersTotal = useMemo(
    () => paidOrdersInPeriod.reduce((sum, o) => sum + Number(o.total), 0),
    [paidOrdersInPeriod]
  );
  const abonosTotal = useMemo(
    () => creditAbonosInPeriod.reduce((sum, a) => sum + a.amount, 0),
    [creditAbonosInPeriod]
  );

  const totalRevenue = metrics ? Number(metrics.sales_revenue) : paidOrdersTotal + abonosTotal;
  const salesCost = metrics ? Number(metrics.sales_cost) : 0;
  const deliveryCost = metrics ? Number(metrics.sales_delivery_cost) : 0;
  const creditCostPending = metrics ? Number(metrics.credit_cost_pending) : 0;
  const operatingExpenses = metrics
    ? Number(metrics.total_expenses)
    : expensesInPeriod.reduce((sum, e) => sum + Number(e.amount), 0);

  const totalOutflows = salesCost + deliveryCost + creditCostPending + operatingExpenses;
  const grossProfit = totalRevenue - salesCost - deliveryCost;
  const netProfit = metrics ? Number(metrics.sales_profit) : grossProfit - creditCostPending - operatingExpenses;
  const netMargin = metrics ? Number(metrics.net_margin_percent) : totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 1000) / 10 : 0;

  // Resumen de gastos operativos por categoria
  const expensesByCategory = useMemo(() => {
    const map = new Map<string, { category: string; amount: number; count: number }>();
    for (const expense of expensesInPeriod) {
      const cat = expense.category || "General";
      const current = map.get(cat) ?? { category: cat, amount: 0, count: 0 };
      current.amount += Number(expense.amount);
      current.count += 1;
      map.set(cat, current);
    }
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [expensesInPeriod]);

  // Filas combinadas de ingresos
  const incomeRows = useMemo(() => {
    const rows: Array<{
      id: string;
      type: "paid_order" | "credit_abono";
      dateStr: string;
      sortTime: number;
      title: string;
      subtitle: string;
      advisor: string | null;
      revenue: number;
      cost: number;
      delivery: number;
      profit: number | null;
      hasMissingCost: boolean;
    }> = [];

    if (incomeFilter === "all" || incomeFilter === "paid_orders") {
      for (const order of paidOrdersInPeriod) {
        const customerName = order.customers?.full_name?.trim() || "Cliente";
        const orderCode = `#${order.id.slice(0, 8).toUpperCase()}`;
        const itemsSummary = order.order_items
          .map((item) => `${item.product_name_snapshot} ${item.size_ml}ml ×${item.quantity}`)
          .join(", ");
        const hasMissingCost = order.order_items.some((item) => item.unit_cost_snapshot === null);
        const itemCost = order.order_items.reduce(
          (sum, item) => sum + (item.unit_cost_snapshot ?? 0) * item.quantity,
          0
        );
        const deliv = Number(order.delivery_cost ?? 0);
        const rev = Number(order.total);
        const timestamp = order.paid_at ?? order.created_at;

        rows.push({
          id: `order-${order.id}`,
          type: "paid_order",
          dateStr: toBogotaDate(timestamp),
          sortTime: new Date(timestamp).getTime(),
          title: `${orderCode} · ${customerName}`,
          subtitle: itemsSummary || "Sin productos detallados",
          advisor: order.sales_advisor_name ?? null,
          revenue: rev,
          cost: itemCost,
          delivery: deliv,
          profit: hasMissingCost ? null : rev - itemCost - deliv,
          hasMissingCost,
        });
      }
    }

    if (incomeFilter === "all" || incomeFilter === "credit_abonos") {
      for (const abono of creditAbonosInPeriod) {
        const methodLabel =
          abono.method === "transferencia"
            ? "Transferencia"
            : abono.method === "efectivo"
              ? "Efectivo"
              : "Otro";
        rows.push({
          id: `abono-${abono.id}`,
          type: "credit_abono",
          dateStr: abono.dateStr,
          sortTime: new Date(abono.paidAt).getTime(),
          title: `#${abono.orderCode} · ${abono.customerName}`,
          subtitle: `Abono a crédito (${methodLabel})${abono.note ? ` · ${abono.note}` : ""}`,
          advisor: null,
          revenue: abono.amount,
          cost: 0,
          delivery: 0,
          profit: abono.amount,
          hasMissingCost: false,
        });
      }
    }

    const q = incomeSearch.trim().toLowerCase();
    const filtered = q
      ? rows.filter(
          (row) =>
            row.title.toLowerCase().includes(q) ||
            row.subtitle.toLowerCase().includes(q) ||
            (row.advisor && row.advisor.toLowerCase().includes(q))
        )
      : rows;

    return filtered.sort((a, b) => b.sortTime - a.sortTime);
  }, [paidOrdersInPeriod, creditAbonosInPeriod, incomeFilter, incomeSearch]);

  // Filas combinadas de egresos
  const expenseRows = useMemo(() => {
    const rows: Array<{
      id: string;
      type: "operating" | "product_cost" | "credit_cost";
      dateStr: string;
      sortTime: number;
      badge: string;
      title: string;
      subtitle: string;
      productCost: number;
      deliveryCost: number;
      totalOutflow: number;
    }> = [];

    if (expenseFilter === "all" || expenseFilter === "operating") {
      for (const expense of expensesInPeriod) {
        rows.push({
          id: `exp-${expense.id}`,
          type: "operating",
          dateStr: expense.expense_date,
          sortTime: new Date(`${expense.expense_date}T12:00:00Z`).getTime(),
          badge: `Gasto · ${expense.category}`,
          title: expense.name,
          subtitle: `Gasto operativo registrado en ${expense.category}`,
          productCost: 0,
          deliveryCost: 0,
          totalOutflow: Number(expense.amount),
        });
      }
    }

    if (expenseFilter === "all" || expenseFilter === "product_cost") {
      for (const order of paidOrdersInPeriod) {
        const itemCost = order.order_items.reduce(
          (sum, item) => sum + (item.unit_cost_snapshot ?? 0) * item.quantity,
          0
        );
        const deliv = Number(order.delivery_cost ?? 0);
        const total = itemCost + deliv;
        if (total <= 0) continue;

        const customerName = order.customers?.full_name?.trim() || "Cliente";
        const orderCode = `#${order.id.slice(0, 8).toUpperCase()}`;
        const itemsSummary = order.order_items
          .map((item) => `${item.product_name_snapshot} ${item.size_ml}ml ×${item.quantity}`)
          .join(", ");
        const timestamp = order.paid_at ?? order.created_at;

        rows.push({
          id: `cost-paid-${order.id}`,
          type: "product_cost",
          dateStr: toBogotaDate(timestamp),
          sortTime: new Date(timestamp).getTime(),
          badge: "Costo venta pagada",
          title: `${orderCode} · ${customerName}`,
          subtitle: itemsSummary || "Costo de mercancía y domicilio",
          productCost: itemCost,
          deliveryCost: deliv,
          totalOutflow: total,
        });
      }
    }

    if (expenseFilter === "all" || expenseFilter === "credit_cost") {
      for (const order of openCreditOrdersInPeriod) {
        const itemCost = order.order_items.reduce(
          (sum, item) => sum + (item.unit_cost_snapshot ?? 0) * item.quantity,
          0
        );
        const deliv = Number(order.delivery_cost ?? 0);
        const total = itemCost + deliv;
        if (total <= 0) continue;

        const customerName = order.customers?.full_name?.trim() || "Cliente";
        const orderCode = `#${order.id.slice(0, 8).toUpperCase()}`;
        const itemsSummary = order.order_items
          .map((item) => `${item.product_name_snapshot} ${item.size_ml}ml ×${item.quantity}`)
          .join(", ");

        rows.push({
          id: `cost-credit-${order.id}`,
          type: "credit_cost",
          dateStr: toBogotaDate(order.created_at),
          sortTime: new Date(order.created_at).getTime(),
          badge: "Invertido en fiado",
          title: `${orderCode} · ${customerName}`,
          subtitle: itemsSummary || "Costo de mercancía y domicilio en crédito abierto",
          productCost: itemCost,
          deliveryCost: deliv,
          totalOutflow: total,
        });
      }
    }

    const q = expenseSearch.trim().toLowerCase();
    const filtered = q
      ? rows.filter(
          (row) =>
            row.title.toLowerCase().includes(q) ||
            row.subtitle.toLowerCase().includes(q) ||
            row.badge.toLowerCase().includes(q)
        )
      : rows;

    return filtered.sort((a, b) => b.sortTime - a.sortTime);
  }, [expensesInPeriod, paidOrdersInPeriod, openCreditOrdersInPeriod, expenseFilter, expenseSearch]);

  const periodRangeText = useMemo(() => {
    if (!periodFrom || !periodTo) return "Todo el historial acumulado";
    return `Del ${formatBogotaDate(periodFrom)} al ${formatBogotaDate(periodTo)}`;
  }, [periodFrom, periodTo]);

  return (
    <div className="finance-page">
      {/* Cabecera con regreso rapido y selector de periodo */}
      <div className="finance-toolbar">
        <div className="finance-toolbar-left">
          <AdminButton
            tone="secondary"
            compact
            type="button"
            onClick={() => onSectionChange("overview")}
          >
            <ArrowLeft size={16} /> Volver al Dashboard
          </AdminButton>
          <span className="finance-period-caption">
            <CalendarDays size={15} /> {periodRangeText}
          </span>
        </div>

        <div className="metrics-period">
          <span className="metrics-period-label">Período</span>
          <div className="chart-period-switch" role="group" aria-label="Rango de tiempo financiero">
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
      </div>

      {loading && !metrics && (
        <div className="loading-state" role="status">
          <span className="loading-spinner" aria-hidden="true" />
          <span>Calculando resumen financiero, ingresos y egresos…</span>
        </div>
      )}

      {/* Tarjetas principales de Resumen Financiero */}
      <section className="finance-hero-grid" aria-label="Indicadores financieros principales">
        <article className="finance-kpi-card finance-kpi-card--income">
          <div className="finance-kpi-head">
            <span className="finance-kpi-icon">
              <ArrowUpRight size={18} />
            </span>
            <span className="finance-kpi-label">Total Ingresos Cobrados</span>
          </div>
          <strong className="finance-kpi-value">{money(totalRevenue)}</strong>
          {metrics?.period_days && (
            <Delta
              current={totalRevenue}
              previous={Number(metrics.previous.sales_revenue)}
            />
          )}
          <div className="finance-kpi-Sublist">
            <div>
              <span>Ventas pagadas ({paidOrdersInPeriod.length})</span>
              <strong>{money(paidOrdersTotal)}</strong>
            </div>
            <div>
              <span>Abonos de fiados ({creditAbonosInPeriod.length})</span>
              <strong>{money(abonosTotal)}</strong>
            </div>
          </div>
        </article>

        <article className="finance-kpi-card finance-kpi-card--expense">
          <div className="finance-kpi-head">
            <span className="finance-kpi-icon">
              <ArrowDownRight size={18} />
            </span>
            <span className="finance-kpi-label">Total Egresos y Costos</span>
          </div>
          <strong className="finance-kpi-value">{money(totalOutflows)}</strong>
          <div className="finance-kpi-Sublist">
            <div>
              <span>Costo mercancía + domicilios</span>
              <strong>{money(salesCost + deliveryCost)}</strong>
            </div>
            <div>
              <span>Invertido en fiados abiertos</span>
              <strong>{money(creditCostPending)}</strong>
            </div>
            <div>
              <span>Gastos operativos ({expensesInPeriod.length})</span>
              <strong>{money(operatingExpenses)}</strong>
            </div>
          </div>
        </article>

        <article
          className={`finance-kpi-card finance-kpi-card--profit${
            netProfit < 0 ? " is-negative" : ""
          }`}
        >
          <div className="finance-kpi-head">
            <span className="finance-kpi-icon">
              {netProfit < 0 ? <TrendingDown size={18} /> : <TrendingUp size={18} />}
            </span>
            <span className="finance-kpi-label">Utilidad Neta Real</span>
          </div>
          <strong className="finance-kpi-value">
            {metrics && metrics.missing_cost_items > 0 ? "Incompleta" : money(netProfit)}
          </strong>
          {metrics?.period_days && metrics.missing_cost_items === 0 && (
            <Delta
              current={netProfit}
              previous={Number(metrics.previous.sales_profit)}
            />
          )}
          <div className="finance-kpi-Sublist">
            <div>
              <span>Margen neto sobre ingresos</span>
              <strong>{netMargin}%</strong>
            </div>
            <div>
              <span>Utilidad bruta (antes de gastos)</span>
              <strong>{money(grossProfit)}</strong>
            </div>
          </div>
        </article>
      </section>

      {/* Bloque 1: Estado de Resultados / Resumen Financiero paso a paso */}
      <section className="admin-card finance-statement-card">
        <div className="card-title">
          <div>
            <h2>Resumen Financiero (Estado de Resultados)</h2>
            <span>Desglose exacto de cómo se calcula tu utilidad neta en este período</span>
          </div>
          <BarChart3 size={18} />
        </div>

        <div className="finance-statement-grid">
          <div className="finance-waterfall">
            <div className="finance-line finance-line--positive">
              <div className="finance-line-info">
                <ReceiptText size={16} />
                <div>
                  <strong>(+) Ventas pagadas de contado</strong>
                  <small>{paidOrdersInPeriod.length} pedidos completados y pagados</small>
                </div>
              </div>
              <span className="finance-line-amount positive">+{money(paidOrdersTotal)}</span>
            </div>

            <div className="finance-line finance-line--positive">
              <div className="finance-line-info">
                <CreditCard size={16} />
                <div>
                  <strong>(+) Abonos recibidos de cartera</strong>
                  <small>{creditAbonosInPeriod.length} abonos cobrados de créditos abiertos</small>
                </div>
              </div>
              <span className="finance-line-amount positive">+{money(abonosTotal)}</span>
            </div>

            <div className="finance-line finance-line--subtotal">
              <div className="finance-line-info">
                <DollarSign size={16} />
                <div>
                  <strong>(=) Total Ingresos Cobrados</strong>
                  <small>Dinero efectivamente recibido en caja</small>
                </div>
              </div>
              <span className="finance-line-amount">{money(totalRevenue)}</span>
            </div>

            <div className="finance-line finance-line--negative">
              <div className="finance-line-info">
                <Package size={16} />
                <div>
                  <strong>(-) Costo de productos (ventas pagadas)</strong>
                  <small>Costo de adquisición de los perfumes ya pagados</small>
                </div>
              </div>
              <span className="finance-line-amount negative">-{money(salesCost)}</span>
            </div>

            <div className="finance-line finance-line--negative">
              <div className="finance-line-info">
                <Truck size={16} />
                <div>
                  <strong>(-) Costo de domicilios (ventas pagadas)</strong>
                  <small>Envíos asumidos por la tienda en ventas pagadas</small>
                </div>
              </div>
              <span className="finance-line-amount negative">-{money(deliveryCost)}</span>
            </div>

            <div className="finance-line finance-line--subtotal">
              <div className="finance-line-info">
                <Percent size={16} />
                <div>
                  <strong>(=) Utilidad Bruta de Ventas</strong>
                  <small>Ganancia directa antes de gastos operativos y fiados</small>
                </div>
              </div>
              <span className="finance-line-amount">{money(grossProfit)}</span>
            </div>

            <div className="finance-line finance-line--negative">
              <div className="finance-line-info">
                <Lock size={16} />
                <div>
                  <strong>(-) Costo invertido en fiados abiertos</strong>
                  <small>Mercancía y domicilio de créditos pendientes de cobro ({openCreditOrdersInPeriod.length} pedidos)</small>
                </div>
              </div>
              <span className="finance-line-amount negative">-{money(creditCostPending)}</span>
            </div>

            <div className="finance-line finance-line--negative">
              <div className="finance-line-info">
                <Wallet size={16} />
                <div>
                  <strong>(-) Gastos operativos pagados</strong>
                  <small>{expensesInPeriod.length} gastos registrados en el período</small>
                </div>
              </div>
              <span className="finance-line-amount negative">-{money(operatingExpenses)}</span>
            </div>

            <div className={`finance-line finance-line--total${netProfit < 0 ? " is-loss" : ""}`}>
              <div className="finance-line-info">
                <TrendingUp size={18} />
                <div>
                  <strong>(=) UTILIDAD NETA REAL</strong>
                  <small>Margen neto del período: {netMargin}%</small>
                </div>
              </div>
              <span className="finance-line-amount">
                {metrics && metrics.missing_cost_items > 0 ? "Incompleta" : money(netProfit)}
              </span>
            </div>
          </div>

          {/* Panel lateral: Cartera por entrar y Gastos por categoría */}
          <div className="finance-side-panels">
            <div className="finance-side-box">
              <h3>Capital pendiente en Cartera</h3>
              <p className="finance-side-hint">
                Dinero que está en la calle en ventas a crédito y se sumará a tu utilidad a medida que te abonen.
              </p>
              <div className="finance-side-rows">
                <div>
                  <span>Saldo total por cobrar (CXC)</span>
                  <strong>{money(Number(metrics?.credit_outstanding_balance ?? 0))}</strong>
                </div>
                <div>
                  <span>Utilidad proyectada en cartera</span>
                  <strong className="profit-good">{money(Number(metrics?.locked_credit_profit ?? 0))}</strong>
                </div>
                <div>
                  <span>Cartera vencida</span>
                  <strong className={Number(metrics?.credit_overdue_balance ?? 0) > 0 ? "profit-loss" : ""}>
                    {money(Number(metrics?.credit_overdue_balance ?? 0))}
                  </strong>
                </div>
                {Number(metrics?.committed_expenses ?? 0) > 0 && (
                  <div>
                    <span>Gastos recurrentes próximos</span>
                    <strong>{money(Number(metrics?.committed_expenses ?? 0))}</strong>
                  </div>
                )}
              </div>
              <div className="finance-side-actions">
                <AdminButton
                  tone="secondary"
                  compact
                  type="button"
                  onClick={() => onSectionChange("credit")}
                >
                  Ver cartera y abonos
                </AdminButton>
              </div>
            </div>

            <div className="finance-side-box">
              <div className="finance-side-box-head">
                <h3>Gastos por Categoría</h3>
                <AdminButton
                  tone="secondary"
                  compact
                  type="button"
                  onClick={() => onSectionChange("expenses")}
                >
                  <Plus size={14} /> Nuevo gasto
                </AdminButton>
              </div>
              {expensesByCategory.length === 0 ? (
                <p className="finance-side-hint">No hay gastos operativos registrados en este período.</p>
              ) : (
                <div className="finance-category-list">
                  {expensesByCategory.map((item) => {
                    const pct = operatingExpenses > 0 ? Math.round((item.amount / operatingExpenses) * 100) : 0;
                    return (
                      <div key={item.category} className="finance-category-item">
                        <div className="finance-category-top">
                          <span>
                            <strong>{item.category}</strong> <small>({item.count})</small>
                          </span>
                          <span>
                            <strong>{money(item.amount)}</strong> <small>{pct}%</small>
                          </span>
                        </div>
                        <div className="finance-category-bar">
                          <div className="finance-category-fill" style={{ width: `${Math.max(pct, 4)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Bloque 2: Detalle de Ingresos */}
      <section className="admin-card finance-detail-card">
        <div className="card-title">
          <div>
            <h2>Detalle de Ingresos ({incomeRows.length})</h2>
            <span>Todas las entradas de dinero del período por ventas pagadas y abonos de clientes</span>
          </div>
          <TrendingUp size={18} />
        </div>

        <div className="finance-filter-bar">
          <div className="chart-period-switch" role="group" aria-label="Filtrar ingresos">
            <button
              type="button"
              className={incomeFilter === "all" ? "selected" : ""}
              onClick={() => setIncomeFilter("all")}
            >
              Todos ({paidOrdersInPeriod.length + creditAbonosInPeriod.length})
            </button>
            <button
              type="button"
              className={incomeFilter === "paid_orders" ? "selected" : ""}
              onClick={() => setIncomeFilter("paid_orders")}
            >
              Ventas pagadas ({paidOrdersInPeriod.length})
            </button>
            <button
              type="button"
              className={incomeFilter === "credit_abonos" ? "selected" : ""}
              onClick={() => setIncomeFilter("credit_abonos")}
            >
              Abonos de crédito ({creditAbonosInPeriod.length})
            </button>
          </div>

          <div className="search-box finance-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={incomeSearch}
              onChange={(e) => setIncomeSearch(e.target.value)}
              placeholder="Buscar cliente, pedido, perfume o asesor…"
              aria-label="Buscar en ingresos"
            />
          </div>
        </div>

        {incomeRows.length === 0 ? (
          <EmptyState
            icon={<ReceiptText size={26} />}
            title="Sin ingresos en este filtro"
            hint="No se encontraron ventas pagadas ni abonos para el período o búsqueda seleccionada."
          />
        ) : (
          <div className="admin-table finance-table-wrap">
            <div className="table-row finance-income-row header">
              <span>Fecha</span>
              <span>Tipo</span>
              <span>Cliente / Detalle</span>
              <span>Costo + Envío</span>
              <span>Ingreso</span>
              <span>Utilidad</span>
            </div>
            {incomeRows.map((row) => (
              <div className="table-row finance-income-row" key={row.id}>
                <span className="finance-date">{formatBogotaDate(row.dateStr)}</span>
                <span>
                  <span
                    className={`finance-badge ${
                      row.type === "paid_order" ? "finance-badge--sale" : "finance-badge--abono"
                    }`}
                  >
                    {row.type === "paid_order" ? "Venta pagada" : "Abono crédito"}
                  </span>
                </span>
                <div className="finance-row-main">
                  <strong>{row.title}</strong>
                  <span>{row.subtitle}</span>
                  {row.advisor && <small>Asesor: {row.advisor}</small>}
                </div>
                <span className="finance-num">
                  {row.type === "credit_abono" ? "—" : money(row.cost + row.delivery)}
                </span>
                <span className="finance-num profit-good">+{money(row.revenue)}</span>
                <span
                  className={`finance-num ${
                    row.profit === null
                      ? "profit-unknown"
                      : row.profit >= 0
                        ? "profit-good"
                        : "profit-loss"
                  }`}
                >
                  {row.profit === null ? "Sin costo" : money(row.profit)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Bloque 3: Detalle de Egresos */}
      <section className="admin-card finance-detail-card">
        <div className="card-title">
          <div>
            <h2>Detalle de Egresos y Costos ({expenseRows.length})</h2>
            <span>Salidas de dinero por gastos operativos, costo de productos vendidos, domicilios y créditos abiertos</span>
          </div>
          <Wallet size={18} />
        </div>

        <div className="finance-filter-bar">
          <div className="chart-period-switch" role="group" aria-label="Filtrar egresos">
            <button
              type="button"
              className={expenseFilter === "all" ? "selected" : ""}
              onClick={() => setExpenseFilter("all")}
            >
              Todos
            </button>
            <button
              type="button"
              className={expenseFilter === "operating" ? "selected" : ""}
              onClick={() => setExpenseFilter("operating")}
            >
              Gastos operativos ({expensesInPeriod.length})
            </button>
            <button
              type="button"
              className={expenseFilter === "product_cost" ? "selected" : ""}
              onClick={() => setExpenseFilter("product_cost")}
            >
              Costos ventas pagadas
            </button>
            <button
              type="button"
              className={expenseFilter === "credit_cost" ? "selected" : ""}
              onClick={() => setExpenseFilter("credit_cost")}
            >
              Costos en fiados ({openCreditOrdersInPeriod.length})
            </button>
          </div>

          <div className="search-box finance-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={expenseSearch}
              onChange={(e) => setExpenseSearch(e.target.value)}
              placeholder="Buscar gasto, categoría, pedido o producto…"
              aria-label="Buscar en egresos"
            />
          </div>
        </div>

        {expenseRows.length === 0 ? (
          <EmptyState
            icon={<Wallet size={26} />}
            title="Sin egresos en este filtro"
            hint="No se encontraron gastos ni costos para el período o búsqueda seleccionada."
          />
        ) : (
          <div className="admin-table finance-table-wrap">
            <div className="table-row finance-expense-row header">
              <span>Fecha</span>
              <span>Categoría / Tipo</span>
              <span>Concepto / Detalle</span>
              <span>Costo Prod.</span>
              <span>Domicilio</span>
              <span>Salida Total</span>
            </div>
            {expenseRows.map((row) => (
              <div className="table-row finance-expense-row" key={row.id}>
                <span className="finance-date">{formatBogotaDate(row.dateStr)}</span>
                <span>
                  <span className={`finance-badge finance-badge--${row.type}`}>
                    {row.badge}
                  </span>
                </span>
                <div className="finance-row-main">
                  <strong>{row.title}</strong>
                  <span>{row.subtitle}</span>
                </div>
                <span className="finance-num">
                  {row.type === "operating" ? "—" : money(row.productCost)}
                </span>
                <span className="finance-num">
                  {row.type === "operating" ? "—" : money(row.deliveryCost)}
                </span>
                <span className="finance-num profit-loss">-{money(row.totalOutflow)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
