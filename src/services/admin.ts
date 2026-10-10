import { supabase } from "../lib/supabase";

export interface AdminDashboardMetrics {
  /** Ventas efectivamente cobradas (payment_status = 'paid'). */
  total_orders: number;
  pending_orders: number;
  completed_sales: number;
  sales_revenue: number;
  sales_cost: number;
  sales_delivery_cost: number;
  /** Margen antes de gastos: ingresos - costo de productos. */
  sales_gross_profit: number;
  /** Gastos registrados en el periodo (tabla expenses, solo lo pagado). */
  total_expenses: number;
  /** Compromisos firmados que aun no se pagan. Informa, no resta. */
  committed_expenses: number;
  /**
   * Costo + domicilio que ya pagaste de las ventas a fiado que siguen sin
   * cobrarte. La utilidad lo resta mientras el fiado esta vivo, y lo
   * recupera cuando el cliente paga (ahi entran los 320.000 completos,
   * que ya incluyen la utilidad de esa venta).
   */
  credit_cost_pending: number;
  /** Utilidad neta = cobrado - costo - domicilio - costo del fiado - gastos. */
  sales_profit: number;
  net_margin_percent: number;

  /** Pipeline de fiado: lo vendido a credito y aun no cobrado. */
  credit_sales: number;
  credit_revenue: number;
  /**
   * Utilidad que sigue parada en cartera: no entra en sales_profit hasta
   * que el fiado queda saldado. Reemplaza a credit_profit, que se perdia
   * para siempre en cuanto el pedido pasaba a 'paid'.
   */
  locked_credit_profit: number;
  credit_outstanding_balance: number;
  credit_overdue_balance: number;
  credit_customers_with_overdue: number;

  /** Cierre del rango consultado, para los deltas contra el anterior. */
  period_days: number | null;
  period_from: string | null;
  period_to: string | null;
  previous: {
    sales_revenue: number;
    sales_profit: number;
    net_margin_percent: number;
  };

  missing_cost_items: number;
  customer_count: number;
  low_stock_variants: number;
  top_products: {
    name: string;
    size_ml: number;
    units: number;
    revenue: number;
    cost: number | null;
    profit: number | null;
  }[];
}

export interface AdminCustomer {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  credit_enabled: boolean;
  credit_limit: number;
  credit_terms: "quincenal" | "mensual";
  credit_blocked: boolean;
  created_at: string;
  orders: { total: number; status: string; created_at: string }[];
}

export interface AdminProfile {
  id: string;
  role: "customer" | "admin";
  full_name: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
}

export interface SalesAdvisor {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminOrder {
  id: string;
  customer_id: string | null;
  status: string;
  payment_status: string;
  total: number;
  delivery_cost: number;
  paid_at: string | null;
  created_at: string;
  sales_advisor_id: string | null;
  sales_advisor_name: string | null;
  customers: { full_name: string; phone: string | null; email: string | null } | null;
  order_items: {
    variant_id: string;
    product_name_snapshot: string;
    size_ml: number;
    quantity: number;
    unit_price: number;
    subtotal: number;
    unit_cost_snapshot: number | null;
  }[];
  credit_due_date: string | null;
  credit_amount: number;
  credit_limit_snapshot: number | null;
}

function requireSupabase() {
  if (!supabase) throw new Error("Supabase no está configurado.");
  return supabase;
}

/**
 * Metricas del dashboard.
 *
 * @param periodDays Rango en dias para las metricas de flujo (ventas,
 *   costos, gastos). `null` devuelve el acumulado historico. Las
 *   instantaneas (stock, por cobrar, vencidos) no se acotan nunca: son
 *   una foto del momento.
 */
export async function getAdminDashboardMetrics(
  periodDays?: number | null
): Promise<AdminDashboardMetrics> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("admin_dashboard_metrics", {
    period_days: periodDays ?? null,
  });
  if (error) {
    console.error("No se pudieron cargar las métricas:", error);
    throw error;
  }
  return data as AdminDashboardMetrics;
}

export async function getAdminCustomers(): Promise<AdminCustomer[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("customers")
    .select("id, full_name, phone, email, city, credit_enabled, credit_limit, credit_terms, credit_blocked, created_at, orders(total, status, created_at)")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("No se pudieron cargar los clientes:", error);
    throw error;
  }
  return (data ?? []) as AdminCustomer[];
}

