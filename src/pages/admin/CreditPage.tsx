import { useState, useEffect, useMemo, type KeyboardEvent } from "react";
import {
  Search,
  AlertTriangle,
  DollarSign,
  Clock,
  X,
  Pencil,
  Trash2,
  Plus,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Check,
} from "lucide-react";
import {
  getCreditOrders,
  recordCreditPayment,
  updateCreditPayment,
  deleteCreditPayment,
  setCreditBlock,
  updateCreditOrderDueDate,
  CREDIT_METHODS,
  type CreditOrderSummary,
  type CreditPayment,
  type PaymentMethod,
} from "../../services/credits";
import {
  getUpcomingQuincenas,
  formatDueDateColombian,
  type QuincenaOption,
} from "../../lib/quincenas";
import AdminButton from "../../components/admin/AdminButton";
import EmptyState from "../../components/admin/EmptyState";

const money = (value: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);

type FilterTab = "all" | "overdue" | "upcoming" | "paid" | "q1" | "q2" | "later" | "no_date";

export default function CreditPage({ sectionRevision }: { sectionRevision: number }) {
  const [orders, setOrders] = useState<CreditOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");
  const [paymentModal, setPaymentModal] = useState<{ order: CreditOrderSummary | null; editingPayment?: CreditPayment } | null>(null);
  const [savingPayment, setSavingPayment] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);
  const [listModal, setListModal] = useState<CreditOrderSummary | null>(null);

  // Modal para asignar/editar fecha de vencimiento (quincenas)
  const [dueDateModal, setDueDateModal] = useState<CreditOrderSummary | null>(null);
  const [selectedDueDate, setSelectedDueDate] = useState<string>("");
  const [savingDueDate, setSavingDueDate] = useState(false);
  const [dueDateError, setDueDateError] = useState<string | null>(null);

  const upcomingQuincenas = useMemo(() => getUpcomingQuincenas(), []);
  const q1 = upcomingQuincenas[0];
  const q2 = upcomingQuincenas[1];

  // Cálculo de proyecciones por quincena para cobro
  const quincenaMetrics = useMemo(() => {
    let q1Total = 0;
    let q1Count = 0;
    let q2Total = 0;
    let q2Count = 0;
    let laterTotal = 0;
    let laterCount = 0;
    let noDateTotal = 0;
    let noDateCount = 0;

    for (const o of orders) {
      if (o.status === "paid" || o.credit_amount <= 0) continue;
      const d = o.credit_due_date ? o.credit_due_date.slice(0, 10) : null;
      if (!d) {
        noDateTotal += o.credit_amount;
        noDateCount += 1;
      } else if (q1 && d <= q1.dateStr) {
        q1Total += o.credit_amount;
        q1Count += 1;
      } else if (q2 && d <= q2.dateStr) {
        q2Total += o.credit_amount;
        q2Count += 1;
      } else {
        laterTotal += o.credit_amount;
        laterCount += 1;
      }
    }

    return {
      q1Total,
      q1Count,
      q2Total,
      q2Count,
      laterTotal,
      laterCount,
      noDateTotal,
      noDateCount,
    };
  }, [orders, q1, q2]);

  useEffect(() => {
    loadOrders();
  }, [sectionRevision]);

  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCreditOrders();
      setOrders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los pedidos a crédito");
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      order.order_code.toLowerCase().includes(search.toLowerCase()) ||
      order.customer_phone.includes(search);

    if (!matchesSearch) return false;

    switch (filter) {
      case "overdue":
        return order.overdue;
      // "Por vencer" son los que aun te deben: ni vencidos ni saldados.
      case "upcoming":
        return !order.overdue && order.status !== "paid";
      case "paid":
        return order.status === "paid";
      case "q1":
        return (
          order.status !== "paid" &&
          Boolean(order.credit_due_date) &&
          order.credit_due_date!.slice(0, 10) <= q1.dateStr
        );
      case "q2":
        return (
          order.status !== "paid" &&
          Boolean(order.credit_due_date) &&
          order.credit_due_date!.slice(0, 10) > q1.dateStr &&
          order.credit_due_date!.slice(0, 10) <= q2.dateStr
        );
      case "later":
        return (
          order.status !== "paid" &&
          Boolean(order.credit_due_date) &&
          order.credit_due_date!.slice(0, 10) > q2.dateStr
        );
      case "no_date":
        return order.status !== "paid" && !order.credit_due_date;
      default:
        return true;
    }
  });

  const totalOutstanding = orders.reduce((sum, o) => sum + o.credit_amount, 0);
  const totalOverdue = orders.filter((o) => o.overdue).reduce((sum, o) => sum + o.credit_amount, 0);
  const overdueCount = orders.filter((o) => o.overdue).length;
  const totalCollected = orders.reduce((sum, o) => sum + o.paid_amount, 0);
  const openCount = orders.filter((o) => o.status !== "paid").length;
  const paidCount = orders.length - openCount;

  const openPaymentModal = (order: CreditOrderSummary) => {
    setPaymentModal({ order });
  };

  const closePaymentModal = () => {
    setPaymentModal(null);
  };

  const handleSavePayment = async (formData: FormData) => {
    if (!paymentModal?.order) return;
    setSavingPayment(true);
    setError(null);
    try {
      const amount = Number(formData.get("amount"));
      const method = formData.get("method") as PaymentMethod;
      const note = formData.get("note") as string;
      const paidAt = formData.get("paid_at") as string;

      if (paymentModal.editingPayment) {
        await updateCreditPayment(paymentModal.editingPayment.id, {
          amount,
          method,
          note: note || null,
          paid_at: paidAt || undefined,
        });
      } else {
        await recordCreditPayment({
          order_id: paymentModal.order.order_id,
          amount,
          method,
          note: note || null,
          paid_at: paidAt || undefined,
        });
      }

      closePaymentModal();
      setListModal(null);
      loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar el abono");
    } finally {
      setSavingPayment(false);
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    setDeletingPaymentId(paymentId);
    setError(null);
    try {
      await deleteCreditPayment(paymentId);
      setListModal(null);
      loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el abono");
    } finally {
      setDeletingPaymentId(null);
    }
  };

  const handleBlockCredit = async (customerId: string, block: boolean) => {
    setError(null);
    try {
      await setCreditBlock(customerId, block);
      loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el bloqueo");
    }
  };

  const openDueDateModal = (order: CreditOrderSummary) => {
    setDueDateModal(order);
    setSelectedDueDate(
      order.credit_due_date ? order.credit_due_date.slice(0, 10) : (q1?.dateStr ?? "")
    );
    setDueDateError(null);
  };

  const handleSaveDueDate = async (orderId: string, newDueDate: string | null) => {
    setSavingDueDate(true);
    setDueDateError(null);
    try {
      await updateCreditOrderDueDate(orderId, newDueDate);
      setOrders((current) =>
        current.map((o) => {
          if (o.order_id !== orderId) return o;
          const isPaid = o.status === "paid";
          const hasDate = !isPaid && typeof newDueDate === "string" && newDueDate.length > 0;
          const overdue = hasDate
            ? new Date(newDueDate) < new Date() && o.credit_amount > 0
            : false;
          const daysOverdue = overdue && hasDate
            ? Math.floor((Date.now() - new Date(newDueDate).getTime()) / (1000 * 60 * 60 * 24))
            : 0;
          return {
            ...o,
            credit_due_date: newDueDate,
            overdue,
            days_overdue: daysOverdue,
          };
        })
      );
      setDueDateModal(null);
      setActionFeedback(
        newDueDate
          ? `Vencimiento guardado correctamente (${newDueDate}).`
          : "Fecha de vencimiento eliminada."
      );
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (err) {
      console.error("Error al actualizar fecha de vencimiento:", err);
      setDueDateError(err instanceof Error ? err.message : "No se pudo actualizar el vencimiento");
    } finally {
      setSavingDueDate(false);
    }
  };

  const getStatusBadge = (order: CreditOrderSummary) => {
    if (order.status === "paid") {
      return <span className="status-badge paid">Pagado</span>;
    }
    if (order.overdue) {
      return (
        <span className="status-badge overdue">
          <AlertTriangle size={12} /> Vencido ({order.days_overdue} días)
        </span>
      );
    }
    return <span className="status-badge pending">Pendiente</span>;
  };

  const getDueDateDisplay = (order: CreditOrderSummary) => {
    if (!order.credit_due_date) return "—";
    const dueDate = new Date(order.credit_due_date);
    const today = new Date();
    const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (order.overdue) {
      return <span className="due-date overdue">{dueDate.toLocaleDateString("es-CO")} (vencido)</span>;
    }
    if (diffDays <= 3) {
      return <span className="due-date soon">{dueDate.toLocaleDateString("es-CO")} ({diffDays} días)</span>;
    }
    return <span className="due-date">{dueDate.toLocaleDateString("es-CO")}</span>;
  };

  if (loading) {
    return <p className="catalog-message" role="status">Cargando cartera...</p>;
  }

  return (
    <section className="admin-card">
      <p className="credit-intro">Pedidos vendidos a crédito y seguimiento de abonos.</p>

      <div className="credit-summary">
        <div className="summary-card">
          <DollarSign size={20} />
          <div>
            <span>Total por cobrar</span>
            <strong>{money(totalOutstanding)}</strong>
          </div>
        </div>
        {/* El tono de alerta solo cuando hay algo vencido de verdad: un $0
            en rojo sería una señal falsa de alarma. */}
        <div className={`summary-card${totalOverdue > 0 ? " warning" : ""}`}>
          {totalOverdue > 0 ? <AlertTriangle size={20} /> : <ShieldCheck size={20} />}
          <div>
            <span>Vencido</span>
            <strong>{money(totalOverdue)}</strong>
          </div>
        </div>
        <div className={`summary-card${overdueCount > 0 ? " warning" : ""}`}>
          <Clock size={20} />
          <div>
            <span>Clientes vencidos</span>
            <strong>{overdueCount}</strong>
          </div>
        </div>
        {/* El historial se conserva en la tabla, pero se suma aparte para
            que "total por cobrar" siga siendo solo lo que te deben. */}
        <div className="summary-card">
          <CheckCircle2 size={20} />
          <div>
            <span>Cobrado en fiado</span>
            <strong>{money(totalCollected)}</strong>
          </div>
        </div>
      </div>

      {/* ========================================================
          PROYECCIÓN DE COBROS POR QUINCENA (Esquema 50/50)
         ======================================================== */}
      <div className="credit-quincenas-section">
        <div className="credit-quincenas-head">
          <div>
            <h3>
              <Calendar size={17} style={{ color: "var(--cuero)" }} />
              Cobros programados por quincena
            </h3>
            <p>Monitorea cuánto flujo de caja recibirás en cada quincena según las fechas pactadas.</p>
          </div>
        </div>

        <div className="credit-quincenas-grid">
          {/* Quincena 1 */}
          <div
            className={`quincena-card ${filter === "q1" ? "is-active" : ""}`}
            onClick={() => setFilter(filter === "q1" ? "all" : "q1")}
            role="button"
            tabIndex={0}
            title={`Filtrar pedidos de la quincena ${q1?.label ?? ""}`}
          >
            <div className="quincena-card-badge">Próxima quincena</div>
            <strong className="quincena-card-amount">{money(quincenaMetrics.q1Total)}</strong>
            <span className="quincena-card-title">{q1?.label ?? "Próxima"}</span>
            <small className="quincena-card-count">
              {quincenaMetrics.q1Count} {quincenaMetrics.q1Count === 1 ? "pedido por cobrar" : "pedidos por cobrar"}
            </small>
          </div>

          {/* Quincena 2 */}
          <div
            className={`quincena-card ${filter === "q2" ? "is-active" : ""}`}
            onClick={() => setFilter(filter === "q2" ? "all" : "q2")}
            role="button"
            tabIndex={0}
            title={`Filtrar pedidos de la quincena ${q2?.label ?? ""}`}
          >
            <div className="quincena-card-badge">Siguiente quincena</div>
            <strong className="quincena-card-amount">{money(quincenaMetrics.q2Total)}</strong>
            <span className="quincena-card-title">{q2?.label ?? "Siguiente"}</span>
            <small className="quincena-card-count">
              {quincenaMetrics.q2Count} {quincenaMetrics.q2Count === 1 ? "pedido por cobrar" : "pedidos por cobrar"}
            </small>
          </div>

          {/* Más adelante */}
          {quincenaMetrics.laterCount > 0 && (
            <div
              className={`quincena-card ${filter === "later" ? "is-active" : ""}`}
              onClick={() => setFilter(filter === "later" ? "all" : "later")}
              role="button"
              tabIndex={0}
              title="Filtrar pedidos de quincenas posteriores"
            >
              <div className="quincena-card-badge">Más adelante</div>
              <strong className="quincena-card-amount">{money(quincenaMetrics.laterTotal)}</strong>
              <span className="quincena-card-title">Futuras quincenas</span>
              <small className="quincena-card-count">
                {quincenaMetrics.laterCount} {quincenaMetrics.laterCount === 1 ? "pedido" : "pedidos"}
              </small>
            </div>
          )}

          {/* Sin fecha asignada */}
          {quincenaMetrics.noDateCount > 0 && (
            <div
              className={`quincena-card quincena-card--warning ${filter === "no_date" ? "is-active" : ""}`}
              onClick={() => setFilter(filter === "no_date" ? "all" : "no_date")}
              role="button"
              tabIndex={0}
              title="Filtrar pedidos que requieren fecha de vencimiento"
            >
              <div className="quincena-card-badge warning">⚠️ Requiere fecha</div>
              <strong className="quincena-card-amount" style={{ color: "#b45309" }}>{money(quincenaMetrics.noDateTotal)}</strong>
              <span className="quincena-card-title">Sin fecha asignada</span>
              <small className="quincena-card-count">
                {quincenaMetrics.noDateCount} {quincenaMetrics.noDateCount === 1 ? "pedido sin fecha" : "pedidos por asignar"}
              </small>
            </div>
          )}
        </div>
      </div>

      {actionFeedback && (
        <p
          className="form-success"
          role="status"
          style={{
            background: "#ecfdf5",
            color: "#059669",
            padding: "10px 14px",
            borderRadius: "8px",
            marginBottom: "16px",
            fontSize: "13px",
            fontWeight: 500,
          }}
        >
          ✓ {actionFeedback}
        </p>
      )}

      <div className="credit-filters">
        <label className="admin-search">
          <Search size={16} />
          <input
            aria-label="Buscar pedidos a crédito por cliente, pedido o teléfono"
            placeholder="Buscar por cliente, pedido o teléfono"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="filter-tabs" role="tablist" aria-label="Filtrar cartera por estado">
          {([
            ["all", "Todos", orders.length],
            ["q1", `Quincena ${q1?.label ?? ""}`, quincenaMetrics.q1Count],
            ["q2", `Quincena ${q2?.label ?? ""}`, quincenaMetrics.q2Count],
            ["no_date", "Sin fecha", quincenaMetrics.noDateCount],
            ["overdue", "Vencidos", orders.filter((o) => o.overdue).length],
            ["upcoming", "Por vencer", orders.filter((o) => !o.overdue && o.status !== "paid").length],
            ["paid", "Pagados", orders.filter((o) => o.status === "paid").length],
          ] as const)
            .filter(([key, _, count]) => {
              if (key === "q1" || key === "q2" || key === "no_date") return count > 0;
              return true;
            })
            .map(([key, label, count]) => (
              <AdminButton
                key={key}
                tone={filter === key ? "primary" : "secondary"}
                compact
                role="tab"
                aria-selected={filter === key}
                tabIndex={filter === key ? 0 : -1}
                className={filter === key ? "active" : ""}
                onClick={() => setFilter(key as FilterTab)}
              >
                {label}
                <span className="filter-count">{count}</span>
              </AdminButton>
            ))}
        </div>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      {filteredOrders.length === 0 ? (
        <EmptyState
          icon={<DollarSign size={26} />}
          title="No hay pedidos que coincidan con el filtro."
          hint={search || filter !== "all"
            ? "Prueba con otro término de búsqueda o vuelve a la pestaña Todos."
            : "Los pedidos vendidos a crédito aparecerán aquí."}
        />
      ) : (
        <div className="admin-table">
          <div className="table-row credit-row header">
            <span>Cliente</span>
            <span>Pedido</span>
            <span>Total</span>
            <span>Saldo</span>
            <span>Abonos</span>
            <span>Vence</span>
            <span>Estado</span>
            <span></span>
          </div>
          {filteredOrders.map((order) => (
            <div
              className={`table-row credit-row${order.status === "paid" ? " is-settled" : ""}`}
              key={order.order_id}
            >
              <div className="customer-cell">
                <strong>{order.customer_name}</strong>
                <small>{order.customer_phone}</small>
              </div>
              <span>#{order.order_code}</span>
              <span>{money(order.total)}</span>
              <span className={order.overdue ? "balance overdue" : "balance"}>
                {money(order.credit_amount)}
              </span>
              <span>{money(order.paid_amount)}</span>
              <div className="credit-due-date-cell">
                {order.status === "paid" ? (
                  <span className="due-date" style={{ color: "var(--muted)" }}>
                    Saldado
                  </span>
                ) : order.credit_due_date ? (
                  (() => {
                    const info = formatDueDateColombian(order.credit_due_date);
                    return (
                      <button
                        type="button"
                        className={`due-date-pill ${info.isOverdue ? "is-overdue" : info.isSoon ? "is-soon" : ""}`}
                        onClick={() => openDueDateModal(order)}
                        title="Haz clic para cambiar la fecha de vencimiento"
                      >
                        <Calendar size={13} />
                        <span>{info.formatted}</span>
                        <small>({info.relativeLabel})</small>
                        <Pencil size={11} className="pill-edit-icon" />
                      </button>
                    );
                  })()
                ) : (
                  <button
                    type="button"
                    className="due-date-assign-btn"
                    onClick={() => openDueDateModal(order)}
                    title="Asignar quincena de cobro a este pedido"
                  >
                    <Calendar size={13} />
                    <span>+ Asignar fecha</span>
                  </button>
                )}
              </div>
              {getStatusBadge(order)}
              <div className="order-actions">
                {order.status !== "paid" && (
                  <AdminButton
                    tone="secondary"
                    compact
                    type="button"
                    onClick={() => openPaymentModal(order)}
                    disabled={savingPayment}
                  >
                    <Plus size={14} /> Abono
                  </AdminButton>
                )}
                {order.paid_amount > 0 && (
                  <AdminButton
                    tone="secondary"
                    compact
                    type="button"
                    onClick={() => setListModal(order)}
                  >
                    <Pencil size={14} /> Editar
                  </AdminButton>
                )}
                {order.status !== "paid" && order.overdue && (
                  <AdminButton
                    tone="danger"
                    variant="outline"
                    compact
                    type="button"
                    onClick={() => handleBlockCredit(order.order_id, true)}
                  >
                    <X size={14} /> Bloquear
                  </AdminButton>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {listModal && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setListModal(null)}>
          <div className="add-modal">
            <button className="close" type="button" onClick={() => setListModal(null)} aria-label="Cerrar"><X /></button>
            <p className="eyebrow">CARTERA</p>
            <h2>Abonos registrados</h2>
            <p className="credit-modal-info">
              Cliente: <strong>{listModal.customer_name}</strong> · Pedido #{listModal.order_code}
            </p>
            <p className="credit-modal-info">
              Total: {money(listModal.total)} · Saldo actual: <strong>{money(listModal.credit_amount)}</strong>
            </p>

            {error && <p className="form-error" role="alert">{error}</p>}

            {listModal.payments.length === 0 ? (
              <p className="insight">Este pedido no tiene abonos registrados.</p>
            ) : (
              <div className="admin-table credit-payments-table">
                <div className="table-row header">
                  <span>Fecha</span>
                  <span>Monto</span>
                  <span>Método</span>
                  <span>Nota</span>
                  <span></span>
                </div>
                {listModal.payments.map((payment) => (
                  <div className="table-row" key={payment.id}>
                    <span>{new Date(payment.paid_at).toLocaleDateString("es-CO")}</span>
                    <span>{money(Number(payment.amount))}</span>
                    <span>{payment.method}</span>
                    <span>{payment.note ?? "—"}</span>
                    <div className="order-actions">
                      <AdminButton
                        tone="secondary"
                        compact
                        aria-label="Editar abono"
                        type="button"
                        onClick={() => setPaymentModal({ order: listModal, editingPayment: payment })}
                        disabled={savingPayment}
                      >
                        <Pencil size={14} />
                      </AdminButton>
                      <AdminButton
                        tone="danger"
                        variant="outline"
                        compact
                        aria-label="Eliminar abono"
                        type="button"
                        onClick={() => handleDeletePayment(payment.id)}
                        disabled={deletingPaymentId === payment.id}
                      >
                        <Trash2 size={14} />
                      </AdminButton>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="edit-product-actions">
              <AdminButton tone="secondary" type="button" onClick={() => setListModal(null)}>Cerrar</AdminButton>
              <AdminButton
                type="button"
                onClick={() => { setPaymentModal({ order: listModal }); setListModal(null); }}
                disabled={listModal.status === "paid"}
              >
                <Plus size={14} /> Nuevo abono
              </AdminButton>
            </div>
          </div>
        </div>
      )}

      {paymentModal?.order && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && closePaymentModal()}>
          <form className="add-modal" onSubmit={(e) => { e.preventDefault(); handleSavePayment(new FormData(e.currentTarget)); }}>
            <button className="close" type="button" onClick={closePaymentModal} aria-label="Cerrar"><X /></button>
            <p className="eyebrow">CARTERA</p>
            <h2>{paymentModal.editingPayment ? "Editar abono" : "Registrar abono"}</h2>
            <p className="credit-modal-info">
              Cliente: <strong>{paymentModal.order.customer_name}</strong> · Pedido #{paymentModal.order.order_code}
            </p>
            <p className="credit-modal-info">
              Total: {money(paymentModal.order.total)} · Saldo actual: <strong>{money(paymentModal.order.credit_amount)}</strong>
            </p>

            <div className="form-grid">
              <label>Monto del abono
                <input
                  type="number"
                  name="amount"
                  min="1"
                  step="1"
                  max={paymentModal.order.credit_amount + (paymentModal.editingPayment ? Number(paymentModal.editingPayment.amount) : 0)}
                  defaultValue={paymentModal.editingPayment ? Number(paymentModal.editingPayment.amount) : ""}
                  required
                  placeholder={`Máx: ${money(paymentModal.order.credit_amount)}`}
                />
              </label>
              <label>Método
                <select name="method" defaultValue={paymentModal.editingPayment?.method ?? "efectivo"} required>
                  {CREDIT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </label>
              <label>Fecha del pago
                <input
                  type="date"
                  name="paid_at"
                  defaultValue={
                    paymentModal.editingPayment
                      ? new Date(paymentModal.editingPayment.paid_at).toISOString().split("T")[0]
                      : new Date().toISOString().split("T")[0]
                  }
                  required
                />
              </label>
              <label className="form-wide">Nota (opcional)
                <input name="note" defaultValue={paymentModal.editingPayment?.note ?? ""} placeholder="Referencia de transferencia, etc." />
              </label>
            </div>

            {error && <p className="form-error" role="alert">{error}</p>}

            <div className="edit-product-actions">
              <AdminButton tone="secondary" type="button" onClick={closePaymentModal} disabled={savingPayment}>Cancelar</AdminButton>
              <AdminButton type="submit" disabled={savingPayment}>
                {savingPayment ? "Guardando..." : paymentModal.editingPayment ? "Guardar cambios" : "Registrar abono"}
              </AdminButton>
            </div>
          </form>
        </div>
      )}

      {dueDateModal && (
        <div
          className="overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !savingDueDate) setDueDateModal(null);
          }}
        >
          <div className="add-modal" style={{ maxWidth: "460px" }}>
            <button
              className="close"
              type="button"
              onClick={() => {
                if (!savingDueDate) setDueDateModal(null);
              }}
              aria-label="Cerrar"
            >
              <X />
            </button>
            <p className="eyebrow">CARTERA · VENCIMIENTO</p>
            <h2>Asignar fecha de cobro</h2>
            <p className="credit-modal-info" style={{ marginBottom: "16px" }}>
              Cliente: <strong>{dueDateModal.customer_name}</strong> · Pedido #{dueDateModal.order_code}
              <br />
              Saldo pendiente: <strong>{money(dueDateModal.credit_amount)}</strong> de {money(dueDateModal.total)}
            </p>

            <div style={{ marginBottom: "16px" }}>
              <label className="auth-label" style={{ fontWeight: 600, display: "block", marginBottom: "8px" }}>
                Atajos de quincena (Esquema 50/50 SAAD):
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {upcomingQuincenas.map((q) => {
                  const isSelected = selectedDueDate === q.dateStr;
                  return (
                    <button
                      key={q.key}
                      type="button"
                      onClick={() => setSelectedDueDate(q.dateStr)}
                      disabled={savingDueDate}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: isSelected ? "2px solid var(--cuero)" : "1px solid var(--border)",
                        background: isSelected ? "rgba(138, 86, 50, 0.08)" : "var(--surface)",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "10px",
                          textTransform: "uppercase",
                          fontWeight: 700,
                          color: isSelected ? "var(--cuero)" : "var(--muted)",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {q.isNext ? "⚡ Próxima quincena" : "Quincena"}
                      </span>
                      <strong
                        style={{
                          fontSize: "13px",
                          color: isSelected ? "var(--cuero)" : "var(--foreground)",
                          marginTop: "2px",
                        }}
                      >
                        {q.label}
                      </strong>
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="auth-label" style={{ marginBottom: "18px" }}>
              O selecciona una fecha personalizada:
              <input
                type="date"
                value={selectedDueDate}
                onChange={(e) => setSelectedDueDate(e.target.value)}
                disabled={savingDueDate}
                style={{ marginTop: "6px" }}
              />
            </label>

            {dueDateError && <p className="form-error" role="alert">{dueDateError}</p>}

            <div className="order-actions" style={{ justifyContent: "space-between", marginTop: "18px" }}>
              {dueDateModal.credit_due_date ? (
                <AdminButton
                  tone="danger"
                  variant="outline"
                  compact
                  type="button"
                  disabled={savingDueDate}
                  onClick={() => handleSaveDueDate(dueDateModal.order_id, null)}
                >
                  <Trash2 size={14} /> Quitar fecha
                </AdminButton>
              ) : <span />}
              <div style={{ display: "flex", gap: "8px" }}>
                <AdminButton
                  tone="secondary"
                  compact
                  type="button"
                  disabled={savingDueDate}
                  onClick={() => setDueDateModal(null)}
                >
                  Cancelar
                </AdminButton>
                <AdminButton
                  tone="primary"
                  compact
                  type="button"
                  disabled={savingDueDate || !selectedDueDate}
                  onClick={() => handleSaveDueDate(dueDateModal.order_id, selectedDueDate)}
                >
                  <Check size={14} /> {savingDueDate ? "Guardando..." : "Guardar vencimiento"}
                </AdminButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}