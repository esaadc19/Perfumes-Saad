import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Check,
  Package,
  Pencil,
  ReceiptText,
  Search,
  Trash2,
  TrendingUp,
  UserCheck,
} from "lucide-react";
import type { AdminOrder } from "../../services/admin";
import Metric from "./Metric";
import Pagination from "./Pagination";

type OrderStatus = "pending_confirmation" | "confirmed" | "cancelled";
type PaymentStatus = "pending" | "paid" | "refunded";

function money(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function OrdersPage({
  orders,
  loading,
  search,
  showPendingOnly,
  onSearchChange,
  savingOrderId,
  deletingOrderId,
  onEditOrder,
  onDeleteOrder,
  onStatusChange,
}: {
  orders: AdminOrder[];
  loading: boolean;
  search: string;
  showPendingOnly: boolean;
  onSearchChange: (value: string) => void;
  savingOrderId: string | null;
  deletingOrderId: string | null;
  onEditOrder: (order: AdminOrder) => void;
  onDeleteOrder: (order: AdminOrder) => void;
  onStatusChange: (order: AdminOrder, status: OrderStatus, paymentStatus: PaymentStatus) => void;
}) {
  const [filter, setFilter] = useState<"all" | PaymentStatus>(showPendingOnly ? "pending" : "all");
  const [page, setPage] = useState(1);
  const query = search.trim().toLowerCase();
  const visibleOrders = orders.filter((order) => {
    const matchesSearch = [
      order.customers?.full_name,
      order.customers?.email,
      order.customers?.phone,
      order.id,
      ...order.order_items.map((item) => item.product_name_snapshot),
    ].some((value) => value?.toLowerCase().includes(query));
    const matchesStatus = filter === "all" ||
      (filter === "pending"
        ? order.payment_status === "pending" && order.status === "confirmed"
        : order.payment_status === filter);
    return matchesSearch && matchesStatus;
  });
  useEffect(() => {
    setPage(1);
  }, [filter, query]);
  const PAGE_SIZE = 10;
  const pageCount = Math.max(1, Math.ceil(visibleOrders.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paginatedOrders = visibleOrders.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );
  const completedOrders = orders.filter((order) => order.payment_status === "paid");
  const revenue = completedOrders.reduce((sum, order) => sum + Number(order.total), 0);
  const missingCostItems = completedOrders.reduce(
    (sum, order) => sum + order.order_items.reduce(
      (itemSum, item) => itemSum + (item.unit_cost_snapshot === null ? item.quantity : 0),
      0
    ),
    0
  );
  const productCost = completedOrders.reduce(
    (sum, order) => sum + order.order_items.reduce(
      (itemSum, item) => itemSum + (item.unit_cost_snapshot === null
        ? 0
        : Number(item.unit_cost_snapshot) * item.quantity),
      0
    ),
    0
  );
  const deliveryCost = completedOrders.reduce((sum, order) => sum + Number(order.delivery_cost ?? 0), 0);
  const netProfit = missingCostItems > 0 ? null : revenue - productCost - deliveryCost;
  const normalizeOrderStatus = (status: string): OrderStatus =>
    status === "confirmed" || status === "cancelled" ? status : "pending_confirmation";
  const normalizePaymentStatus = (status: string): PaymentStatus =>
    status === "paid" || status === "refunded" ? status : "pending";

  return (
    <section className="admin-card">
      <div className="card-title">
        <div>
          <h2>Pedidos y transacciones</h2>
          <span>El costo del domicilio se resta de la ganancia cuando completas la venta.</span>
        </div>
        <label className="admin-search">
          <Search size={16} />
          <input
            aria-label="Buscar pedidos"
            placeholder="Cliente, perfume o número de pedido"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
      </div>
      <div className="metrics transaction-metrics">
        <Metric title="Total vendido" value={money(revenue)} icon={<TrendingUp />} />
        <Metric title="Costo de productos" value={money(productCost)} icon={<ReceiptText />} />
        <Metric title="Domicilios pagados" value={money(deliveryCost)} icon={<AlertTriangle />} />
        <Metric
          title="Utilidad neta"
          value={netProfit === null ? "Incompleta" : money(netProfit)}
          icon={<BarChart3 />}
          warning={netProfit !== null && netProfit < 0}
        />
        <Metric title="Ventas completas" value={String(completedOrders.length)} icon={<Check />} />
      </div>
      <div className="transaction-filters" aria-label="Filtrar transacciones">
        {([
          ["all", "Todos"],
          ["paid", "Ventas completas"],
          ["pending", "Pendientes de pago"],
          ["refunded", "Reembolsados"],
        ] as const).map(([status, label]) => (
          <button
            key={status}
            className={filter === status ? "selected" : ""}
            onClick={() => setFilter(status)}
          >
            {label}
          </button>
        ))}
      </div>
      {missingCostItems > 0 && (
        <p className="profile-notice" role="status">
          <AlertTriangle size={17} />
          Faltan costos para {missingCostItems} unidad(es) vendida(s). Completa el costo unitario desde Productos para calcular la ganancia neta.
        </p>
      )}
      <div className="admin-table">
        <div className="table-row transaction-row header">
          <span>Pedido / Cliente</span><span>Fecha del pedido</span><span>Vendido</span>
          <span>Costo productos</span><span>Domicilio</span><span>Utilidad neta</span>
          <span>Asesor</span>
          <span>Estado del pedido</span><span>Pago</span><span>Acciones</span>
        </div>
        {paginatedOrders.map((order) => {
          const hasMissingCost = order.order_items.some((item) => item.unit_cost_snapshot === null);
          const orderProductCost = order.order_items.reduce(
            (sum, item) => sum + Number(item.unit_cost_snapshot ?? 0) * item.quantity,
            0
          );
          return (
            <div className="table-row transaction-row" key={order.id}>
              <div className="profile-cell" aria-readonly="true">
                <strong>#{order.id.slice(0, 8).toUpperCase()} · {order.customers?.full_name || "Cliente"}</strong>
                <span>{order.order_items.map((item) =>
                  `${item.product_name_snapshot} ${item.size_ml} ml ×${item.quantity}`
                ).join(" · ") || order.customers?.phone || "Sin detalle"}</span>
              </div>
              <span>{new Date(order.created_at).toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}</span>
              <strong>{order.payment_status === "paid" ? money(Number(order.total)) : "—"}</strong>
              <span>{order.payment_status !== "paid" ? "—" : hasMissingCost ? "Falta costo" : money(orderProductCost)}</span>
              <span>{money(Number(order.delivery_cost ?? 0))}</span>
              <span>{order.payment_status !== "paid" ? "—" : hasMissingCost
                ? "Incompleta"
                : money(Number(order.total) - orderProductCost - Number(order.delivery_cost ?? 0))}</span>
              <span className="advisor-cell">{order.sales_advisor_name || "—"}</span>
              <label className="mobile-select-cell">
                <select
                  aria-label={`Estado del pedido ${order.id.slice(0, 8)}`}
                  value={normalizeOrderStatus(order.status)}
                  disabled={savingOrderId === order.id || order.payment_status === "paid"}
                  title={order.payment_status === "paid"
                    ? "La venta completada debe reembolsarse antes de editar el pedido."
                    : "Cambiar el estado no impide completar la venta."}
                  onChange={(event) => onStatusChange(
                    order,
                    event.target.value as OrderStatus,
                    normalizePaymentStatus(order.payment_status)
                  )}
                >
                  <option value="pending_confirmation">Por confirmar</option>
                  <option value="confirmed">Confirmado</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </label>
              <label className="mobile-select-cell">
                <select
                  aria-label={`Pago del pedido ${order.id.slice(0, 8)}`}
                  value={normalizePaymentStatus(order.payment_status)}
                  disabled={savingOrderId === order.id}
                  onChange={(event) => onStatusChange(
                    order,
                    normalizeOrderStatus(order.status),
                    event.target.value as PaymentStatus
                  )}
                >
                  {order.payment_status !== "paid" && order.payment_status !== "refunded" && <option value="pending">Pendiente</option>}
                  {order.payment_status !== "refunded" && <option value="paid">Pagado · completar venta</option>}
                  {(order.payment_status === "paid" || order.payment_status === "refunded") && <option value="refunded">Reembolsado</option>}
                </select>
              </label>
              <div className="order-actions">
                <button
                  className="secondary"
                  type="button"
                  title="Enviar link de seguimiento por WhatsApp"
                  onClick={() => {
                    const orderCode = order.id.slice(0, 8).toUpperCase();
                    const trackingLink = `${window.location.origin}${window.location.pathname}?track=${orderCode}`;
                    const message = `Hola ${order.customers?.full_name || "cliente"}, tu pedido #${orderCode} en Perfumes SAAD.\n\nPuedes rastrearlo aquí: ${trackingLink}`;
                    const phone = order.customers?.phone?.replace(/\D/g, "") || "";
                    if (phone) {
                      window.open(
                        `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
                        "_blank",
                        "noopener,noreferrer"
                      );
                    } else {
                      window.open(
                        `https://wa.me/?text=${encodeURIComponent(message)}`,
                        "_blank",
                        "noopener,noreferrer"
                      );
                    }
                  }}
                >
                  <Package size={15} /> Rastrear
                </button>
                {order.payment_status !== "paid" ? (
                  <>
                    <button className="secondary" type="button" onClick={() => onEditOrder(order)}><Pencil size={15} /> Editar</button>
                    {order.payment_status === "pending" && order.status !== "cancelled" && (
                      <button className="secondary" type="button" disabled={deletingOrderId === order.id} onClick={() => onDeleteOrder(order)}>
                        <Trash2 size={15} />{deletingOrderId === order.id ? "Eliminando…" : "Eliminar"}
                      </button>
                    )}
                  </>
                ) : <span>Venta completada; reembolsa para desbloquear</span>}
              </div>
            </div>
          );
        })}
        {!loading && visibleOrders.length === 0 && <p className="insight">No hay pedidos que coincidan con la búsqueda.</p>}
      </div>
      <Pagination
        page={currentPage}
        pageCount={pageCount}
        total={visibleOrders.length}
        noun="pedido"
        label="Paginación de pedidos"
        onPageChange={setPage}
      />
    </section>
  );
}