export async function importAdminCustomers(
  customers: { full_name: string; phone: string | null; email: string | null; city: string | null }[]
): Promise<{ imported: number; skipped: number }> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("admin_import_customers", {
    customers_data: customers,
  });
  if (error) {
    console.error("No se pudieron importar los clientes:", error);
    throw error;
  }
  if (!data || typeof data.imported !== "number" || typeof data.skipped !== "number") {
    throw new Error("Supabase no devolvió el resultado de importación esperado.");
  }
  return { imported: data.imported, skipped: data.skipped };
}

export async function getAdminProfiles(): Promise<AdminProfile[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("profiles")
    .select("id, role, full_name, phone, email, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("No se pudieron cargar los perfiles:", error);
    throw error;
  }
  return (data ?? []) as AdminProfile[];
}

export async function getAdminOrders(): Promise<AdminOrder[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("orders")
    .select("id, customer_id, status, payment_status, total, delivery_cost, paid_at, created_at, sales_advisor_id, sales_advisors(full_name), customers(full_name, phone, email), order_items(variant_id, product_name_snapshot, size_ml, quantity, unit_price, subtotal, unit_cost_snapshot), credit_due_date, credit_amount, credit_limit_snapshot")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("No se pudieron cargar los pedidos:", error);
    throw error;
  }
  return (data ?? []).map((order) => ({
    ...order,
    sales_advisor_name: (order.sales_advisors as { full_name: string }[] | null)?.[0]?.full_name ?? null,
    customers: Array.isArray(order.customers) ? order.customers[0] ?? null : order.customers,
    order_items: order.order_items ?? [],
  })) as AdminOrder[];
}

export async function getSalesAdvisors(): Promise<SalesAdvisor[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("sales_advisors")
    .select("id, full_name, phone, email, active, created_at, updated_at")
    .order("full_name", { ascending: true });
  if (error) {
    console.error("No se pudieron cargar los asesores de venta:", error);
    throw error;
  }
  return (data ?? []) as SalesAdvisor[];
}

export async function createSalesAdvisor(input: {
  full_name: string;
  phone: string | null;
  email: string | null;
}): Promise<SalesAdvisor> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("sales_advisors")
    .insert({ full_name: input.full_name, phone: input.phone, email: input.email })
    .select("id, full_name, phone, email, active, created_at, updated_at")
    .single();
  if (error) {
    console.error("No se pudo crear el asesor de venta:", error);
    throw error;
  }
  return data as SalesAdvisor;
}

export async function updateSalesAdvisor(
  advisorId: string,
  input: {
    full_name: string;
    phone: string | null;
    email: string | null;
    active: boolean;
  }
): Promise<SalesAdvisor> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("sales_advisors")
    .update({
      full_name: input.full_name,
      phone: input.phone,
      email: input.email,
      active: input.active,
    })
    .eq("id", advisorId)
    .select("id, full_name, phone, email, active, created_at, updated_at")
    .single();
  if (error) {
    console.error("No se pudo actualizar el asesor de venta:", error);
    throw error;
  }
  return data as SalesAdvisor;
}

export async function deleteSalesAdvisor(advisorId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from("sales_advisors")
    .delete()
    .eq("id", advisorId);
  if (error) {
    console.error("No se pudo eliminar el asesor de venta:", error);
    throw error;
  }
}

export async function saveAdminPendingOrder(input: {
  orderId: string | null;
  customerId: string | null;
  customer: {
    full_name: string;
    phone: string | null;
    email: string | null;
    city: string | null;
    delivery_address: string | null;
  } | null;
  items: { variant_id: string; quantity: number; unit_price: number; unit_cost: number | null }[];
  orderDate: string;
  deliveryCost: number;
  salesAdvisorId: string | null;
  orderStatus?: "pending_confirmation" | "confirmed" | "shipped" | "delivered" | "cancelled";
  paymentStatus?: "pending" | "paid" | "refunded" | "credit" | "partial";
}): Promise<string> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("admin_save_pending_order", {
    target_order_id: input.orderId,
    target_customer_id: input.customerId,
    customer_data: input.customer,
    items_data: input.items,
    order_date: input.orderDate,
    new_delivery_cost: input.deliveryCost,
    sales_advisor_id: input.salesAdvisorId,
    new_status: input.orderStatus ?? "pending_confirmation",
    new_payment_status: input.paymentStatus ?? "pending",
  });
  if (error) {
    console.error("No se pudo guardar el pedido:", error);
    throw new Error(error.message || "No se pudo guardar el pedido.");
  }
  if (typeof data !== "string") throw new Error("Supabase no devolvió el pedido guardado.");
  return data;
}

