import type { AdminOrder } from "../services/admin";
import { isDateInPeriod, toBogotaDateStr } from "./order-finance";

export interface DecantProductStats {
  name: string;
  size_ml: number;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPercent: number;
  orderCount: number;
}

export interface DecantCustomerStats {
  customerName: string;
  phone: string | null;
  email: string | null;
  units: number;
  spent: number;
  orderCount: number;
  favoriteDecant: string;
}

export interface DecantOrderItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  unitCost: number | null;
  profit: number;
}

export interface DecantOrderRow {
  orderId: string;
  customerName: string;
  customerPhone: string | null;
  dateStr: string;
  paymentStatus: string;
  decantUnits: number;
  decantRevenue: number;
  decantCost: number;
  decantProfit: number;
  items: DecantOrderItem[];
}

export interface DecantsAnalysis {
  // Resumen decants (10ml)
  decantsTotalUnits: number;
  decantsTotalRevenue: number;
  decantsTotalCost: number;
  decantsTotalProfit: number;
  decantsMarginPercent: number;
  decantsOrderCount: number;

  // Resumen productos normales (>10ml)
  normalTotalUnits: number;
  normalTotalRevenue: number;
  normalTotalCost: number;
  normalTotalProfit: number;
  normalMarginPercent: number;
  normalOrderCount: number;

  // Métricas clave solicitadas
  mostMovedDecant: DecantProductStats | null;
  mostProfitableDecant: DecantProductStats | null;
  topCustomer: DecantCustomerStats | null;

  // Rankings
  topMovedDecants: DecantProductStats[];
  topProfitableDecants: DecantProductStats[];
  topCustomers: DecantCustomerStats[];
  topNormalProducts: DecantProductStats[];

  // Lista de pedidos que contienen decants ("Decants como pedidos")
  decantOrders: DecantOrderRow[];
}

/**
 * Calcula las métricas, rankings y comparaciones de Decants (10ml) vs Productos Normales.
 */
