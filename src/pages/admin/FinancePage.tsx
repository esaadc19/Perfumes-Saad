import { useMemo, useState, useRef } from "react";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  DollarSign,
  FileSpreadsheet,
  HelpCircle,
  Package,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import AdminButton from "../../components/admin/AdminButton";
import Delta from "../../components/admin/Delta";
import EmptyState from "../../components/admin/EmptyState";
import { formatBogotaDate, money } from "../../lib/format";
import {
  getOrderFinancialBreakdown,
  isDateInPeriod,
  toBogotaDateStr,
} from "../../lib/order-finance";
import {
  parseNequiCsv,
  matchNequiTransactions,
  type NequiTransaction,
  type NequiMatchResult,
  type ReconcileCandidate,
} from "../../lib/nequi-reconciliation";
import type { AdminSection } from "../../lib/admin-routes";
import {
  togglePaymentReconciliation,
  batchReconcilePayments,
  type AdminDashboardMetrics,
  type AdminOrder,
} from "../../services/admin";
import {
  PAYMENT_METHODS,
  type CreditOrderSummary,
  type CreditPayment,
  type PaymentMethod,
} from "../../services/credits";
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

type TabView = "pnl" | "reconciliation";
type IncomeFilter = "all" | "paid_orders" | "credit_abonos";
type ExpenseFilter = "all" | "operating" | "product_cost" | "credit_cost";

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
  const [activeTab, setActiveTab] = useState<TabView>("pnl");
  const [incomeFilter, setIncomeFilter] = useState<IncomeFilter>("all");
  const [expenseFilter, setExpenseFilter] = useState<ExpenseFilter>("all");
  const [incomeSearch, setIncomeSearch] = useState("");
  const [expenseSearch, setExpenseSearch] = useState("");

  // Estados de conciliación
  const [reconcileAccountFilter, setReconcileAccountFilter] = useState<string>("all");
  const [reconcileStatusFilter, setReconcileStatusFilter] = useState<"all" | "pending" | "reconciled">("all");
  const [reconcileSearch, setReconcileSearch] = useState("");
  const [actualBalances, setActualBalances] = useState<Record<string, string>>({});
  const [nequiModalOpen, setNequiModalOpen] = useState(false);
  const [nequiMatches, setNequiMatches] = useState<NequiMatchResult[]>([]);
  const [nequiRawCount, setNequiRawCount] = useState(0);
  const [nequiRawTotal, setNequiRawTotal] = useState(0);
  const [savingReconciliation, setSavingReconciliation] = useState(false);
  const [reconcileFeedback, setReconcileFeedback] = useState<string | null>(null);

  const nequiFileInputRef = useRef<HTMLInputElement>(null);

  const periodFrom = metrics?.period_from ?? null;
  const periodTo = metrics?.period_to ?? null;

  // 1. Pedidos pagados en el periodo
  const paidOrdersInPeriod = useMemo(() => {
    return orders.filter((order) => {
      if (order.payment_status !== "paid") return false;
      const paidDate = toBogotaDateStr(order.paid_at ?? order.created_at);
      return isDateInPeriod(paidDate, periodFrom, periodTo);
    });
  }, [orders, periodFrom, periodTo]);

  // 2. Pedidos a credito abiertos en el periodo
  const openCreditOrdersInPeriod = useMemo(() => {
    return orders.filter((order) => {
      if (order.payment_status !== "credit" && order.payment_status !== "partial") return false;
      const createdDate = toBogotaDateStr(order.created_at);
      return isDateInPeriod(createdDate, periodFrom, periodTo);
    });
  }, [orders, periodFrom, periodTo]);

  // Pedidos a credito con abonos > 0 en el periodo
  const creditOrdersWithAbonosInPeriod = useMemo(() => {
    return openCreditOrdersInPeriod.filter((order) => {
      const b = getOrderFinancialBreakdown(order);
      return b.collectedRevenue > 0;
    });
  }, [openCreditOrdersInPeriod]);

  // 3. Gastos operativos registrados en el periodo
  const expensesInPeriod = useMemo(() => {
    return expenses.filter((expense) =>
      isDateInPeriod(expense.expense_date, periodFrom, periodTo)
    );
  }, [expenses, periodFrom, periodTo]);

  // Totales de P&L
  const paidOrdersTotal = useMemo(
    () => paidOrdersInPeriod.reduce((sum, o) => sum + Number(o.total), 0),
    [paidOrdersInPeriod]
  );
  const abonosTotal = useMemo(
    () =>
      creditOrdersWithAbonosInPeriod.reduce(
        (sum, o) => sum + getOrderFinancialBreakdown(o).collectedRevenue,
        0
      ),
    [creditOrdersWithAbonosInPeriod]
  );

  const totalRevenue = metrics ? Number(metrics.sales_revenue) : paidOrdersTotal + abonosTotal;
  const salesCost = metrics ? Number(metrics.sales_cost) : 0;
  const deliveryCost = metrics ? Number(metrics.sales_delivery_cost) : 0;
  const operatingExpenses = metrics
    ? Number(metrics.total_expenses)
    : expensesInPeriod.reduce((sum, e) => sum + Number(e.amount), 0);

  const totalOutflows = salesCost + deliveryCost + operatingExpenses;
  const grossProfit = totalRevenue - salesCost - deliveryCost;
  const netProfit = metrics ? Number(metrics.sales_profit) : grossProfit - operatingExpenses;
  const netMargin = metrics
    ? Number(metrics.net_margin_percent)
    : totalRevenue > 0
      ? Math.round((netProfit / totalRevenue) * 1000) / 10
      : 0;

  // Candidatos para conciliación (Ventas de contado + Cada abono de cartera)
  const reconcileCandidates = useMemo((): ReconcileCandidate[] => {
    const list: ReconcileCandidate[] = [];

    // Ventas pagadas de contado
    for (const order of paidOrdersInPeriod) {
      list.push({
        type: "order",
        id: order.id,
        code: `#${order.id.slice(0, 8).toUpperCase()}`,
        customerName: order.customers?.full_name?.trim() || "Cliente",
        amount: Number(order.total),
        dateStr: toBogotaDateStr(order.paid_at ?? order.created_at),
        currentMethod: order.payment_method || "efectivo",
        reconciled: Boolean(order.reconciled),
        reference: order.transaction_reference,
      });
    }

    // Abonos de créditos
    for (const co of creditOrders) {
      for (const p of co.payments || []) {
        const payDate = toBogotaDateStr(p.paid_at);
        if (isDateInPeriod(payDate, periodFrom, periodTo)) {
          list.push({
            type: "credit_payment",
            id: p.id,
            code: `Abono #${co.order_code}`,
            customerName: co.customer_name || "Cliente",
            amount: Number(p.amount),
            dateStr: payDate,
            currentMethod: p.method || "efectivo",
            reconciled: Boolean(p.reconciled),
            reference: p.transaction_reference,
          });
        }
      }
    }

    return list;
  }, [paidOrdersInPeriod, creditOrders, periodFrom, periodTo]);

  // Cuadre por canal de pago
  const channelBalances = useMemo(() => {
    const channels: Array<{
      key: PaymentMethod;
      label: string;
      inflows: number;
      outflows: number;
      expected: number;
    }> = [
      { key: "efectivo", label: "Efectivo (Caja física)", inflows: 0, outflows: 0, expected: 0 },
      { key: "nequi_daviplata", label: "Nequi / Daviplata", inflows: 0, outflows: 0, expected: 0 },
      { key: "bancolombia", label: "Bancolombia / Transferencia", inflows: 0, outflows: 0, expected: 0 },
      { key: "datafono", label: "Datafono / Link de pago", inflows: 0, outflows: 0, expected: 0 },
    ];

    for (const item of reconcileCandidates) {
      const ch = channels.find((c) => c.key === item.currentMethod) ?? channels[0];
      ch.inflows += item.amount;
    }

    for (const exp of expensesInPeriod) {
      const ch = channels.find((c) => c.key === exp.payment_method) ?? channels[0];
      ch.outflows += Number(exp.amount);
    }

    for (const ch of channels) {
      ch.expected = ch.inflows - ch.outflows;
    }

    return channels;
  }, [reconcileCandidates, expensesInPeriod]);

  // Manejo de carga de archivo Nequi
  const handleNequiFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) return;

      const transactions = parseNequiCsv(content);
      const totalNequi = transactions.reduce((sum, tx) => sum + tx.amount, 0);
      setNequiRawCount(transactions.length);
      setNequiRawTotal(totalNequi);

      const { matches } = matchNequiTransactions(transactions, reconcileCandidates);
      setNequiMatches(matches);
      setNequiModalOpen(true);
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  // Confirmar lote de Nequi
  const handleApplyNequiMatches = async () => {
    const validMatches = nequiMatches.filter((m) => m.matchedCandidate !== null);
    if (validMatches.length === 0) return;

    setSavingReconciliation(true);
    try {
      const batchPayload = validMatches.map((m) => ({
        id: m.matchedCandidate!.id,
        type: m.matchedCandidate!.type,
        method: "nequi_daviplata",
        reference: m.nequiTx.reference || m.nequiTx.id,
      }));

      const count = await batchReconcilePayments(batchPayload);
      setReconcileFeedback(`¡Conciliación completada! Se verificaron ${count} pagos con tu reporte de Nequi.`);
      setNequiModalOpen(false);

      // Refrescar estado local
      for (const item of validMatches) {
        if (item.matchedCandidate) {
          item.matchedCandidate.reconciled = true;
          item.matchedCandidate.currentMethod = "nequi_daviplata";
          item.matchedCandidate.reference = item.nequiTx.reference || item.nequiTx.id;
        }
      }
    } catch (err) {
      console.error("Error al aplicar conciliación:", err);
      alert("No se pudo completar la conciliación: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSavingReconciliation(false);
    }
  };

  // Cambiar conciliado individual
  const handleToggleReconcile = async (candidate: ReconcileCandidate) => {
    const nextReconciled = !candidate.reconciled;
    try {
      await togglePaymentReconciliation(candidate.type, candidate.id, nextReconciled);
      candidate.reconciled = nextReconciled;
      setReconcileFeedback(`Pago ${candidate.code} ${nextReconciled ? "marcado como conciliado" : "desmarcado"}.`);
    } catch (err) {
      alert("Error al actualizar: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Cambiar método individual
  const handleChangeCandidateMethod = async (candidate: ReconcileCandidate, newMethod: string) => {
    try {
      await togglePaymentReconciliation(candidate.type, candidate.id, candidate.reconciled, newMethod);
      candidate.currentMethod = newMethod;
      setReconcileFeedback(`Método de ${candidate.code} cambiado a ${newMethod}.`);
    } catch (err) {
      alert("Error al cambiar método: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Filas combinadas de ingresos P&L
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
      orderTotal: number;
      profit: number | null;
    }> = [];

    if (incomeFilter === "all" || incomeFilter === "paid_orders") {
      for (const order of paidOrdersInPeriod) {
        const b = getOrderFinancialBreakdown(order);
        const customerName = order.customers?.full_name?.trim() || "Cliente";
        const orderCode = `#${order.id.slice(0, 8).toUpperCase()}`;
        const itemsSummary = order.order_items
          .map((item) => `${item.product_name_snapshot} ${item.size_ml}ml ×${item.quantity}`)
          .join(", ");
        const timestamp = order.paid_at ?? order.created_at;

        rows.push({
          id: `order-${order.id}`,
          type: "paid_order",
          dateStr: toBogotaDateStr(timestamp),
          sortTime: new Date(timestamp).getTime(),
          title: `${orderCode} · ${customerName}`,
          subtitle: itemsSummary || "Sin productos detallados",
          advisor: order.sales_advisor_name ?? null,
          revenue: b.collectedRevenue,
          orderTotal: b.orderTotal,
          profit: b.realizedProfit,
        });
      }
    }

    if (incomeFilter === "all" || incomeFilter === "credit_abonos") {
      for (const order of creditOrdersWithAbonosInPeriod) {
        const b = getOrderFinancialBreakdown(order);
        const customerName = order.customers?.full_name?.trim() || "Cliente";
        const orderCode = `#${order.id.slice(0, 8).toUpperCase()}`;
        const itemsSummary = order.order_items
          .map((item) => `${item.product_name_snapshot} ${item.size_ml}ml ×${item.quantity}`)
          .join(", ");

        rows.push({
          id: `credit-order-${order.id}`,
          type: "credit_abono",
          dateStr: toBogotaDateStr(order.created_at),
          sortTime: new Date(order.created_at).getTime(),
          title: `${orderCode} · ${customerName}`,
          subtitle: `${itemsSummary} · Abonado ${money(b.collectedRevenue)} de ${money(b.orderTotal)}`,
          advisor: order.sales_advisor_name ?? null,
          revenue: b.collectedRevenue,
          orderTotal: b.orderTotal,
          profit: b.realizedProfit,
        });
      }
    }

    const q = incomeSearch.trim().toLowerCase();
    return q
      ? rows.filter(
          (row) =>
            row.title.toLowerCase().includes(q) ||
            row.subtitle.toLowerCase().includes(q) ||
            (row.advisor && row.advisor.toLowerCase().includes(q))
        )
      : rows;
  }, [paidOrdersInPeriod, creditOrdersWithAbonosInPeriod, incomeFilter, incomeSearch]);

  // Filas combinadas de egresos P&L
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
        const b = getOrderFinancialBreakdown(order);
        if (b.coveredCost <= 0) continue;

        const customerName = order.customers?.full_name?.trim() || "Cliente";
        const orderCode = `#${order.id.slice(0, 8).toUpperCase()}`;
        const itemsSummary = order.order_items
          .map((item) => `${item.product_name_snapshot} ${item.size_ml}ml ×${item.quantity}`)
          .join(", ");
        const timestamp = order.paid_at ?? order.created_at;

        rows.push({
          id: `cost-paid-${order.id}`,
          type: "product_cost",
          dateStr: toBogotaDateStr(timestamp),
          sortTime: new Date(timestamp).getTime(),
          badge: "Costo venta pagada",
          title: `${orderCode} · ${customerName}`,
          subtitle: itemsSummary || "Costo de mercancía y domicilio",
          productCost: b.coveredProductCost,
          deliveryCost: b.coveredDeliveryCost,
          totalOutflow: b.coveredCost,
        });
      }
    }

    if (expenseFilter === "all" || expenseFilter === "credit_cost") {
      for (const order of openCreditOrdersInPeriod) {
        const b = getOrderFinancialBreakdown(order);
        if (b.fullCost <= 0) continue;

        const customerName = order.customers?.full_name?.trim() || "Cliente";
        const orderCode = `#${order.id.slice(0, 8).toUpperCase()}`;
        const itemsSummary = order.order_items
          .map((item) => `${item.product_name_snapshot} ${item.size_ml}ml ×${item.quantity}`)
          .join(", ");

        rows.push({
          id: `cost-credit-${order.id}`,
          type: "credit_cost",
          dateStr: toBogotaDateStr(order.created_at),
          sortTime: new Date(order.created_at).getTime(),
          badge: b.coveredCost >= b.fullCost ? "Costo fiado cubierto" : "Costo en fiado",
          title: `${orderCode} · ${customerName}`,
          subtitle: `${itemsSummary} · Cubierto por abonos: ${money(b.coveredCost)} de ${money(b.fullCost)}`,
          productCost: b.coveredProductCost,
          deliveryCost: b.coveredDeliveryCost,
          totalOutflow: b.coveredCost,
        });
      }
    }

    const q = expenseSearch.trim().toLowerCase();
    return q
      ? rows.filter(
          (row) =>
            row.title.toLowerCase().includes(q) ||
            row.subtitle.toLowerCase().includes(q) ||
            row.badge.toLowerCase().includes(q)
        )
      : rows;
  }, [expensesInPeriod, paidOrdersInPeriod, openCreditOrdersInPeriod, expenseFilter, expenseSearch]);

  // Filtro de filas para la tabla de conciliación
  const visibleReconcileCandidates = useMemo(() => {
    let list = reconcileCandidates;

    if (reconcileAccountFilter !== "all") {
      list = list.filter((c) => c.currentMethod === reconcileAccountFilter);
    }

    if (reconcileStatusFilter === "pending") {
      list = list.filter((c) => !c.reconciled);
    } else if (reconcileStatusFilter === "reconciled") {
      list = list.filter((c) => c.reconciled);
    }

    const q = reconcileSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.code.toLowerCase().includes(q) ||
          c.customerName.toLowerCase().includes(q) ||
          (c.reference && c.reference.toLowerCase().includes(q))
      );
    }

    return list.sort((a, b) => (a.dateStr < b.dateStr ? 1 : -1));
  }, [reconcileCandidates, reconcileAccountFilter, reconcileStatusFilter, reconcileSearch]);

  const periodRangeText = useMemo(() => {
    if (!periodFrom || !periodTo) return "Todo el historial acumulado";
    return `Del ${formatBogotaDate(periodFrom)} al ${formatBogotaDate(periodTo)}`;
  }, [periodFrom, periodTo]);

  return (
    <div className="finance-page">
      {/* Selector de sub-sección: P&L vs Conciliación */}
      <div className="finance-subnav">
        <button
          type="button"
          className={`finance-subnav-btn${activeTab === "pnl" ? " active" : ""}`}
          onClick={() => setActiveTab("pnl")}
        >
          Estado de Resultados y Utilidad
        </button>
        <button
          type="button"
          className={`finance-subnav-btn${activeTab === "reconciliation" ? " active" : ""}`}
          onClick={() => setActiveTab("reconciliation")}
        >
          Conciliación y Cuadre de Cuentas
        </button>

      </div>

      {/* Cabecera con regreso rápido y selector de período */}
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

      {reconcileFeedback && (
        <div className="notice-banner" role="status">
          <CheckCircle2 size={16} />
          <span>{reconcileFeedback}</span>
          <button type="button" onClick={() => setReconcileFeedback(null)} aria-label="Cerrar">
            <X size={14} />
          </button>
        </div>
      )}

      {loading && !metrics && (
        <div className="loading-state" role="status">
          <span className="loading-spinner" aria-hidden="true" />
          <span>Calculando cifras financieras…</span>
        </div>
      )}

      {/* ========================================================
          VISTA 1: CONCILIACIÓN Y CUADRE DE CUENTAS
         ======================================================== */}
      {activeTab === "reconciliation" && (
        <div className="reconciliation-view">
          {/* Tarjetas de Cuadre por Canal */}
          <div className="card-title">
            <div>
              <h2>Arqueo y Cuadre por Bolsillo</h2>
              <span>Compara el saldo esperado de tus ventas contra el saldo real en tu cuenta o caja física</span>
            </div>
            <div className="reconcile-actions">
              <input
                ref={nequiFileInputRef}
                type="file"
                accept=".csv"
                style={{ display: "none" }}
                onChange={handleNequiFileUpload}
              />
              <AdminButton
                tone="primary"
                compact
                type="button"
                onClick={() => nequiFileInputRef.current?.click()}
              >
                <FileSpreadsheet size={16} /> Importar Reporte Nequi (CSV)
              </AdminButton>
            </div>
          </div>

          <div className="reconcile-channels-grid">
            {channelBalances.map((channel) => {
              const actualInput = actualBalances[channel.key] ?? "";
              const actualNum = Number(actualInput);
              const hasActual = actualInput.trim() !== "" && !isNaN(actualNum);
              const diff = hasActual ? actualNum - channel.expected : null;

              return (
                <div className="reconcile-channel-card" key={channel.key}>
                  <div className="reconcile-channel-head">
                    <strong>{channel.label}</strong>
                  </div>

                  <div className="reconcile-channel-metrics">
                    <div>
                      <span>Ingresos cobrados</span>
                      <strong className="profit-good">+{money(channel.inflows)}</strong>
                    </div>
                    <div>
                      <span>Gastos pagados</span>
                      <strong className="profit-loss">-{money(channel.outflows)}</strong>
                    </div>
                    <div className="reconcile-expected-row">
                      <span>Saldo neto esperado</span>
                      <strong>{money(channel.expected)}</strong>
                    </div>
                  </div>

                  <div className="reconcile-actual-input">
                    <label>
                      <span>Saldo real en banco / caja</span>
                      <input
                        type="number"
                        placeholder="Escribe lo que tienes"
                        value={actualInput}
                        onChange={(e) =>
                          setActualBalances((prev) => ({ ...prev, [channel.key]: e.target.value }))
                        }
                      />
                    </label>
                  </div>

                  {diff !== null && (
                    <div
                      className={`reconcile-diff-badge ${
                        diff === 0 ? "is-exact" : diff < 0 ? "is-short" : "is-over"
                      }`}
                    >
                      {diff === 0 ? (
                        <span>✓ Totalmente cuadrado</span>
                      ) : diff < 0 ? (
                        <span>Faltan {money(Math.abs(diff))}</span>
                      ) : (
                        <span>Sobran {money(diff)}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Tabla de Punteo de Movimientos */}
          <section className="admin-card finance-detail-card" style={{ marginTop: "24px" }}>
            <div className="card-title">
              <div>
                <h2>Punteo de Pagos Recibidos ({visibleReconcileCandidates.length})</h2>
                <span>Verifica cada venta o abono contra tus comprobantes o extractos</span>
              </div>
            </div>

            <div className="finance-filter-bar">
              <div className="chart-period-switch" role="group" aria-label="Filtrar por cuenta">
                <button
                  type="button"
                  className={reconcileAccountFilter === "all" ? "selected" : ""}
                  onClick={() => setReconcileAccountFilter("all")}
                >
                  Todas las cuentas
                </button>
                <button
                  type="button"
                  className={reconcileAccountFilter === "nequi_daviplata" ? "selected" : ""}
                  onClick={() => setReconcileAccountFilter("nequi_daviplata")}
                >
                  Nequi / Daviplata
                </button>
                <button
                  type="button"
                  className={reconcileAccountFilter === "bancolombia" ? "selected" : ""}
                  onClick={() => setReconcileAccountFilter("bancolombia")}
                >
                  Bancolombia
                </button>
                <button
                  type="button"
                  className={reconcileAccountFilter === "efectivo" ? "selected" : ""}
                  onClick={() => setReconcileAccountFilter("efectivo")}
                >
                  Efectivo
                </button>
                <button
                  type="button"
                  className={reconcileAccountFilter === "datafono" ? "selected" : ""}
                  onClick={() => setReconcileAccountFilter("datafono")}
                >
                  Datafono
                </button>
              </div>

              <div className="chart-period-switch" role="group" aria-label="Filtrar por verificación">
                <button
                  type="button"
                  className={reconcileStatusFilter === "all" ? "selected" : ""}
                  onClick={() => setReconcileStatusFilter("all")}
                >
                  Todos
                </button>
                <button
                  type="button"
                  className={reconcileStatusFilter === "pending" ? "selected" : ""}
                  onClick={() => setReconcileStatusFilter("pending")}
                >
                  Sin verificar
                </button>
                <button
                  type="button"
                  className={reconcileStatusFilter === "reconciled" ? "selected" : ""}
                  onClick={() => setReconcileStatusFilter("reconciled")}
                >
                  Verificados
                </button>
              </div>

              <div className="search-box finance-search">
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  value={reconcileSearch}
                  onChange={(e) => setReconcileSearch(e.target.value)}
                  placeholder="Buscar cliente, pedido o referencia…"
                />
              </div>
            </div>

            {visibleReconcileCandidates.length === 0 ? (
              <EmptyState
                icon={<Clock size={26} />}
                title="Sin movimientos"
                hint="No se encontraron pagos recibidos con los filtros actuales."
              />
            ) : (
              <div className="admin-table finance-table-wrap">
                <div className="table-row finance-income-row header">
                  <span>Fecha</span>
                  <span>Transacción / Cliente</span>
                  <span>Canal de pago</span>
                  <span>Referencia / Comprobante</span>
                  <span className="cell-right">Monto</span>
                  <span className="cell-center">Estado</span>
                </div>
                {visibleReconcileCandidates.map((candidate) => (
                  <div className="table-row finance-income-row" key={`${candidate.type}-${candidate.id}`}>
                    <span className="finance-date">{formatBogotaDate(candidate.dateStr)}</span>
                    <div className="finance-row-main">
                      <strong>{candidate.code}</strong>
                      <span>{candidate.customerName}</span>
                    </div>
                    <div>
                      <select
                        className="finance-method-select"
                        value={candidate.currentMethod}
                        onChange={(e) => handleChangeCandidateMethod(candidate, e.target.value)}
                      >
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <span>
                      {candidate.reference ? (
                        <code className="finance-ref-code">{candidate.reference}</code>
                      ) : (
                        <span style={{ color: "var(--muted)", fontSize: "12px" }}>—</span>
                      )}
                    </span>
                    <span className="finance-num profit-good cell-right">
                      +{money(candidate.amount)}
                    </span>
                    <div className="cell-center">
                      <button
                        type="button"
                        className={`reconcile-toggle-btn${candidate.reconciled ? " is-checked" : ""}`}
                        onClick={() => handleToggleReconcile(candidate)}
                        title={candidate.reconciled ? "Clic para desmarcar" : "Clic para marcar como verificado"}
                      >
                        <CheckCircle2 size={16} />
                        {candidate.reconciled ? "Verificado" : "Verificar"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Modal de Cruce Nequi */}
          {nequiModalOpen && (
            <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setNequiModalOpen(false)}>
              <div className="add-modal" style={{ maxWidth: "800px", width: "95%" }}>
                <button className="close" type="button" onClick={() => setNequiModalOpen(false)}>
                  <X />
                </button>
                <p className="eyebrow">CONCILIACIÓN NEQUI</p>
                <h2>Resultados del Cruce Automático</h2>
                <p className="credit-modal-info">
                  Se analizaron <strong>{nequiRawCount} transacciones</strong> de Nequi por un total de{" "}
                  <strong>{money(nequiRawTotal)}</strong>.
                </p>

                <div className="nequi-match-summary">
                  <span className="nequi-badge-exact">
                    ✓ Coincidencias encontradas:{" "}
                    {nequiMatches.filter((m) => m.matchedCandidate !== null).length}
                  </span>
                  <span className="nequi-badge-unmatched">
                    Sin pedido en la tienda:{" "}
                    {nequiMatches.filter((m) => m.matchedCandidate === null).length}
                  </span>
                </div>

                <div className="admin-table nequi-results-table">
                  <div className="table-row header">
                    <span>Fecha Nequi</span>
                    <span>Pagador (Nequi)</span>
                    <span>Monto</span>
                    <span>Coincidencia en tu tienda</span>
                    <span>Diagnóstico</span>
                  </div>
                  {nequiMatches.map((m, idx) => (
                    <div className="table-row" key={m.nequiTx.id || idx}>
                      <span>{m.nequiTx.dateStr}</span>
                      <strong>{m.nequiTx.payerName || "Sin nombre registrado"}</strong>
                      <span>{money(m.nequiTx.amount)}</span>
                      <div>
                        {m.matchedCandidate ? (
                          <div className="nequi-matched-item">
                            <strong>{m.matchedCandidate.code}</strong>
                            <span>{m.matchedCandidate.customerName}</span>
                          </div>
                        ) : (
                          <span style={{ color: "#d97706" }}>Sin pedido asociado</span>
                        )}
                      </div>
                      <small style={{ color: m.matchedCandidate ? "#166534" : "#991b1b" }}>
                        {m.matchReason}
                      </small>
                    </div>
                  ))}
                </div>

                <div className="edit-product-actions">
                  <AdminButton tone="secondary" type="button" onClick={() => setNequiModalOpen(false)}>
                    Cancelar
                  </AdminButton>
                  <AdminButton
                    type="button"
                    disabled={savingReconciliation || nequiMatches.every((m) => !m.matchedCandidate)}
                    onClick={handleApplyNequiMatches}
                  >
                    {savingReconciliation
                      ? "Conciliando…"
                      : `Aprobar y Conciliar (${nequiMatches.filter((m) => m.matchedCandidate).length})`}
                  </AdminButton>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          VISTA 2: ESTADO DE RESULTADOS Y UTILIDAD (P&L)
         ======================================================== */}

      {activeTab === "pnl" && (
        <>
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
                  <span>Abonos de créditos ({creditOrdersWithAbonosInPeriod.length})</span>
                  <strong>{money(abonosTotal)}</strong>
                </div>
              </div>
            </article>

            <article className="finance-kpi-card finance-kpi-card--expense">
              <div className="finance-kpi-head">
                <span className="finance-kpi-icon">
                  <ArrowDownRight size={18} />
                </span>
                <span className="finance-kpi-label">Total Costos y Egresos</span>
              </div>
              <strong className="finance-kpi-value">{money(totalOutflows)}</strong>
              <div className="finance-kpi-Sublist">
                <div>
                  <span>Costo de productos cubierto</span>
                  <strong>{money(salesCost)}</strong>
                </div>
                <div>
                  <span>Costo de domicilios cubierto</span>
                  <strong>{money(deliveryCost)}</strong>
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
                  <span>Margen neto</span>
                  <strong>{netMargin}%</strong>
                </div>
                <div>
                  <span>Utilidad bruta</span>
                  <strong>{money(grossProfit)}</strong>
                </div>
              </div>
            </article>
          </section>

          {/* Bloque 2: Detalle de Ingresos */}
          <section className="admin-card finance-detail-card">
            <div className="card-title">
              <div>
                <h2>Detalle de Ingresos Cobrados ({incomeRows.length})</h2>
                <span>Ventas pagadas de contado y abonos de créditos que ya entraron a caja</span>
              </div>
              <DollarSign size={18} />
            </div>

            <div className="finance-filter-bar">
              <div className="chart-period-switch" role="group" aria-label="Filtrar ingresos">
                <button
                  type="button"
                  className={incomeFilter === "all" ? "selected" : ""}
                  onClick={() => setIncomeFilter("all")}
                >
                  Todos ({paidOrdersInPeriod.length + creditOrdersWithAbonosInPeriod.length})
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
                  Abonos de créditos ({creditOrdersWithAbonosInPeriod.length})
                </button>
              </div>

              <div className="search-box finance-search">
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  value={incomeSearch}
                  onChange={(e) => setIncomeSearch(e.target.value)}
                  placeholder="Buscar cliente, pedido o asesor…"
                />
              </div>
            </div>

            {incomeRows.length === 0 ? (
              <EmptyState
                icon={<DollarSign size={26} />}
                title="Sin ingresos en este filtro"
                hint="No se encontraron pedidos ni abonos cobrados para el período o búsqueda seleccionada."
              />
            ) : (
              <div className="admin-table finance-table-wrap">
                <div className="table-row finance-income-row header">
                  <span>Fecha</span>
                  <span>Pedido / Cliente</span>
                  <span>Detalle de productos</span>
                  <span>Asesor</span>
                  <span>Ingreso Cobrado</span>
                  <span>Utilidad</span>
                </div>
                {incomeRows.map((row) => (
                  <div className="table-row finance-income-row" key={row.id}>
                    <span className="finance-date">{formatBogotaDate(row.dateStr)}</span>
                    <div className="finance-row-main">
                      <strong>{row.title}</strong>
                      <span className="finance-badge-type">
                        {row.type === "paid_order" ? "Venta de contado" : "Abono de cartera"}
                      </span>
                    </div>
                    <span className="finance-subtitle">{row.subtitle}</span>
                    <span className="finance-advisor">{row.advisor || "Sin asesor"}</span>
                    <span className="finance-num profit-good">+{money(row.revenue)}</span>
                    <span className="finance-num">
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
                <span>Gastos operativos registrados y costos cubiertos de productos y domicilios</span>
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
                  <span>Costo / Salida</span>
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
        </>
      )}
    </div>
  );
}
