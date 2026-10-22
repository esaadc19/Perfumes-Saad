import { ArrowUpRight, ReceiptText, ShoppingBag, TrendingUp, Users } from "lucide-react";
import type { AdminDashboardMetrics, AdminOrder } from "../../services/admin";

const money = (value: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);

const ORDER_DATE = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  day: "numeric",
  month: "short",
});

/** Estado corto para la lista: la persona debe entenderlo sin abrir el pedido. */
function orderBadge(order: AdminOrder) {
  if (order.status === "cancelled") return { label: "Cancelado", tone: "cancelled" };
  if (order.payment_status === "paid") return { label: "Pagado", tone: "paid" };
  if (order.payment_status === "credit") return { label: "Crédito", tone: "credit" };
  if (order.payment_status === "partial") return { label: "Abono", tone: "credit" };
  if (order.payment_status === "refunded") return { label: "Reembolsado", tone: "cancelled" };
  if (order.status === "pending_confirmation") return { label: "Nuevo", tone: "new" };
  return { label: "Pendiente", tone: "pending" };
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "C";
}

/**
 * Resumen y pedidos recientes del dashboard en movil.
 *
 * Sigue la estructura de la referencia: cuatro cifras en 2x2, ingresos y
 * despues la lista de movimientos. En escritorio no se muestra porque alli
 * el dashboard conserva sus grupos completos.
 */
export default function MobileOverview({
  metrics,
  orders,
  onOpenOrders,
}: {
  metrics: AdminDashboardMetrics;
  orders: AdminOrder[];
  /** Sin permiso de pedidos el bloque queda informativo, sin enlaces. */
  onOpenOrders?: () => void;
}) {
  const cards = [
    {
      label: "Ventas cobradas",
      value: money(Number(metrics.sales_revenue)),
      tone: "sales",
      icon: <ReceiptText size={15} />,
    },
    {
      label: "Utilidad neta",
      value: metrics.missing_cost_items > 0 ? "Incompleta" : money(Number(metrics.sales_profit)),
      tone: "profit",
      icon: <TrendingUp size={15} />,
    },
    {
      label: "Pedidos",
      value: String(metrics.total_orders),
      tone: "orders",
      icon: <ShoppingBag size={15} />,
    },
    {
      label: "Clientes",
      value: String(metrics.customer_count),
      tone: "customers",
      icon: <Users size={15} />,
    },
  ];
  const recentOrders = orders.slice(0, 4);

  return (
    <>
      <section className="mobile-summary" aria-label="Resumen del periodo">
        {cards.map((card) => (
          <article
            key={card.label}
            className={`mobile-summary-card mobile-summary-card--${card.tone}`}
          >
            <span className="mobile-summary-label">
              <span className="mobile-summary-icon" aria-hidden="true">{card.icon}</span>
              {card.label}
            </span>
            <strong className="mobile-summary-value">{card.value}</strong>
          </article>
        ))}
      </section>

      <section className="mobile-orders" aria-labelledby="mobile-recent-orders-title">
        <div className="mobile-orders-head">
          <div>
            <h2 id="mobile-recent-orders-title">Pedidos recientes</h2>
            <span>Últimos movimientos</span>
          </div>
          {onOpenOrders && (
            <button className="mobile-orders-link" type="button" onClick={onOpenOrders}>
              Ver todos <ArrowUpRight size={14} aria-hidden="true" />
            </button>
          )}
        </div>

        {recentOrders.length === 0 ? (
          <p className="mobile-orders-empty">Aún no hay pedidos registrados.</p>
        ) : (
          <div className="mobile-orders-list">
            {recentOrders.map((order) => {
              const customerName = order.customers?.full_name?.trim() || "Cliente";
              const badge = orderBadge(order);
              const units = order.order_items.reduce((sum, item) => sum + item.quantity, 0);
              const content = (
                <>
                  <span className="mobile-order-avatar" aria-hidden="true">
                    {initials(customerName)}
                  </span>
                  <span className="mobile-order-copy">
                    <span className="mobile-order-name">{customerName}</span>
                    <span className="mobile-order-meta">
                      {ORDER_DATE.format(new Date(order.created_at))} · {units} {units === 1 ? "artículo" : "artículos"}
                    </span>
                  </span>
                  <span className="mobile-order-side">
                    <span className="mobile-order-amount">{money(Number(order.total))}</span>
                    <span className={`mobile-order-badge mobile-order-badge--${badge.tone}`}>
                      {badge.label}
                    </span>
                  </span>
                </>
              );

              return onOpenOrders ? (
                <button
                  key={order.id}
                  type="button"
                  className="mobile-order"
                  onClick={onOpenOrders}
                >
                  {content}
                </button>
              ) : (
                <div className="mobile-order" key={order.id}>{content}</div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