export function getDecantsAnalysis(
  orders: AdminOrder[],
  period?: { from: string | null; to: string | null }
): DecantsAnalysis {
  // Mapas para agregar decants por perfume
  const decantsMap = new Map<string, DecantProductStats>();
  const normalMap = new Map<string, DecantProductStats>();
  // Mapa de clientes para decants
  const customersMap = new Map<
    string,
    {
      customerName: string;
      phone: string | null;
      email: string | null;
      units: number;
      spent: number;
      orders: Set<string>;
      productCounts: Map<string, number>;
    }
  >();

  const decantOrdersList: DecantOrderRow[] = [];

  let decantsTotalUnits = 0;
  let decantsTotalRevenue = 0;
  let decantsTotalCost = 0;

  let normalTotalUnits = 0;
  let normalTotalRevenue = 0;
  let normalTotalCost = 0;

  const decantOrderIds = new Set<string>();
  const normalOrderIds = new Set<string>();

  for (const order of orders) {
    // Si se especifica periodo, filtrar por fecha de pago o creacion
    const dateStr = toBogotaDateStr(order.paid_at || order.created_at);
    if (period && !isDateInPeriod(dateStr, period.from, period.to)) {
      continue;
    }

    const isPaid = order.payment_status === "paid";
    // Solo sumamos ingresos realizados en ventas pagadas (o abonos parciales)
    // Para rankings de movimiento y cliente tomamos pedidos válidos
    const customerName =
      order.customers?.full_name?.trim() || "Cliente casual";
    const customerKey =
      order.customer_id || `${customerName}-${order.customers?.phone || ""}`;

    const orderDecantItems: DecantOrderItem[] = [];
    let orderDecantUnits = 0;
    let orderDecantRevenue = 0;
    let orderDecantCost = 0;

    for (const item of order.order_items) {
      const isDecant = Number(item.size_ml) === 10;
      const units = Number(item.quantity ?? 0);
      const revenue = Number(item.subtotal ?? 0);
      const unitCost =
        item.unit_cost_snapshot !== null
          ? Number(item.unit_cost_snapshot)
          : null;
      const cost = unitCost !== null ? unitCost * units : 0;
      const profit = revenue - cost;

      if (isDecant) {
        decantOrderIds.add(order.id);
        if (isPaid) {
          decantsTotalUnits += units;
          decantsTotalRevenue += revenue;
          decantsTotalCost += cost;
        }

        orderDecantUnits += units;
        orderDecantRevenue += revenue;
        orderDecantCost += cost;

        orderDecantItems.push({
          productName: item.product_name_snapshot,
          quantity: units,
          unitPrice: Number(item.unit_price ?? 0),
          subtotal: revenue,
          unitCost,
          profit,
        });

        // Agregar por producto decant
        const existing = decantsMap.get(item.product_name_snapshot);
        if (existing) {
          existing.units += units;
          existing.revenue += revenue;
          existing.cost += cost;
          existing.profit += profit;
          existing.orderCount += 1;
        } else {
          decantsMap.set(item.product_name_snapshot, {
            name: item.product_name_snapshot,
            size_ml: 10,
            units,
            revenue,
            cost,
            profit,
            marginPercent: 0,
            orderCount: 1,
          });
        }

        // Agregar por cliente
        let client = customersMap.get(customerKey);
        if (!client) {
          client = {
            customerName,
            phone: order.customers?.phone ?? null,
            email: order.customers?.email ?? null,
            units: 0,
            spent: 0,
            orders: new Set(),
            productCounts: new Map(),
          };
          customersMap.set(customerKey, client);
        }
        client.units += units;
        client.spent += revenue;
        client.orders.add(order.id);
        client.productCounts.set(
          item.product_name_snapshot,
          (client.productCounts.get(item.product_name_snapshot) ?? 0) + units
        );
      } else {
        // Producto normal (>10ml)
        normalOrderIds.add(order.id);
        if (isPaid) {
          normalTotalUnits += units;
          normalTotalRevenue += revenue;
          normalTotalCost += cost;
        }

        const existing = normalMap.get(item.product_name_snapshot);
        if (existing) {
          existing.units += units;
          existing.revenue += revenue;
          existing.cost += cost;
          existing.profit += profit;
          existing.orderCount += 1;
        } else {
          normalMap.set(item.product_name_snapshot, {
            name: item.product_name_snapshot,
            size_ml: Number(item.size_ml),
            units,
            revenue,
            cost,
            profit,
            marginPercent: 0,
            orderCount: 1,
          });
        }
      }
    }

    if (orderDecantItems.length > 0) {
      decantOrdersList.push({
        orderId: order.id,
        customerName,
        customerPhone: order.customers?.phone ?? null,
        dateStr,
        paymentStatus: order.payment_status,
        decantUnits: orderDecantUnits,
        decantRevenue: orderDecantRevenue,
        decantCost: orderDecantCost,
        decantProfit: orderDecantRevenue - orderDecantCost,
        items: orderDecantItems,
      });
    }
  }

  // Calcular porcentajes de margen en decants
  const allDecants = [...decantsMap.values()].map((d) => ({
    ...d,
    marginPercent:
      d.revenue > 0 ? Math.round(((d.revenue - d.cost) / d.revenue) * 100) : 0,
  }));

  // Calcular porcentajes de margen en normales
  const allNormal = [...normalMap.values()].map((n) => ({
    ...n,
    marginPercent:
      n.revenue > 0 ? Math.round(((n.revenue - n.cost) / n.revenue) * 100) : 0,
  }));

  // Rankings decants
  const topMovedDecants = [...allDecants].sort(
    (a, b) => b.units - a.units || b.revenue - a.revenue
  );
  const topProfitableDecants = [...allDecants].sort(
    (a, b) => b.profit - a.profit || b.revenue - a.revenue
  );
  const topNormalProducts = [...allNormal].sort(
    (a, b) => b.units - a.units || b.revenue - a.revenue
  );

  // Ranking clientes decants
  const topCustomers: DecantCustomerStats[] = [...customersMap.values()]
    .map((c) => {
      let fav = "—";
      let maxFav = 0;
      for (const [pName, pUnits] of c.productCounts.entries()) {
        if (pUnits > maxFav) {
          maxFav = pUnits;
          fav = pName;
        }
      }
      return {
        customerName: c.customerName,
        phone: c.phone,
        email: c.email,
        units: c.units,
        spent: c.spent,
        orderCount: c.orders.size,
        favoriteDecant: fav,
      };
    })
    .sort((a, b) => b.units - a.units || b.spent - a.spent);

  const decantsTotalProfit = decantsTotalRevenue - decantsTotalCost;
  const decantsMarginPercent =
    decantsTotalRevenue > 0
      ? Math.round((decantsTotalProfit / decantsTotalRevenue) * 100)
      : 0;

  const normalTotalProfit = normalTotalRevenue - normalTotalCost;
  const normalMarginPercent =
    normalTotalRevenue > 0
      ? Math.round((normalTotalProfit / normalTotalRevenue) * 100)
      : 0;

  // Ordenar lista de pedidos de decants por fecha más reciente
  decantOrdersList.sort((a, b) => b.dateStr.localeCompare(a.dateStr));

  return {
    decantsTotalUnits,
    decantsTotalRevenue,
    decantsTotalCost,
    decantsTotalProfit,
    decantsMarginPercent,
    decantsOrderCount: decantOrderIds.size,

    normalTotalUnits,
    normalTotalRevenue,
    normalTotalCost,
    normalTotalProfit,
    normalMarginPercent,
    normalOrderCount: normalOrderIds.size,

    mostMovedDecant: topMovedDecants[0] ?? null,
    mostProfitableDecant: topProfitableDecants[0] ?? null,
    topCustomer: topCustomers[0] ?? null,

    topMovedDecants,
    topProfitableDecants,
    topCustomers,
    topNormalProducts,
    decantOrders: decantOrdersList,
  };
}
