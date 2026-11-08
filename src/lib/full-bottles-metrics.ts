import type { AdminOrder } from "../services/admin";
import { isDateInPeriod, toBogotaDateStr } from "./order-finance";

export interface FullBottleProductStats {
  name: string;
  size_ml: number;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPercent: number;
  orderCount: number;
}

export interface FullBottleCustomerStats {
  customerName: string;
  phone: string | null;
  email: string | null;
  units: number;
  spent: number;
  orderCount: number;
  favoriteProduct: string;
}

export interface FullBottleOrderItem {
  productName: string;
  size_ml: number;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  unitCost: number | null;
  profit: number;
}

export interface FullBottleOrderRow {
  orderId: string;
  customerName: string;
  customerPhone: string | null;
  dateStr: string;
  paymentStatus: string;
  bottleUnits: number;
  bottleRevenue: number;
  bottleCost: number;
  bottleProfit: number;
  items: FullBottleOrderItem[];
}

export interface FullBottlesAnalysis {
  totalUnits: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  marginPercent: number;
  orderCount: number;

  mostSoldProduct: FullBottleProductStats | null;
  mostProfitableProduct: FullBottleProductStats | null;
  topCustomer: FullBottleCustomerStats | null;

  topProducts: FullBottleProductStats[];
  topProfitable: FullBottleProductStats[];
  topCustomers: FullBottleCustomerStats[];
  orders: FullBottleOrderRow[];
}

/**
 * Calcula el análisis completo de Perfumería Completa / Frascos Enteros (> 10 ml: 30ml, 50ml, 100ml, 200ml).
 * Excluye explícitamente decants de 10 ml y pedidos cancelados.
 */
export function getFullBottlesAnalysis(
  orders: AdminOrder[],
  period?: { from: string | null; to: string | null }
): FullBottlesAnalysis {
  const productsMap = new Map<string, FullBottleProductStats>();
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

  const bottleOrdersList: FullBottleOrderRow[] = [];
  let totalUnits = 0;
  let totalRevenue = 0;
  let totalCost = 0;
  const bottleOrderIds = new Set<string>();

  for (const order of orders) {
    if (order.status === "cancelled") {
      continue;
    }

    const dateStr = toBogotaDateStr(order.created_at);
    if (period && !isDateInPeriod(dateStr, period.from, period.to)) {
      continue;
    }

    const customerName = order.customers?.full_name?.trim() || "Cliente casual";
    const customerKey =
      order.customer_id || `${customerName}-${order.customers?.phone || ""}`;

    const orderBottleItems: FullBottleOrderItem[] = [];
    let orderBottleUnits = 0;
    let orderBottleRevenue = 0;
    let orderBottleCost = 0;

    for (const item of order.order_items) {
      const sizeMl = Number(item.size_ml);
      // Solo perfumes enteros mayores a 10 ml
      if (sizeMl <= 10) {
        continue;
      }

      const units = Number(item.quantity ?? 0);
      const revenue = Number(item.subtotal ?? 0);
      const unitCost =
        item.unit_cost_snapshot !== null ? Number(item.unit_cost_snapshot) : null;
      const cost = unitCost !== null ? unitCost * units : 0;
      const profit = revenue - cost;

      bottleOrderIds.add(order.id);
      totalUnits += units;
      totalRevenue += revenue;
      totalCost += cost;

      orderBottleUnits += units;
      orderBottleRevenue += revenue;
      orderBottleCost += cost;

      orderBottleItems.push({
        productName: item.product_name_snapshot,
        size_ml: sizeMl,
        quantity: units,
        unitPrice: Number(item.unit_price ?? 0),
        subtotal: revenue,
        unitCost,
        profit,
      });

      // Agrupación por producto + tamaño
      const productKey = `${item.product_name_snapshot} (${sizeMl} ml)`;
      const existing = productsMap.get(productKey);
      if (existing) {
        existing.units += units;
        existing.revenue += revenue;
        existing.cost += cost;
        existing.profit += profit;
        existing.orderCount += 1;
      } else {
        productsMap.set(productKey, {
          name: item.product_name_snapshot,
          size_ml: sizeMl,
          units,
          revenue,
          cost,
          profit,
          marginPercent: 0,
          orderCount: 1,
        });
      }

      // Agrupación por cliente
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
        productKey,
        (client.productCounts.get(productKey) ?? 0) + units
      );
    }

    if (orderBottleItems.length > 0) {
      bottleOrdersList.push({
        orderId: order.id,
        customerName,
        customerPhone: order.customers?.phone ?? null,
        dateStr,
        paymentStatus: order.payment_status,
        bottleUnits: orderBottleUnits,
        bottleRevenue: orderBottleRevenue,
        bottleCost: orderBottleCost,
        bottleProfit: orderBottleRevenue - orderBottleCost,
        items: orderBottleItems,
      });
    }
  }

  // Margen de cada producto
  const allProducts = [...productsMap.values()].map((p) => ({
    ...p,
    marginPercent:
      p.revenue > 0 ? Math.round(((p.revenue - p.cost) / p.revenue) * 100) : 0,
  }));

  const topProducts = [...allProducts].sort(
    (a, b) => b.units - a.units || b.revenue - a.revenue
  );

  const topProfitable = [...allProducts].sort(
    (a, b) => b.profit - a.profit || b.revenue - a.revenue
  );

  // Clientes
  const topCustomers: FullBottleCustomerStats[] = [...customersMap.values()]
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
        favoriteProduct: fav,
      };
    })
    .sort((a, b) => b.units - a.units || b.spent - a.spent);

  const totalProfit = totalRevenue - totalCost;
  const marginPercent =
    totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0;

  return {
    totalUnits,
    totalRevenue,
    totalCost,
    totalProfit,
    marginPercent,
    orderCount: bottleOrderIds.size,
    mostSoldProduct: topProducts[0] ?? null,
    mostProfitableProduct: topProfitable[0] ?? null,
    topCustomer: topCustomers[0] ?? null,
    topProducts,
    topProfitable,
    topCustomers,
    orders: bottleOrdersList,
  };
}
