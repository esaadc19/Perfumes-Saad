import { supabase } from "../lib/supabase";

export interface ReceiptItem {
  brand: string;
  name: string;
  size: number;
  quantity: number;
  unit_price: number;
  subtotal: number;
  discount_amount: number;
}

export interface CreatedOrderReceipt {
  orderId: string;
  total: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  message: string;
  items: ReceiptItem[];
}

export interface OrderTrackingItem {
  name: string;
  size_ml: number;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface OrderTrackingResult {
  order_code: string;
  status: string;
  payment_status: string;
  created_at: string;
  paid_at: string | null;
  total: number;
  items: OrderTrackingItem[];
}

export async function getOrderTracking(
  orderCode: string,
  phone: string
): Promise<OrderTrackingResult> {
  if (!supabase) {
    throw new Error("Supabase no está configurado. No se puede consultar el pedido.");
  }

  const { data, error } = await supabase.rpc("get_order_tracking", {
    order_code: orderCode,
    customer_phone: phone,
  });

  if (error) {
    console.error("No se pudo consultar el pedido:", error);
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("No se encontró el pedido.");
  }

  return {
    order_code: data.order_code,
    status: data.status,
    payment_status: data.payment_status,
    created_at: data.created_at,
    paid_at: data.paid_at ?? null,
    total: Number(data.total),
    items: (data.items ?? []).map((item: OrderTrackingItem) => ({
      ...item,
      size_ml: Number(item.size_ml),
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      subtotal: Number(item.subtotal),
    })),
  };
}

export async function createWhatsAppOrder(input: {
  customer: { full_name: string; phone: string; email: string; delivery_address?: string };
  items: { variant_id: string; quantity: number }[];
  isRegisteredCustomer: boolean;
}): Promise<CreatedOrderReceipt> {
  if (!supabase) {
    throw new Error("Supabase no está configurado. No se puede guardar el pedido todavía.");
  }

  const { data, error } = await supabase.rpc("create_whatsapp_order", {
    customer_data: input.isRegisteredCustomer ? {} : {
      full_name: input.customer.full_name,
      phone: input.customer.phone,
      email: input.customer.email,
      delivery_address: input.customer.delivery_address ?? null,
    },
    items_data: input.items,
  });

  if (error) {
    console.error("No se pudo generar el recibo:", error);
    if (error.message.toLowerCase().includes("invalid api key")) {
      throw new Error(
        "Supabase rechazó la clave configurada. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env y reinicia Vite."
      );
    }
    if (error.code === "PGRST202") {
      throw new Error(
        "Supabase aún no tiene la función para guardar pedidos. Ejecuta el schema.sql actualizado en el SQL Editor."
      );
    }
    if (error.code === "42501") {
      throw new Error("No se autorizó la creación del pedido. Verifica el perfil y los permisos en Supabase.");
    }
    throw new Error(error.message);
  }

  const result = data?.[0];
  if (!result) {
    throw new Error("Supabase no devolvió el recibo generado.");
  }

  return {
    orderId: result.created_order_id,
    total: Number(result.order_total),
    customerName: result.saved_customer_name,
    customerPhone: result.saved_customer_phone,
    customerEmail: result.saved_customer_email,
    customerAddress: result.saved_customer_address ?? "",
    message: result.order_message,
    items: (result.receipt_items ?? []).map((item: ReceiptItem) => ({
      ...item,
      size: Number(item.size),
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      subtotal: Number(item.subtotal),
      discount_amount: Number(item.discount_amount ?? 0),
    })),
  };
}
