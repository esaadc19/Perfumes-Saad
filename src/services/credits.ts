import { supabase } from "../lib/supabase";

export interface CreditPayment {
  id: string;
  customer_id: string;
  order_id: string;
  amount: number;
  paid_at: string;
  method: "efectivo" | "transferencia" | "otro";
  note: string | null;
  recorded_by: string | null;
  created_at: string;
}

export interface NewCreditPayment {
  order_id: string;
  amount: number;
  method?: "efectivo" | "transferencia" | "otro";
  note?: string | null;
  paid_at?: string;
}

export interface CreditOrderSummary {
  order_id: string;
  order_code: string;
  customer_name: string;
  customer_phone: string;
  total: number;
  credit_amount: number;
  paid_amount: number;
  credit_due_date: string | null;
  overdue: boolean;
  days_overdue: number;
  payments: CreditPayment[];
  status: "credit" | "partial" | "paid";
  created_at: string;
}

export interface CreditLimitCheck {
  allowed: boolean;
  reason?: string;
  available_credit?: number;
  current_balance?: number;
  credit_limit?: number;
}

const CREDIT_ORDER_FIELDS = `
      id,
      customer_id,
      total,
      credit_amount,
      credit_due_date,
      payment_status,
      created_at,
      customers!inner(full_name, phone)
    `;