export async function deleteAdminPendingOrder(orderId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("admin_delete_pending_order", {
    target_order_id: orderId,
  });
  if (error) {
    console.error("No se pudo eliminar el pedido:", error);
    throw error;
  }
}

export async function updateAdminOrderStatus(
  orderId: string,
  status: "pending_confirmation" | "confirmed" | "cancelled",
  paymentStatus: "pending" | "paid" | "refunded"
): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("admin_update_order_transaction", {
    target_order_id: orderId,
    new_status: status,
    new_payment_status: paymentStatus,
  });
  if (error) {
    console.error("No se pudo actualizar el pedido:", error);
    throw error;
  }
}

export async function updateAdminCustomer(input: {
  customerId: string;
  fullName: string;
  phone: string;
  email: string;
  city: string;
  creditEnabled?: boolean;
  creditLimit?: number;
  creditTerms?: "quincenal" | "mensual";
  creditBlocked?: boolean;
}): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("admin_update_customer", {
    customer_id: input.customerId,
    customer_data: {
      full_name: input.fullName,
      phone: input.phone,
      email: input.email,
      city: input.city,
      credit_enabled: input.creditEnabled,
      credit_limit: input.creditLimit,
      credit_terms: input.creditTerms,
      credit_blocked: input.creditBlocked,
    },
  });
  if (error) {
    console.error("No se pudo actualizar el cliente:", error);
    throw error;
  }
}

export async function updateAdminProfileRole(
  profileId: string,
  role: AdminProfile["role"]
): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("admin_set_profile_role", {
    target_profile_id: profileId,
    new_role: role,
  });
  if (error) {
    console.error("No se pudo actualizar el rol:", error);
    throw error;
  }
}

// Crédito
export async function updateAdminOrderWithCredit(
  orderId: string,
  status: "pending_confirmation" | "confirmed" | "cancelled",
  paymentStatus: "pending" | "paid" | "refunded" | "credit" | "partial",
  creditDueDate?: string,
  creditLimitSnapshot?: number
): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("admin_update_order_transaction", {
    target_order_id: orderId,
    new_status: status,
    new_payment_status: paymentStatus,
    credit_due_date_param: creditDueDate ?? null,
    credit_limit_snapshot_param: creditLimitSnapshot ?? null,
  });
  if (error) {
    console.error("No se pudo actualizar el pedido:", error);
    throw error;
  }
}

export async function updateAdminCustomerCredit(
  customerId: string,
  input: {
    credit_enabled?: boolean;
    credit_limit?: number;
    credit_terms?: "quincenal" | "mensual";
    credit_blocked?: boolean;
  }
): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("admin_update_customer", {
    customer_id: customerId,
    customer_data: {
      credit_enabled: input.credit_enabled,
      credit_limit: input.credit_limit,
      credit_terms: input.credit_terms,
      credit_blocked: input.credit_blocked,
    },
  });
  if (error) {
    console.error("No se pudo actualizar el crédito del cliente:", error);
    throw error;
  }
}

export async function recordCreditPayment(input: {
  orderId: string;
  amount: number;
  method?: "efectivo" | "transferencia" | "otro";
  note?: string;
  paidAt?: string;
}): Promise<{ order_id: string; payment_amount: number; remaining_balance: number; new_payment_status: string }> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("admin_record_credit_payment", {
    target_order_id: input.orderId,
    payment_amount: input.amount,
    payment_method: input.method ?? "efectivo",
    payment_note: input.note ?? null,
    payment_date: input.paidAt ?? null,
  });
  if (error) {
    console.error("No se pudo registrar el abono:", error);
    throw error;
  }
  return data[0];
}

export async function checkCreditLimit(
  customerId: string,
  orderTotal: number
): Promise<{ allowed: boolean; reason?: string; available_credit?: number; current_balance?: number; credit_limit?: number }> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("admin_check_credit_limit", {
    target_customer_id: customerId,
    order_total: orderTotal,
  });
  if (error) {
    console.error("Error verificando límite de crédito:", error);
    throw error;
  }
  return data[0];
}

export async function setCreditBlock(customerId: string, blocked: boolean): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("admin_set_credit_block", {
    target_customer_id: customerId,
    blocked,
  });
  if (error) {
    console.error("Error cambiando bloqueo de crédito:", error);
    throw error;
  }
}

export async function setCreditTerms(customerId: string, terms: "quincenal" | "mensual"): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("admin_set_credit_terms", {
    target_customer_id: customerId,
    new_terms: terms,
  });
  if (error) {
    console.error("Error cambiando términos de crédito:", error);
    throw error;
  }
}
