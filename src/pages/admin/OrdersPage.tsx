import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import type { AdminOrder, SalesAdvisor } from "../../services/admin";
import { getOrderFinancialBreakdown } from "../../lib/order-finance";
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
  const [filter, setFilter] = useState<string>(showPendingOnly ? "pending" : "all");
  const [advisorFilter, setAdvisorFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const advisorOptions = useMemo(() => {
    const list: Array<{ id: string; name: string }> = [];
    const seen = new Set<string>();

    for (const advisor of salesAdvisors) {
      if (!seen.has(advisor.id)) {
        seen.add(advisor.id);
        list.push({ id: advisor.id, name: advisor.full_name });
      }
    }

    for (const order of orders) {
      if (order.sales_advisor_id && !seen.has(order.sales_advisor_id)) {
        seen.add(order.sales_advisor_id);
        list.push({
          id: order.sales_advisor_id,
          name: order.sales_advisor_name || "Asesor",
        });
      }
    }

    return list.sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [salesAdvisors, orders]);

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
        ? order.payment_status === "partial" || (order.payment_status === "credit" && getOrderFinancialBreakdown(order).collectedRevenue > 0)
        : filter === "refunded"
        ? order.payment_status === "refunded"
        : filter === "paid"
        ? order.payment_status === "paid"
        : order.payment_status === filter);
    const matchesAdvisor = advisorFilter === "all" ||
      (advisorFilter === "none"
        ? !order.sales_advisor_id
        : order.sales_advisor_id === advisorFilter);
    return matchesSearch && matchesStatus && matchesAdvisor;
  });
  useEffect(() => {
    setPage(1);
  }, [filter, advisorFilter, query]);
  const PAGE_SIZE = 10;
  const pageCount = Math.max(1, Math.ceil(visibleOrders.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paginatedOrders = visibleOrders.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );
  const completedOrders = orders.filter((order) => order.payment_status === "paid");
  const breakdowns = orders.map(getOrderFinancialBreakdown);
  const activeSales = breakdowns.filter((b) => b.isActiveSale);
  const revenue = activeSales.reduce((sum, b) => sum + b.collectedRevenue, 0);
  const missingCostItems = orders
    .filter((order) => {
      const b = getOrderFinancialBreakdown(order);
      return b.isActiveSale;
    })
    .reduce(
      (sum, order) =>
        sum +
        order.order_items.reduce(
          (itemSum, item) => itemSum + (item.unit_cost_snapshot === null ? item.quantity : 0),
          0
        ),
      0
    );
  const productCost = activeSales.reduce((sum, b) => sum + b.coveredProductCost, 0);
  const deliveryCost = activeSales.reduce((sum, b) => sum + b.coveredDeliveryCost, 0);
  const netProfit = missingCostItems > 0 ? null : revenue - productCost - deliveryCost;
  const initialLoading = loading && orders.length === 0;
  const normalizeOrderStatus = (status: string): OrderStatus =>
    status === "confirmed" || status === "cancelled" ? status : "pending_confirmation";
  const normalizePaymentStatus = (status: string): PaymentStatus =>
    status === "paid" || status === "refunded" || status === "credit" || status === "partial" ? status : "pending";

  return (
    <section className="admin-card">
      <div className="card-title order-toolbar">
        <p className="table-note">Cada abono suma al valor vendido, cubre primero el costo hasta su tope y el excedente suma a tu utilidad.</p>
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
      <div className="order-filters-row" role="region" aria-label="Filtros de pedidos">
        <div className="order-filter-group">
          <label className="order-filter-item">
            <span>Asesor</span>
            <select
              value={advisorFilter}
              onChange={(event) => setAdvisorFilter(event.target.value)}
              aria-label="Filtrar por asesor de venta"
            >
              <option value="all">Todos los asesores</option>
              <option value="none">Sin asesor asignado</option>
              {advisorOptions.map((adv) => (
                <option key={adv.id} value={adv.id}>
                  {adv.name}
                </option>
              ))}
            </select>
          </label>

          <label className="order-filter-item">
            <span>Estado de pago</span>
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              aria-label="Filtrar por estado de pago"
            >
              <option value="all">Todos</option>
              <option value="partial">Pago parcial</option>
              <option value="refunded">Reembolsados</option>
            </select>
          </label>
        </div>

        {(advisorFilter !== "all" || filter !== "all" || query !== "") && (
          <button
            type="button"
            className="order-filter-reset"
            onClick={() => {
              setAdvisorFilter("all");
              setFilter("all");
              onSearchChange("");
            }}
          >
            Limpiar filtros
          </button>
        )}
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
          const b = getOrderFinancialBreakdown(order);
          const showNumbers = b.isPaid || b.isOpenCredit;
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
                {b.isOpenCredit && (
                  <div className="order-credit-summary">
                    Abonado: <strong>{money(b.collectedRevenue)}</strong> de {money(b.orderTotal)} · Saldo: <strong>{money(b.creditBalance)}</strong>
                  </div>
                )}
              </div>
              <div className="order-cost-cell cell-center">
                <strong>{showNumbers ? money(b.collectedRevenue) : "—"}</strong>
                {b.isOpenCredit && (
                  <small>Total pedido: {money(b.orderTotal)}</small>
                )}
              </div>
              <div className="order-cost-cell cell-center">
                <span>
                  Producto{" "}
                  <strong>
                    {!showNumbers
                      ? "—"
                      : b.hasMissingCost
                        ? "Falta costo"
                        : money(b.coveredProductCost)}
                  </strong>
                  {b.isOpenCredit && !b.hasMissingCost && (
                    <small style={{ display: "block", color: "var(--muted)" }}>
                      de {money(b.fullProductCost)}
                    </small>
                  )}
                </span>
                <small>
                  Domicilio{" "}
                  <strong>
                    {showNumbers ? money(b.coveredDeliveryCost) : money(b.fullDeliveryCost)}
                  </strong>
                  {b.isOpenCredit && b.fullDeliveryCost > 0 && b.coveredDeliveryCost < b.fullDeliveryCost && (
                    <span> de {money(b.fullDeliveryCost)}</span>
                  )}
                </small>
              </div>
              <span className="cell-center">
                {!showNumbers
                  ? "—"
                  : b.hasMissingCost || b.realizedProfit === null
                    ? "Incompleta"
                    : money(b.realizedProfit)}
              </span>
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
