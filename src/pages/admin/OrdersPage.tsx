import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Calendar,
  Check,
  Package,
  Pencil,
  ReceiptText,
  Search,
  Send,
  Trash2,
  TrendingUp,
  Truck,
} from "lucide-react";
import {
  type AdminOrder,
  type SalesAdvisor,
  sendDailyOrdersReminderEmail,
} from "../../services/admin";
import { isDateInPeriod, toBogotaDateStr, getOrderFinancialBreakdown } from "../../lib/order-finance";
import {
  type PeriodPreset,
  resolvePeriodFilter,
  getBogotaDate,
  startOfMonth,
} from "../../services/admin-periods";
import Metric from "../../components/admin/Metric";
import Pagination from "../../components/admin/Pagination";
import AdminButton from "../../components/admin/AdminButton";
import EmptyState from "../../components/admin/EmptyState";
import PeriodFilterSwitch from "../../components/admin/PeriodFilterSwitch";

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
  periodPreset = "mes",
  periodCustomFrom = "",
  periodCustomTo = "",
  isPeriodAllTime = false,
  onPeriodPresetChange,
  onPeriodCustomRangeChange,
  onPeriodToggleAllTime,
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
  periodPreset?: PeriodPreset;
  periodCustomFrom?: string;
  periodCustomTo?: string;
  isPeriodAllTime?: boolean;
  onPeriodPresetChange?: (preset: PeriodPreset) => void;
  onPeriodCustomRangeChange?: (from: string, to: string) => void;
  onPeriodToggleAllTime?: () => void;
}) {
  const [filter, setFilter] = useState<string>(showPendingOnly ? "pending" : "all");
  const [advisorFilter, setAdvisorFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const localToday = useMemo(() => getBogotaDate(), []);
  const [quickDateFilter, setQuickDateFilter] = useState<"period" | "today" | "future">("period");
  const [sendingReminder, setSendingReminder] = useState(false);
  const [reminderStatus, setReminderStatus] = useState<string | null>(null);

  // Estados locales en caso de usarse sin callbacks de App
  const [localPreset, setLocalPreset] = useState<PeriodPreset>("mes");
  const [localCustomFrom, setLocalCustomFrom] = useState<string>(() => startOfMonth(getBogotaDate()));
  const [localCustomTo, setLocalCustomTo] = useState<string>(() => getBogotaDate());
  const [localIsAllTime, setLocalIsAllTime] = useState(false);

  const activePreset = onPeriodPresetChange ? periodPreset : localPreset;
  const activeCustomFrom = onPeriodCustomRangeChange ? periodCustomFrom : localCustomFrom;
  const activeCustomTo = onPeriodCustomRangeChange ? periodCustomTo : localCustomTo;
  const activeIsAllTime = onPeriodToggleAllTime ? isPeriodAllTime : localIsAllTime;

  // Pedidos programados o entregados en la fecha de hoy
  const todayOrders = useMemo(() => {
    return orders.filter((order) => {
      const isPaid = order.payment_status === "paid";
      const dateStr = toBogotaDateStr(isPaid ? (order.paid_at ?? order.created_at) : order.created_at);
      return dateStr === localToday && order.status !== "cancelled";
    });
  }, [orders, localToday]);

  // Pedidos agendados para fechas futuras
  const futureOrders = useMemo(() => {
    return orders.filter((order) => {
      const isPaid = order.payment_status === "paid";
      const dateStr = toBogotaDateStr(isPaid ? (order.paid_at ?? order.created_at) : order.created_at);
      return dateStr > localToday && order.status !== "cancelled";
    });
  }, [orders, localToday]);

  const todayOrdersRevenue = useMemo(() => {
    return todayOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  }, [todayOrders]);

  const handleSendReminder = async () => {
    setSendingReminder(true);
    setReminderStatus(null);
    try {
      const res = await sendDailyOrdersReminderEmail(true);
      if (res.email_sent) {
        setReminderStatus(`✓ Correo enviado con éxito a tu bandeja (${res.today_orders} pedidos de hoy, ${res.future_orders} futuros).`);
      } else {
        setReminderStatus(res.message || "Recordatorio procesado sin pedidos pendientes.");
      }
    } catch (e) {
      setReminderStatus(e instanceof Error ? e.message : "No se pudo enviar el correo de recordatorio.");
    } finally {
      setSendingReminder(false);
    }
  };

  const handlePresetChange = (preset: PeriodPreset) => {
    setQuickDateFilter("period");
    if (onPeriodPresetChange) {
      onPeriodPresetChange(preset);
    } else {
      setLocalIsAllTime(false);
      setLocalPreset(preset);
    }
  };

  const handleCustomRangeChange = (from: string, to: string) => {
    setQuickDateFilter("period");
    if (onPeriodCustomRangeChange) {
      onPeriodCustomRangeChange(from, to);
    } else {
      setLocalIsAllTime(false);
      setLocalPreset("rango");
      setLocalCustomFrom(from);
      setLocalCustomTo(to);
    }
  };

  const handleToggleAllTime = () => {
    setQuickDateFilter("period");
    if (onPeriodToggleAllTime) {
      onPeriodToggleAllTime();
    } else {
      setLocalIsAllTime((prev) => !prev);
    }
  };

  const activePeriodFilter = useMemo(() => {
    return resolvePeriodFilter(activePreset, activeCustomFrom, activeCustomTo, activeIsAllTime);
  }, [activePreset, activeCustomFrom, activeCustomTo, activeIsAllTime]);

  // Filtrado de pedidos según el filtro rápido (hoy/futuros) o el período activo
  const dateFilteredOrders = useMemo(() => {
    if (quickDateFilter === "today") {
      return todayOrders;
    }
    if (quickDateFilter === "future") {
      return futureOrders;
    }
    return orders.filter((order) => {
      const isPaid = order.payment_status === "paid";
      const dateStr = toBogotaDateStr(isPaid ? (order.paid_at ?? order.created_at) : order.created_at);
      return isDateInPeriod(dateStr, activePeriodFilter.from, activePeriodFilter.to);
    });
  }, [orders, activePeriodFilter.from, activePeriodFilter.to, quickDateFilter, todayOrders, futureOrders]);

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
  const visibleOrders = useMemo(() => {
    return dateFilteredOrders.filter((order) => {
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
  }, [dateFilteredOrders, query, filter, advisorFilter]);

  useEffect(() => {
    setPage(1);
  }, [filter, advisorFilter, query, activePeriodFilter]);

  const PAGE_SIZE = 10;
  const pageCount = Math.max(1, Math.ceil(visibleOrders.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paginatedOrders = visibleOrders.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const completedOrders = useMemo(() => {
    return dateFilteredOrders.filter((order) => order.payment_status === "paid");
  }, [dateFilteredOrders]);

  const breakdowns = useMemo(() => {
    return dateFilteredOrders.map(getOrderFinancialBreakdown);
  }, [dateFilteredOrders]);

  const activeSales = useMemo(() => {
    return breakdowns.filter((b) => b.isActiveSale);
  }, [breakdowns]);

  const revenue = useMemo(() => {
    return activeSales.reduce((sum, b) => sum + b.collectedRevenue, 0);
  }, [activeSales]);

  const missingCostItems = useMemo(() => {
    return dateFilteredOrders
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
  }, [dateFilteredOrders]);

  const productCost = useMemo(() => {
    return activeSales.reduce((sum, b) => sum + b.coveredProductCost, 0);
  }, [activeSales]);

  const deliveryCost = useMemo(() => {
    return activeSales.reduce((sum, b) => sum + b.coveredDeliveryCost, 0);
  }, [activeSales]);

  const netProfit = missingCostItems > 0 ? null : revenue - productCost - deliveryCost;
  const initialLoading = loading && orders.length === 0;
  const normalizeOrderStatus = (status: string): OrderStatus =>
    status === "confirmed" || status === "cancelled" ? status : "pending_confirmation";
  const normalizePaymentStatus = (status: string): PaymentStatus =>
    status === "paid" || status === "refunded" || status === "credit" || status === "partial" ? status : "pending";

  return (
    <section className="admin-card">
      <div className="order-header-row">
        <div className="order-header-info">
          <p className="table-note">
            Cada abono suma al valor vendido, cubre primero el costo hasta su tope y el excedente suma a tu utilidad.
          </p>
          <div className="order-period-caption" role="status" aria-label="Período de pedidos">
            <Calendar size={13} aria-hidden="true" />
            <span>
              {quickDateFilter === "today"
                ? "🔔 Pedidos programados para HOY"
                : quickDateFilter === "future"
                ? "📅 Pedidos programados a FUTURO"
                : activePeriodFilter.label}
            </span>
            <span className="order-period-count">
              · <strong>{dateFilteredOrders.length}</strong> {dateFilteredOrders.length === 1 ? "pedido" : "pedidos"}
            </span>
          </div>
        </div>

        <div className="order-header-period">
          <PeriodFilterSwitch
            preset={activePreset}
            customFrom={activeCustomFrom}
            customTo={activeCustomTo}
            isAllTime={activeIsAllTime}
            onPresetChange={handlePresetChange}
            onCustomRangeChange={handleCustomRangeChange}
            onToggleAllTime={handleToggleAllTime}
          />
        </div>
      </div>

      {/* Banner de Recordatorio Diario de Pedidos */}
      <div className="order-daily-reminder-card">
        <div className="order-reminder-header">
          <div className="order-reminder-title-box">
            <span className="order-reminder-pill">
              <Bell size={13} /> Recordatorio Diario de Operaciones
            </span>
            <h3 className="order-reminder-heading">
              {todayOrders.length > 0 ? (
                <>Tienes <strong>{todayOrders.length} {todayOrders.length === 1 ? "pedido" : "pedidos"} para hoy</strong> ({money(todayOrdersRevenue)})</>
              ) : (
                <>No tienes pedidos para entrega hoy</>
              )}
              {futureOrders.length > 0 && (
                <span className="order-reminder-future-count"> · 📅 {futureOrders.length} pedidos agendados a futuro</span>
              )}
            </h3>
            <p className="order-reminder-sub">
              {todayOrders.length > 0
                ? "Alista tus perfumes en bolsas de lujo SAAD (botellas) o estuches de fomi (decants). Confirma entrega antes de salir."
                : "Puedes agendar pedidos para fechas futuras seleccionando cualquier fecha en el formulario de creación."}
            </p>
          </div>

          <div className="order-reminder-actions">
            <button
              type="button"
              className={`order-quick-filter-btn ${quickDateFilter === "period" ? "active" : ""}`}
              onClick={() => setQuickDateFilter("period")}
            >
              Período activo
            </button>
            <button
              type="button"
              className={`order-quick-filter-btn order-quick-filter-btn--today ${quickDateFilter === "today" ? "active" : ""}`}
              onClick={() => setQuickDateFilter("today")}
            >
              🔔 Hoy ({todayOrders.length})
            </button>
            <button
              type="button"
              className={`order-quick-filter-btn order-quick-filter-btn--future ${quickDateFilter === "future" ? "active" : ""}`}
              onClick={() => setQuickDateFilter("future")}
            >
              📅 Futuros ({futureOrders.length})
            </button>
            <button
              type="button"
              className="order-send-email-btn"
              onClick={handleSendReminder}
              disabled={sendingReminder}
              title="Envía el resumen de pedidos del día a tu correo electrónico registrado"
            >
              {sendingReminder ? "Enviando…" : <><Send size={13} /> Enviar a mi correo</>}
            </button>
          </div>
        </div>

        {reminderStatus && (
          <div className="order-reminder-status-msg" role="status">
            <span>{reminderStatus}</span>
            <button type="button" onClick={() => setReminderStatus(null)} aria-label="Cerrar mensaje">×</button>
          </div>
        )}
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
        <label className="admin-search order-search-field">
          <Search size={16} />
          <input
            aria-label="Buscar pedidos"
            placeholder="Cliente, perfume o número de pedido"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>

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
              <option value="all">Todos los estados</option>
              <option value="paid">Pagados</option>
              <option value="pending">Pendientes de confirmación</option>
              <option value="credit">A crédito</option>
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
          Faltan costos para {missingCostItems} unidad(es) vendida(s). Completa el costo unitario desde Inventario para calcular la ganancia neta.
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
          const isPaid = order.payment_status === "paid";
          const orderDateStr = toBogotaDateStr(isPaid ? (order.paid_at ?? order.created_at) : order.created_at);
          const isToday = orderDateStr === localToday;
          const isFuture = orderDateStr > localToday;
          return (
            <div className="table-row transaction-row" key={order.id}>
              <div className="profile-cell" aria-readonly="true">
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <strong>#{order.id.slice(0, 8).toUpperCase()} · {order.customers?.full_name || "Cliente"}</strong>
                  {isToday && (
                    <span className="order-timing-badge order-timing-badge--today" title="Pedido para entrega hoy">
                      🔔 Entrega hoy
                    </span>
                  )}
                  {isFuture && (
                    <span className="order-timing-badge order-timing-badge--future" title="Pedido agendado para entrega futura">
                      📅 Programado ({new Date(order.created_at).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short" })})
                    </span>
                  )}
                </div>
                <span>{order.order_items.map((item) =>
                  `${item.product_name_snapshot} ${item.size_ml} ml ×${item.quantity}`
                ).join(" · ") || order.customers?.phone || "Sin detalle"}</span>
                <span className="order-meta">
                  {new Date(order.created_at).toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}
                  {" · "}
                  {order.sales_advisor_name || salesAdvisors.find((a) => a.id === order.sales_advisor_id)?.full_name || "Sin asesor"}
                  {" · "}
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.2rem",
                      fontWeight: 600,
                      color: order.cost_funded_by === "personal" ? "#b45309" : "#059669",
                    }}
                  >
                    {order.cost_funded_by === "personal" ? "👛 De mi bolsillo" : "🏢 Utilidad empresa"}
                  </span>
                </span>
                {order.payment_status === "paid" && order.cost_funded_by === "personal" && (
                  <div className="order-personal-distribution" style={{ marginTop: "4px" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        background: "#fef3c7",
                        color: "#b45309",
                        border: "1px solid #fde68a",
                        fontSize: "0.72rem",
                        fontWeight: 600,
                      }}
                      title="Venta pagada en Nequi: el costo corresponde a reembolso de tu bolsillo"
                    >
                      👛 Reembolso a tu bolsillo: {money(b.fullCost)} · Utilidad SAAD: {money(b.realizedProfit ?? 0)}
                    </span>
                  </div>
                )}
                {b.isOpenCredit && (
                  <div className="order-credit-summary">
                    Abonado: <strong>{money(b.collectedRevenue)}</strong> de {money(b.orderTotal)} · Saldo: <strong>{money(b.creditBalance)}</strong>
                    {b.unrecoveredCost > 0 ? (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem",
                          marginLeft: "0.5rem",
                          padding: "1px 6px",
                          borderRadius: "4px",
                          background: "#fef3c7",
                          color: "#b45309",
                          border: "1px solid #fde68a",
                          fontSize: "0.72rem",
                          fontWeight: 700,
                        }}
                        title="Dinero de tu bolsillo adelantado para pagar al mayorista"
                      >
                        👛 De tu bolsillo: {money(b.unrecoveredCost)}
                      </span>
                    ) : (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem",
                          marginLeft: "0.5rem",
                          padding: "1px 6px",
                          borderRadius: "4px",
                          background: "#f0fdf4",
                          color: "#15803d",
                          border: "1px solid #bbf7d0",
                          fontSize: "0.72rem",
                          fontWeight: 700,
                        }}
                        title="El costo ya fue recuperado. Lo que entre ahora es 100% utilidad de la empresa."
                      >
                        ✅ Costo recuperado
                      </span>
                    )}
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
