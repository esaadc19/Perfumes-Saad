import type { AdminDashboardMetrics, AdminOrder } from "../services/admin";
import type { Expense } from "../services/expenses";

const BOGOTA_ISO_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function toBogotaDateStr(isoTimestamp: string | null | undefined): string {
  if (!isoTimestamp) return "";
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) return isoTimestamp.slice(0, 10);
  return BOGOTA_ISO_DATE.format(parsed);
}

export function isDateInPeriod(
  dateStr: string,
  from: string | null | undefined,
  to: string | null | undefined
): boolean {
  if (!from || !to) return true;
  if (!dateStr) return false;
  return dateStr >= from && dateStr <= to;
}

export interface OrderFinancialBreakdown {
  /** Si el pedido aporta a las cifras (pagado o credito con abono > 0). */
  isActiveSale: boolean;
  isPaid: boolean;
  isOpenCredit: boolean;
  hasMissingCost: boolean;
  /** Valor total acordado del pedido. */
  orderTotal: number;
  /** Dinero efectivamente cobrado hasta hoy (total si pagado, o suma de abonos si credito). */
  collectedRevenue: number;
  /** Saldo pendiente por cobrar si es credito abierto. */
  creditBalance: number;
  /** Costo total de productos del pedido. */
  fullProductCost: number;
  /** Costo total de domicilio del pedido. */
  fullDeliveryCost: number;
  /** Costo total (productos + domicilio). */
  fullCost: number;
  /**
   * Costo de productos cubierto por los abonos recibidos:
   * Sube con cada abono hasta topar `fullProductCost`.
   */
  coveredProductCost: number;
  /**
   * Costo de domicilio cubierto por los abonos recibidos:
   * Sube una vez cubierto el costo de producto, hasta topar `fullDeliveryCost`.
   */
  coveredDeliveryCost: number;
  /** Costo total ya cubierto por lo abonado: `min(collectedRevenue, fullCost)`. */
  coveredCost: number;
  /** Costo del pedido a credito que aun falta por recuperar con futuros abonos. */
  unrecoveredCost: number;
  /**
   * Utilidad ya realizada:
   * Mientras lo abonado no supere `fullCost`, la utilidad es 0 (se esta recuperando el costo).
   * Cuando lo abonado supera `fullCost`, cada peso adicional es utilidad.
   */
  realizedProfit: number | null;
  /** Utilidad que sigue en cartera pendiente de cobro. */
  lockedProfit: number;
}

/**
 * Calcula el desglose progresivo de venta, costo y utilidad de un pedido.
 *
 * Regla de negocio:
 * Cuando entra un abono en una venta a credito (ej. venta de $200.000 con costo de $100.000):
 * 1. El abono se suma al valor vendido (`collectedRevenue`).
 * 2. Primero cubre el costo hasta llegar al tope del costo (`coveredCost = min(abonado, $100.000)`).
 * 3. Una vez cubierto el costo de $100.000, el excedente se suma a la utilidad (`realizedProfit = max(0, abonado - $100.000)`).
 */
export function getOrderFinancialBreakdown(order: AdminOrder): OrderFinancialBreakdown {
  const isPaid = order.payment_status === "paid";
  const isOpenCredit = order.payment_status === "credit" || order.payment_status === "partial";
  const hasMissingCost = order.order_items.some((item) => item.unit_cost_snapshot === null);

  const orderTotal = Number(order.total ?? 0);
  const fullProductCost = order.order_items.reduce(
    (sum, item) => sum + Number(item.unit_cost_snapshot ?? 0) * item.quantity,
    0
  );
  const fullDeliveryCost = Number(order.delivery_cost ?? 0);
  const fullCost = fullProductCost + fullDeliveryCost;

  if (isPaid) {
    return {
      isActiveSale: true,
      isPaid: true,
      isOpenCredit: false,
      hasMissingCost,
      orderTotal,
      collectedRevenue: orderTotal,
      creditBalance: 0,
      fullProductCost,
      fullDeliveryCost,
      fullCost,
      coveredProductCost: fullProductCost,
      coveredDeliveryCost: fullDeliveryCost,
      coveredCost: fullCost,
      unrecoveredCost: 0,
      realizedProfit: hasMissingCost ? null : orderTotal - fullCost,
      lockedProfit: 0,
    };
  }

  if (isOpenCredit) {
    const creditBalance = Math.max(0, Number(order.credit_amount ?? 0));
    const collectedRevenue = Math.max(0, orderTotal - creditBalance);
    const coveredProductCost = Math.min(collectedRevenue, fullProductCost);
    const coveredDeliveryCost = Math.min(
      Math.max(0, collectedRevenue - fullProductCost),
      fullDeliveryCost
    );
    const coveredCost = coveredProductCost + coveredDeliveryCost;
    const unrecoveredCost = Math.max(0, fullCost - coveredCost);
    const realizedProfit = hasMissingCost ? null : Math.max(0, collectedRevenue - fullCost);
    const totalPotentialProfit = Math.max(0, orderTotal - fullCost);
    const lockedProfit = Math.max(0, totalPotentialProfit - (realizedProfit ?? 0));

    return {
      isActiveSale: collectedRevenue > 0,
      isPaid: false,
      isOpenCredit: true,
      hasMissingCost,
      orderTotal,
      collectedRevenue,
      creditBalance,
      fullProductCost,
      fullDeliveryCost,
      fullCost,
      coveredProductCost,
      coveredDeliveryCost,
      coveredCost,
      unrecoveredCost,
      realizedProfit,
      lockedProfit,
    };
  }

  return {
    isActiveSale: false,
    isPaid: false,
    isOpenCredit: false,
    hasMissingCost,
    orderTotal,
    collectedRevenue: 0,
    creditBalance: 0,
    fullProductCost,
    fullDeliveryCost,
    fullCost,
    coveredProductCost: 0,
    coveredDeliveryCost: 0,
    coveredCost: 0,
    unrecoveredCost: 0,
    realizedProfit: null,
    lockedProfit: 0,
  };
}

