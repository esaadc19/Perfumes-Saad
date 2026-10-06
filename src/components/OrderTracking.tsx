import { useState } from "react";
import { Package, Search, CheckCircle2, Truck, XCircle, Clock, X, Send } from "lucide-react";
import { getOrderTracking, type OrderTrackingResult } from "../services/orders";

interface OrderTrackingProps {
  onClose: () => void;
}

const STATUS_STEPS = [
  { key: "pending_confirmation", label: "Pedido recibido", icon: Clock },
  { key: "confirmed", label: "Confirmado", icon: CheckCircle2 },
  { key: "shipped", label: "Enviado", icon: Truck },
  { key: "delivered", label: "Entregado", icon: Package },
] as const;

function getStepIndex(status: string): number {
  const idx = STATUS_STEPS.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : 0;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(dateStr));
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function OrderTracking({ onClose }: OrderTrackingProps) {
  const [orderCode, setOrderCode] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OrderTrackingResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!orderCode.trim() || !phone.trim()) {
      setError("Ingresa el número de pedido y tu teléfono.");
      return;
    }

    setLoading(true);
    try {
      const data = await getOrderTracking(orderCode.trim(), phone.trim());
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo consultar el pedido.");
    } finally {
      setLoading(false);
    }
  };

  const isCancelled = result?.status === "cancelled";
  const currentStep = result ? getStepIndex(result.status) : 0;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="tracking-modal" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Cerrar">
          <X size={20} />
        </button>

        <div className="tracking-header">
          <p className="eyebrow">RASTREAR PEDIDO</p>
          <h2>¿Dónde está mi pedido?</h2>
          <p>Ingresa el número de pedido y tu teléfono para ver el estado.</p>
        </div>

        <form onSubmit={handleSubmit} className="tracking-form">
          <div className="tracking-field">
            <label htmlFor="tracking-order">Número de pedido</label>
            <input
              id="tracking-order"
              type="text"
              value={orderCode}
              onChange={(e) => setOrderCode(e.target.value)}
              placeholder="Ej: A1B2C3D4"
              maxLength={8}
            />
          </div>
          <div className="tracking-field">
            <label htmlFor="tracking-phone">Teléfono</label>
            <input
              id="tracking-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ej: 3001234567"
            />
          </div>
          <button type="submit" className="primary full" disabled={loading}>
            <Search size={16} />
            {loading ? "Consultando..." : "Rastrear pedido"}
          </button>
        </form>

        {error && <p className="form-error" role="alert">{error}</p>}

        {result && (
          <div className="tracking-result">
            <div className="tracking-order-info">
              <div>
                <span>Pedido</span>
                <strong>#{result.order_code}</strong>
              </div>
              <div>
                <span>Total</span>
                <strong>{formatMoney(result.total)}</strong>
              </div>
              <div>
                <span>Fecha</span>
                <strong>{formatDate(result.created_at)}</strong>
              </div>
            </div>

            {isCancelled ? (
              <div className="tracking-cancelled">
                <XCircle size={40} />
                <p>Este pedido fue cancelado.</p>
              </div>
            ) : (
              <div className="tracking-timeline">
                {STATUS_STEPS.map((step, idx) => {
                  const Icon = step.icon;
                  const isCompleted = idx <= currentStep;
                  const isCurrent = idx === currentStep;
                  return (
                    <div
                      key={step.key}
                      className={`tracking-step ${isCompleted ? "completed" : ""} ${isCurrent ? "current" : ""}`}
                    >
                      <div className="tracking-step-icon">
                        <Icon size={18} />
                      </div>
                      <div className="tracking-step-label">
                        <span>{step.label}</span>
                        {isCurrent && result.paid_at && step.key === "confirmed" && (
                          <small>{formatDate(result.paid_at)}</small>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="tracking-items">
              <h3>Productos</h3>
              {result.items.map((item, idx) => (
                <div key={idx} className="tracking-item">
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.size_ml} ml × {item.quantity}</span>
                  </div>
                  <span>{formatMoney(item.subtotal)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
