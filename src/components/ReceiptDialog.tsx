import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Printer, Send, X } from "lucide-react";
import type { Product, ProductVariant } from "../services/products";
import {
  createWhatsAppOrder,
  type CreatedOrderReceipt,
  type ReceiptItem,
} from "../services/orders";
import { supabase } from "../lib/supabase";
import { calculatePromotionPrice } from "../services/promotions";

type ReceiptCartItem = {
  product: Product;
  variant: ProductVariant;
  quantity: number;
};

type PrinterPhase = "idle" | "feeding-in" | "printing" | "feeding-out";

const WHATSAPP_NUMBER = "573181749436";

const money = (value: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);

export default function ReceiptDialog({
  cart,
  user,
  onClose,
  onSignIn,
  onOrderSaved,
}: {
  cart: ReceiptCartItem[];
  user: User | null;
  onClose: () => void;
  onSignIn: () => void;
  onOrderSaved: () => void;
}) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [profileLoading, setProfileLoading] = useState(Boolean(user));
  const [printerPhase, setPrinterPhase] = useState<PrinterPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<CreatedOrderReceipt | null>(null);
  const saving = printerPhase !== "idle";

  const previewPrice = useMemo(
    () => calculatePromotionPrice(cart.map((item) => ({
      productId: item.product.id,
      promotionId: item.product.promotion_id ?? null,
      promotion: item.product.promotion,
      variantId: item.variant.id,
      unitPrice: item.variant.price,
      quantity: item.quantity,
    }))),
    [cart]
  );
  const previewTotal = previewPrice.total;

  useEffect(() => {
    let active = true;
    if (!user || !supabase) {
      setProfileLoading(false);
      setCustomerEmail(user?.email ?? "");
      return () => {
        active = false;
      };
    }

    const client = supabase;
    setProfileLoading(true);
    void client
      .from("profiles")
      .select("full_name, phone, email")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error: profileError }) => {
        if (!active) return;
        if (profileError) {
          console.error("No se pudieron cargar los datos del cliente:", profileError);
          setError("No pudimos cargar los datos guardados. Intenta cerrar sesión y entrar de nuevo.");
        } else {
          setCustomerName(data?.full_name ?? String(user.user_metadata.full_name ?? ""));
          setCustomerPhone(data?.phone ?? String(user.user_metadata.phone ?? ""));
          setCustomerEmail(data?.email ?? user.email ?? "");
        }
        setProfileLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  // Auto-submit when user is registered and profile is loaded
  useEffect(() => {
    if (user && !profileLoading && customerName && customerPhone && customerEmail && !receipt && printerPhase === "idle") {
      void submitOrder({ preventDefault: () => {} } as React.FormEvent<HTMLFormElement>);
    }
  }, [user, profileLoading, customerName, customerPhone, customerEmail, receipt, printerPhase]);

  // Auto-send to WhatsApp when receipt is generated
  useEffect(() => {
    if (receipt) {
      const number = WHATSAPP_NUMBER.replace(/\D/g, "");
      window.open(
        `https://wa.me/${number}?text=${encodeURIComponent(receipt.message)}`,
        "_blank",
        "noopener,noreferrer"
      );
    }
  }, [receipt]);

  const submitOrder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!supabase) {
      setError("Conecta Supabase y ejecuta el esquema antes de guardar pedidos.");
      return;
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      setError("Completa el nombre y el número de WhatsApp.");
      return;
    }
    if (customerPhone.replace(/\D/g, "").length < 7) {
      setError("Ingresa un número de WhatsApp válido.");
      return;
    }

    setPrinterPhase("feeding-in");
    try {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 900));
      setPrinterPhase("printing");

      const client = supabase;
      if (user) {
        const { error: profileError } = await client
          .from("profiles")
          .update({
            full_name: customerName.trim(),
            phone: customerPhone.trim(),
            email: customerEmail.trim().toLowerCase(),
          })
          .eq("id", user.id);
        if (profileError) throw profileError;
      }

      const createdReceipt = await createWhatsAppOrder({
        customer: {
          full_name: customerName.trim(),
          phone: customerPhone.trim(),
          email: customerEmail.trim().toLowerCase(),
        },
        items: cart.map((item) => ({
          variant_id: item.variant.id,
          quantity: item.quantity,
        })),
        isRegisteredCustomer: Boolean(user),
      });
      setPrinterPhase("feeding-out");
      await new Promise<void>((resolve) => window.setTimeout(resolve, 1200));
      setReceipt(createdReceipt);
      onOrderSaved();
    } catch (submitError) {
      console.error("No se pudo crear el pedido:", submitError);
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo generar el recibo. Revisa la información e inténtalo de nuevo."
      );
    } finally {
      setPrinterPhase("idle");
    }
  };

  const receiptItems: ReceiptItem[] = receipt?.items ?? cart.map((item) => ({
    brand: item.product.brand,
    name: item.product.name,
    size: item.variant.size,
    quantity: item.quantity,
    unit_price: item.variant.price,
    subtotal: item.variant.price * item.quantity - (previewPrice.lineDiscounts[item.variant.id] ?? 0),
    discount_amount: previewPrice.lineDiscounts[item.variant.id] ?? 0,
  }));
  const displayedDiscount = receipt
    ? receiptItems.reduce((sum, item) => sum + item.discount_amount, 0)
    : previewPrice.discount;
  const displayedSubtotal = receipt
    ? receiptItems.reduce((sum, item) => sum + item.subtotal + item.discount_amount, 0)
    : previewPrice.subtotal;

  const sendToWhatsApp = () => {
    if (!receipt) return;
    const number = WHATSAPP_NUMBER.replace(/\D/g, "");
    window.open(
      `https://wa.me/${number}?text=${encodeURIComponent(receipt.message)}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  return (
    <div className="overlay receipt-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="receipt-dialog" role="dialog" aria-modal="true" aria-labelledby="receipt-title">
        <button className="close" onClick={onClose} aria-label="Cerrar recibo"><X /></button>
        <div className="receipt-heading">
          <p className="eyebrow">TU PEDIDO</p>
          <h2 id="receipt-title">{receipt ? "Recibo listo" : "Generar recibo"}</h2>
          <p>Revisa el comprobante y envía el pedido directamente por WhatsApp.</p>
        </div>

        {saving ? (
          <div className="receipt-printing-stage" role="status" aria-live="polite">
            <div className={`printer-container printer-${printerPhase}`}>
              <div className="printer-paper" aria-hidden="true">
                <strong>PERFUMES SAAD</strong>
                <div className="printer-paper-line" />
                <div className="printer-paper-line" />
                <div className="printer-paper-line" />
                <b>TOTAL</b>
              </div>
              <div className="printer-body">
                <Printer size={42} strokeWidth={1.5} />
                <div className="printer-slot" />
              </div>
            </div>
            <p className="printer-status">
              {printerPhase === "feeding-in"
                ? "Colocando el pedido en la impresora..."
                : printerPhase === "feeding-out"
                  ? "Tu recibo está saliendo de la impresora..."
                  : "Imprimiendo y confirmando tu pedido..."}
            </p>
            <div className="printer-progress" aria-hidden="true"><span /></div>
          </div>
        ) : (
        <div className="receipt-layout">
          {!receipt && (
            <form className="receipt-customer" onSubmit={(event) => void submitOrder(event)}>
              <div className="receipt-customer-heading">
                <strong>Datos del cliente</strong>
                {user && <span>Datos de tu cuenta</span>}
              </div>
              {profileLoading ? (
                <p role="status">Cargando tus datos guardados...</p>
              ) : (
                <>
                  <label className="auth-label">
                    Nombre completo
                    <input autoComplete="name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} required />
                  </label>
                  <label className="auth-label">
                    Número de WhatsApp
                    <input type="tel" autoComplete="tel" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} required />
                  </label>
                  <label className="auth-label">
                    Correo electrónico (opcional)
                    <input type="email" autoComplete="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} />
                  </label>
                  {!user && (
                    <button className="text-button receipt-signin" type="button" onClick={onSignIn}>
                      ¿Ya tienes cuenta? Inicia sesión para usar tus datos guardados
                    </button>
                  )}
                  {error && <p className="form-error" role="alert">{error}</p>}
                  <p className="receipt-note">
                    El total final, las promociones y la disponibilidad se validan al guardar el pedido.
                    No se realiza ningún cobro en línea.
                  </p>
                  <button className="primary full receipt-submit" type="submit" disabled={saving || cart.length === 0}>
                    {saving ? "Generando recibo..." : "Generar recibo"}
                  </button>
                </>
              )}
            </form>
          )}

          <div className="receipt-preview">
            {receipt && (
              <div className="receipt-printer-view" role="status" aria-live="polite">
                <div className="thermal-printer">
                  <div className="printer-display"><span /></div>
                  <Printer size={38} strokeWidth={1.5} />
                  <div className="printer-slot" />
                  <div className="printer-controls"><span /><i /><i /><i /></div>
                </div>
                <p className="printer-ready"><Printer size={14} /> Recibo impreso</p>
              </div>
            )}
            <article className={`receipt-paper${receipt ? " receipt-paper-printed" : ""}`}>
              <header className="receipt-brand">
                <strong>PERFUMES SAAD</strong>
                <span>RECIBO DE PEDIDO</span>
                <small>Barranquilla · Colombia</small>
              </header>
              <div className="receipt-rule" />
              <div className="receipt-customer-data">
                <span>CLIENTE: {receipt?.customerName ?? (customerName.trim() || "—")}</span>
                <span>WHATSAPP: {receipt?.customerPhone ?? (customerPhone.trim() || "—")}</span>
                <span>CORREO: {receipt?.customerEmail ?? (customerEmail.trim() || "—")}</span>
                <span>RECIBO: {receipt ? receipt.orderId.slice(0, 8).toUpperCase() : "PENDIENTE"}</span>
              </div>
              <div className="receipt-rule receipt-dashed" />
              <div className="receipt-items">
                {receiptItems.map((item, index) => (
                  <div className="receipt-line" key={`${item.brand}-${item.name}-${item.size}-${index}`}>
                    <strong>{item.brand} {item.name}</strong>
                    <span>{item.size} ml × {item.quantity} · {money(item.unit_price)} c/u</span>
                    {item.discount_amount > 0 && <small className="receipt-promotion-saving">Ahorro promocional: -{money(item.discount_amount)}</small>}
                    <b>{money(item.subtotal)}</b>
                  </div>
                ))}
              </div>
              <div className="receipt-rule receipt-dashed" />
              {displayedDiscount > 0 && (
                <div className="receipt-promotion-totals">
                  <span>Subtotal</span><b>{money(displayedSubtotal)}</b>
                  <span>Ahorro en promociones</span><b>-{money(displayedDiscount)}</b>
                </div>
              )}
              <div className="receipt-total">
                <span>TOTAL</span>
                <strong>{money(receipt?.total ?? previewTotal)}</strong>
              </div>
              <div className="receipt-payment-state">
                {receipt ? "PEDIDO PENDIENTE DE CONFIRMACIÓN" : "VISTA PREVIA · SIN GUARDAR"}
              </div>
              <footer className="receipt-footer">
                <span>Gracias por elegir Perfumes SAAD</span>
                <small>El pago y la entrega se coordinan por WhatsApp.</small>
              </footer>
            </article>
            {receipt ? (
              <div className="receipt-actions">
                <button className="secondary" onClick={() => window.print()}><Printer size={17} /> Imprimir recibo</button>
                <span className="receipt-auto-send"><Send size={15} /> Pedido enviado a WhatsApp automáticamente</span>
              </div>
            ) : (
              <p className="receipt-print-hint"><Printer size={15} /> Vista previa estilo recibo térmico</p>
            )}
          </div>
        </div>
        )}
      </section>
    </div>
  );
}
