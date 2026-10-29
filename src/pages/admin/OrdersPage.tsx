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
  Truck,
  UserCheck,
} from "lucide-react";
import type { AdminOrder, SalesAdvisor } from "../../services/admin";
import Metric from "../../components/admin/Metric";
import Pagination from "../../components/admin/Pagination";
import AdminButton from "../../components/admin/AdminButton";
import EmptyState from "../../components/admin/EmptyState";

type OrderStatus = "pending_confirmation" | "confirmed" | "cancelled";
type PaymentStatus = "pending" | "paid" | "refunded" | "credit" | "partial";

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
  salesAdvisors = [],
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
  salesAdvisors?: SalesAdvisor[];
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
        : filter === "credit"
        ? order.payment_status === "credit"
        : filter === "partial"
        ? order.payment_status === "partial"
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
  const initialLoading = loading && orders.length === 0;
  const normalizeOrderStatus = (status: string): OrderStatus =>
    status === "confirmed" || status === "cancelled" ? status : "pending_confirmation";
  const normalizePaymentStatus = (status: string): PaymentStatus =>
    status === "paid" || status === "refunded" || status === "credit" || status === "partial" ? status : "pending";

  return (
    <section className="admin-card">
      <div className="card-title order-toolbar">
        <p className="table-note">El costo del domicilio se resta de la ganancia cuando completas la venta.</p>
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
      {initialLoading && (
        <div className="section-loading" role="status">
          <span className="loading-spinner" aria-hidden="true" />
          <div>
            <strong>Cargando pedidos…</strong>
            <span>Estamos reuniendo las transacciones y sus totales.</span>
          </div>
        </div>
      )}
      <div className="transaction-content" hidden={initialLoading}>
      <div className="metrics transaction-metrics">
        <Metric title="Total vendido" value={money(revenue)} numericValue={revenue} format="money" icon={<TrendingUp />} />
        <Metric title="Costo de productos" value={money(productCost)} numericValue={productCost} format="money" icon={<ReceiptText />} />
        <Metric title="Domicilios pagados" value={money(deliveryCost)} numericValue={deliveryCost} format="money" icon={<Truck />} />
        <Metric
          title="Utilidad neta"
          value={netProfit === null ? "Incompleta" : money(netProfit)}
          numericValue={netProfit ?? undefined}
          format="money"
          icon={<BarChart3 />}
          warning={netProfit !== null && netProfit < 0}
        />
        <Metric title="Ventas completas" value={String(completedOrders.length)} numericValue={completedOrders.length} icon={<Check />} />
      </div>
      <div className="transaction-filters" role="tablist" aria-label="Filtrar transacciones">
        {([
          ["all", "Todos"],
          ["paid", "Ventas completas"],
          ["pending", "Pendientes de pago"],
          ["refunded", "Reembolsados"],
        ] as const).map(([status, label]) => (
          <AdminButton
            key={status}
            tone={filter === status ? "primary" : "secondary"}
            compact
            role="tab"
            aria-selected={filter === status}
            onClick={() => setFilter(status)}
          >
            {label}
          </AdminButton>
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
          <span>Pedido / Cliente</span><span className="cell-center">Vendido</span><span className="cell-center">Costos</span>
          <span className="cell-center">Utilidad neta</span><span className="cell-center">Estado</span><span className="cell-center">Acciones</span>
        </div>
        {paginatedOrders.map((order) => {
          const hasMissingCost = order.order_items.some((item) => item.unit_cost_snapshot === null);
          const orderProductCost = order.order_items.reduce(
            (sum, item) => sum + Number(item.unit_cost_snapshot ?? 0) * item.quantity,
            0
          );
          const isOpenCredit = order.payment_status === "credit" || order.payment_status === "partial";
          const orderTotal = Number(order.total);
          const deliveryCost = Number(order.delivery_cost ?? 0);
          const creditBalance = Math.max(0, Number(order.credit_amount ?? 0));
          const paidAmount = Math.max(0, orderTotal - creditBalance);
          return (
            <div className="table-row transaction-row" key={order.id}>
              <div className="profile-cell" aria-readonly="true">
                <strong>#{order.id.slice(0, 8).toUpperCase()} · {order.customers?.full_name || "Cliente"}</strong>
                <span>{order.order_items.map((item) =>
                  `${item.product_name_snapshot} ${item.size_ml} ml ×${item.quantity}`
                ).join(" · ") || order.customers?.phone || "Sin detalle"}</span>
                <span className="order-meta">
                  {new Date(order.created_at).toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}
                  {" · "}
                  {order.sales_advisor_name || salesAdvisors.find((a) => a.id === order.sales_advisor_id)?.full_name || "Sin asesor"}
                </span>
                {isOpenCredit && (
                  <div className="order-credit-summary">
                    Abonado: <strong>{money(paidAmount)}</strong> de {money(orderTotal)} · Saldo: <strong>{money(creditBalance)}</strong>
                  </div>
                )}
              </div>
              <strong className="cell-center">{order.payment_status === "paid" ? money(orderTotal) : "—"}</strong>
              <div className="order-cost-cell cell-center">
                <span>
                  Producto{" "}
                  <strong>
                    {order.payment_status !== "paid"
                      ? "—"
                      : hasMissingCost
                        ? "Falta costo"
                        : money(orderProductCost)}
                  </strong>
                </span>
                <small>Domicilio <strong>{money(deliveryCost)}</strong></small>
              </div>
              <span className="cell-center">{order.payment_status !== "paid" ? "—" : hasMissingCost
                ? "Incompleta"
                : money(orderTotal - orderProductCost - deliveryCost)}</span>
              <div className="order-status-cell">
                <label className="order-status-select">
                  <span>Pedido</span>
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
                <label className="order-status-select">
                  <span>Pago</span>
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
                    {order.payment_status !== "paid" && order.payment_status !== "refunded" && order.payment_status !== "credit" && order.payment_status !== "partial" && (
                      <>
                        <option value="credit">Crédito</option>
                        <option value="partial">Pago parcial</option>
                      </>
                    )}
                    {(order.payment_status === "credit" || order.payment_status === "partial") && (
                      <>
                        {order.payment_status === "credit" && <option value="credit">Crédito</option>}
                        <option value="partial">Pago parcial</option>
                        <option value="paid">Marcar pagado</option>
                      </>
                    )}
                  </select>
                </label>
              </div>
              <div className="order-actions">
                <AdminButton
                  tone="secondary"
                  compact
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
                </AdminButton>
                {order.payment_status !== "paid" ? (
                  <>
                    <AdminButton tone="secondary" compact type="button" onClick={() => onEditOrder(order)}>
                      <Pencil size={15} /> Editar
                    </AdminButton>
                    {order.payment_status === "pending" && order.status !== "cancelled" && (
                      <AdminButton
                        tone="danger"
                        variant="outline"
                        compact
                        type="button"
                        disabled={deletingOrderId === order.id}
                        onClick={() => onDeleteOrder(order)}
                      >
                        <Trash2 size={15} />{deletingOrderId === order.id ? "Eliminando…" : "Eliminar"}
                      </AdminButton>
                    )}
                  </>
                ) : <span>Venta completada; reembolsa para desbloquear</span>}
              </div>
            </div>
          );
        })}
        {!loading && visibleOrders.length === 0 && (
          <EmptyState
            icon={<ReceiptText size={26} />}
            title="No hay pedidos que coincidan con la búsqueda."
            hint="Ajusta el término de búsqueda o cambia el filtro de estado."
          />
        )}
      </div>
      <Pagination
        page={currentPage}
        pageCount={pageCount}
        total={visibleOrders.length}
        noun="pedido"
        label="Paginación de pedidos"
        onPageChange={setPage}
      />
      </div>
    </section>
  );
}