export async function getCreditOrders(): Promise<CreditOrderSummary[]> {
  if (!supabase) throw new Error("Supabase no está configurado.");

  // Pedidos que siguen en cartera.
  const { data: openOrders, error: openError } = await supabase
    .from("orders")
    .select(CREDIT_ORDER_FIELDS)
    .in("payment_status", ["credit", "partial"])
    .order("created_at", { ascending: false });

  if (openError) {
    console.error("Error cargando pedidos a crédito:", openError);
    throw openError;
  }

  // Historial: los que ya se pagaron. No se filtran por payment_status
  // porque al quedar saldados pasan a 'paid' y se confundirian con una
  // venta normal. La huella de que fueron a credito son los abonos: solo
  // un pedido a credito tiene filas en customer_credit_payments. Asi el
  // historico sobrevive sin necesidad de una columna was_credit.
  const { data: allPayments, error: allPaymentsError } = await supabase
    .from("customer_credit_payments")
    .select("order_id, id, amount, paid_at, method, note, customer_id, recorded_by, created_at")
    .order("paid_at", { ascending: true });

  if (allPaymentsError) {
    console.error("Error cargando abonos:", allPaymentsError);
    throw allPaymentsError;
  }

  const openIds = new Set((openOrders ?? []).map((o) => o.id));
  const historyIds = [
    ...new Set((allPayments ?? []).map((p) => p.order_id)),
  ].filter((id) => !openIds.has(id));

  let historyOrders: typeof openOrders = [];
  if (historyIds.length > 0) {
    const { data, error } = await supabase
      .from("orders")
      .select(CREDIT_ORDER_FIELDS)
      .in("id", historyIds)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Error cargando el historial de cartera:", error);
      throw error;
    }
    historyOrders = data ?? [];
  }

  const orders = [...(openOrders ?? []), ...historyOrders];

  const paymentsByOrder = new Map<string, CreditPayment[]>();
  allPayments.forEach((p) => {
    const list = paymentsByOrder.get(p.order_id) ?? [];
    list.push(p as CreditPayment);
    paymentsByOrder.set(p.order_id, list);
  });

  return orders
    .map((order) => {
      const orderPayments = paymentsByOrder.get(order.id) ?? [];
      const paidAmount = orderPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const creditAmount = Number(order.credit_amount);
      const isPaid = order.payment_status === "paid";
      const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers;
      // Solo es vencido si ademas debe algo: un fiado ya saldado no mora.
      const overdue = !isPaid && Boolean(order.credit_due_date)
        ? new Date(order.credit_due_date) < new Date() && creditAmount > 0
        : false;
      const daysOverdue = overdue && order.credit_due_date
        ? Math.floor((Date.now() - new Date(order.credit_due_date).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      return {
        order_id: order.id,
        order_code: order.id.slice(0, 8).toUpperCase(),
        customer_name: customer?.full_name ?? "",
        customer_phone: customer?.phone ?? "",
        total: Number(order.total),
        credit_amount: isPaid ? 0 : creditAmount,
        paid_amount: paidAmount,
        credit_due_date: order.credit_due_date,
        overdue,
        days_overdue: daysOverdue,
        payments: orderPayments,
        status: (isPaid ? "paid" : order.payment_status) as "credit" | "partial" | "paid",
        created_at: order.created_at,
      };
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function recordCreditPayment(
  payment: NewCreditPayment
): Promise<{ order_id: string; payment_amount: number; remaining_balance: number; new_payment_status: string }> {
  if (!supabase) throw new Error("Supabase no está configurado.");

  const { data, error } = await supabase.rpc("admin_record_credit_payment", {
    target_order_id: payment.order_id,
    payment_amount: payment.amount,
    payment_method: payment.method ?? "efectivo",
    payment_note: payment.note ?? null,
    payment_date: payment.paid_at ?? null,
  });

  if (error) {
    console.error("Error registrando abono:", error);
    throw new Error(error.message);
  }

  return data[0];
}

export async function updateCreditPayment(
  paymentId: string,
  payment: {
    amount: number;
    method?: "efectivo" | "transferencia" | "otro";
    note?: string | null;
    paid_at?: string;
  }
): Promise<{ order_id: string; remaining_balance: number; new_payment_status: string }> {
  if (!supabase) throw new Error("Supabase no está configurado.");

  const { data, error } = await supabase.rpc("admin_update_credit_payment", {
    target_payment_id: paymentId,
    new_amount: payment.amount,
    new_method: payment.method ?? null,
    new_note: payment.note ?? null,
    new_paid_at: payment.paid_at ?? null,
  });

  if (error) {
    console.error("Error actualizando abono:", error);
    throw new Error(error.message);
  }

  return data[0];
}

export async function deleteCreditPayment(
  paymentId: string
): Promise<{ order_id: string; remaining_balance: number; new_payment_status: string }> {
  if (!supabase) throw new Error("Supabase no está configurado.");

  const { data, error } = await supabase.rpc("admin_delete_credit_payment", {
    target_payment_id: paymentId,
  });

  if (error) {
    console.error("Error eliminando abono:", error);
    throw new Error(error.message);
  }

  return data[0];
}

export async function checkCreditLimit(
  customerId: string,
  orderTotal: number
): Promise<CreditLimitCheck> {
  if (!supabase) throw new Error("Supabase no está configurado.");

  const { data, error } = await supabase.rpc("admin_check_credit_limit", {
    target_customer_id: customerId,
    order_total: orderTotal,
  });

  if (error) {
    console.error("Error verificando límite de crédito:", error);
    throw new Error(error.message);
  }

  return data[0];
}

export async function setCreditBlock(customerId: string, blocked: boolean): Promise<void> {
  if (!supabase) throw new Error("Supabase no está configurado.");

  const { error } = await supabase.rpc("admin_set_credit_block", {
    target_customer_id: customerId,
    blocked,
  });

  if (error) {
    console.error("Error cambiando bloqueo de crédito:", error);
    throw new Error(error.message);
  }
}

export async function setCreditTerms(customerId: string, terms: "quincenal" | "mensual"): Promise<void> {
  if (!supabase) throw new Error("Supabase no está configurado.");

  const { error } = await supabase.rpc("admin_set_credit_terms", {
    target_customer_id: customerId,
    new_terms: terms,
  });

  if (error) {
    console.error("Error cambiando términos de crédito:", error);
    throw new Error(error.message);
  }
}

export async function getCustomersWithCredit(): Promise<{
  id: string;
  full_name: string;
  phone: string;
  email: string;
  credit_enabled: boolean;
  credit_limit: number;
  credit_terms: "quincenal" | "mensual";
  credit_blocked: boolean;
  current_balance: number;
}[]> {
  if (!supabase) throw new Error("Supabase no está configurado.");

  const { data, error } = await supabase
    .from("customers")
    .select("id, full_name, phone, email, credit_enabled, credit_limit, credit_terms, credit_blocked")
    .eq("credit_enabled", true)
    .order("full_name");

  if (error) {
    console.error("Error cargando clientes con crédito:", error);
    throw error;
  }

  if (!data || data.length === 0) return [];

  const customerIds = data.map((c) => c.id);

  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("customer_id, credit_amount, payment_status")
    .in("customer_id", customerIds)
    .in("payment_status", ["credit", "partial"]);

  if (ordersError) {
    console.error("Error cargando balances:", ordersError);
    throw ordersError;
  }

  const balanceByCustomer = new Map<string, number>();
  (orders ?? []).forEach((o) => {
    const current = balanceByCustomer.get(o.customer_id) ?? 0;
    balanceByCustomer.set(o.customer_id, current + Number(o.credit_amount));
  });

  return data.map((c) => ({
    ...c,
    credit_limit: Number(c.credit_limit),
    current_balance: balanceByCustomer.get(c.id) ?? 0,
  }));
}

export const CREDIT_METHODS = [
  { value: "efectivo" as const, label: "Efectivo" },
  { value: "transferencia" as const, label: "Transferencia" },
  { value: "otro" as const, label: "Otro" },
];