/**
 * Recalcula las metricas del dashboard aplicando la regla progresiva de abonos:
 * - Cada abono suma a `sales_revenue`
 * - Cubre primero `sales_cost` y `sales_delivery_cost` hasta el tope del pedido
 * - Lo que supere el costo del pedido suma a `sales_profit` (menos los gastos del periodo)
 */
export function applyProgressiveMetrics(
  baseMetrics: AdminDashboardMetrics,
  orders: AdminOrder[],
  expenses?: Expense[]
): AdminDashboardMetrics {
  const from = baseMetrics.period_from;
  const to = baseMetrics.period_to;

  let salesRevenue = 0;
  let salesCost = 0;
  let salesDeliveryCost = 0;
  let grossOrderProfit = 0;
  let creditCostPending = 0;
  let lockedCreditProfit = 0;
  let creditOutstandingBalance = 0;
  let creditRevenue = 0;
  let creditSalesCount = 0;

  for (const order of orders) {
    const b = getOrderFinancialBreakdown(order);

    if (b.isPaid) {
      const dateStr = toBogotaDateStr(order.paid_at ?? order.created_at);
      if (isDateInPeriod(dateStr, from, to)) {
        salesRevenue += b.collectedRevenue;
        salesCost += b.coveredProductCost;
        salesDeliveryCost += b.coveredDeliveryCost;
        grossOrderProfit += b.realizedProfit ?? 0;
      }
    } else if (b.isOpenCredit) {
      creditOutstandingBalance += b.creditBalance;
      const dateStr = toBogotaDateStr(order.created_at);
      if (isDateInPeriod(dateStr, from, to)) {
        creditSalesCount += 1;
        creditRevenue += b.orderTotal;
        salesRevenue += b.collectedRevenue;
        salesCost += b.coveredProductCost;
        salesDeliveryCost += b.coveredDeliveryCost;
        grossOrderProfit += b.realizedProfit ?? 0;
        creditCostPending += b.unrecoveredCost;
        lockedCreditProfit += b.lockedProfit;
      }
    }
  }

  const totalExpenses = expenses
    ? expenses
        .filter((e) => isDateInPeriod(e.expense_date, from, to))
        .reduce((sum, e) => sum + Number(e.amount), 0)
    : Number(baseMetrics.total_expenses ?? 0);

  const salesProfit = grossOrderProfit - totalExpenses;
  const netMarginPercent =
    salesRevenue > 0 ? Math.round((salesProfit / salesRevenue) * 1000) / 10 : 0;

  return {
    ...baseMetrics,
    sales_revenue: salesRevenue,
    sales_cost: salesCost,
    sales_delivery_cost: salesDeliveryCost,
    sales_gross_profit: grossOrderProfit,
    total_expenses: totalExpenses,
    credit_cost_pending: creditCostPending,
    sales_profit: salesProfit,
    net_margin_percent: netMarginPercent,
    credit_sales: creditSalesCount,
    credit_revenue: creditRevenue,
    locked_credit_profit: lockedCreditProfit,
    credit_outstanding_balance: creditOutstandingBalance,
  };
}
