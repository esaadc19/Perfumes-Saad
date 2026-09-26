import { supabase } from "../lib/supabase";

export interface AdminDashboardMetrics {
  total_orders: number;
  pending_orders: number;
  completed_sales: number;
  sales_revenue: number;
  sales_cost: number;
  sales_profit: number;
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

export interface AdminOrder {
  id: string;
  customer_id: string | null;
  status: string;
  payment_status: string;
  total: number;
  paid_at: string | null;
  created_at: string;
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
}

function requireSupabase() {
  if (!supabase) throw new Error("Supabase no está configurado.");
  return supabase;
}

export async function getAdminDashboardMetrics(): Promise<AdminDashboardMetrics> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("admin_dashboard_metrics");
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
    .select("id, full_name, phone, email, city, created_at, orders(total, status, created_at)")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("No se pudieron cargar los clientes:", error);
    throw error;
  }
  return (data ?? []) as AdminCustomer[];
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
    .select("id, customer_id, status, payment_status, total, paid_at, created_at, customers(full_name, phone, email), order_items(variant_id, product_name_snapshot, size_ml, quantity, unit_price, subtotal, unit_cost_snapshot)")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("No se pudieron cargar los pedidos:", error);
    throw error;
  }
  return (data ?? []).map((order) => ({
    ...order,
    customers: Array.isArray(order.customers) ? order.customers[0] ?? null : order.customers,
    order_items: order.order_items ?? [],
  })) as AdminOrder[];
}

export async function saveAdminPendingOrder(input: {
  orderId: string | null;
  customerId: string;
  items: { variant_id: string; quantity: number }[];
}): Promise<string> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("admin_save_pending_order", {
    target_order_id: input.orderId,
    target_customer_id: input.customerId,
    items_data: input.items,
  });
  if (error) {
    console.error("No se pudo guardar el pedido:", error);
    throw error;
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
}): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("admin_update_customer", {
    customer_id: input.customerId,
    customer_data: {
      full_name: input.fullName,
      phone: input.phone,
      email: input.email,
      city: input.city,
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
