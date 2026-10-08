import { useState, useEffect } from "react";
import { Search, AlertTriangle, DollarSign, TrendingUp, TrendingDown, Clock, X, Pencil, Trash2, Plus } from "lucide-react";
import {
  getCreditOrders,
  recordCreditPayment,
  updateCreditPayment,
  deleteCreditPayment,
  setCreditBlock,
  CREDIT_METHODS,
  type CreditOrderSummary,
  type CreditPayment,
} from "../../services/credits";

const money = (value: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);

type FilterTab = "all" | "overdue" | "upcoming" | "paid";

export default function CreditPage({ sectionRevision }: { sectionRevision: number }) {
  const [orders, setOrders] = useState<CreditOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");
  const [paymentModal, setPaymentModal] = useState<{ order: CreditOrderSummary | null; editingPayment?: CreditPayment } | null>(null);
  const [savingPayment, setSavingPayment] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);
  const [listModal, setListModal] = useState<CreditOrderSummary | null>(null);

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
      case "upcoming":
        return !order.overdue && order.status !== "paid" && !order.overdue;
      case "paid":
        return order.status === "paid";
      default:
        return true;
    }
  });

  const totalOutstanding = orders.reduce((sum, o) => sum + o.credit_amount, 0);
  const totalOverdue = orders.filter((o) => o.overdue).reduce((sum, o) => sum + o.credit_amount, 0);
  const overdueCount = orders.filter((o) => o.overdue).length;

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
      const method = formData.get("method") as "efectivo" | "transferencia" | "otro";
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
      <div className="card-title">
        <div>
          <h2>Cartera / Crédito</h2>
          <span>Pedidos vendidos a crédito y seguimiento de abonos.</span>
        </div>
      </div>

      <div className="credit-summary">
        <div className="summary-card">
          <DollarSign size={20} />
          <div>
            <span>Total por cobrar</span>
            <strong>{money(totalOutstanding)}</strong>
          </div>
        </div>
        <div className="summary-card warning">
          <AlertTriangle size={20} />
          <div>
            <span>Vencido</span>
            <strong>{money(totalOverdue)}</strong>
          </div>
        </div>
        <div className="summary-card">
          <Clock size={20} />
          <div>
            <span>Clientes vencidos</span>
            <strong>{overdueCount}</strong>
          </div>
        </div>
      </div>

      <div className="credit-filters">
        <label className="admin-search">
          <Search size={16} />
          <input
            placeholder="Buscar por cliente, pedido o teléfono"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="filter-tabs" role="tablist">
          {([
            ["all", "Todos"],
            ["overdue", "Vencidos"],
            ["upcoming", "Por vencer"],
            ["paid", "Pagados"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={filter === key}
              className={filter === key ? "active" : ""}
              onClick={() => setFilter(key as FilterTab)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      {filteredOrders.length === 0 ? (
        <p className="insight">No hay pedidos que coincidan con el filtro.</p>
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
            <div className="table-row credit-row" key={order.order_id}>
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
              {getDueDateDisplay(order)}
              {getStatusBadge(order)}
              <div className="order-actions">
                {order.status !== "paid" && (
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => openPaymentModal(order)}
                    disabled={savingPayment}
                  >
                    <Plus size={14} /> Abono
                  </button>
                )}
                {order.paid_amount > 0 && (
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => setListModal(order)}
                  >
                    <Pencil size={14} /> Editar
                  </button>
                )}
                {order.status !== "paid" && order.overdue && (
                  <button
                    className="secondary danger"
                    type="button"
                    onClick={() => handleBlockCredit(order.order_id, true)}
                  >
                    <X size={14} /> Bloquear
                  </button>
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
                      <button
                        className="secondary"
                        type="button"
                        onClick={() => setPaymentModal({ order: listModal, editingPayment: payment })}
                        disabled={savingPayment}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="secondary danger"
                        type="button"
                        onClick={() => handleDeletePayment(payment.id)}
                        disabled={deletingPaymentId === payment.id}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="edit-product-actions">
              <button className="secondary" type="button" onClick={() => setListModal(null)}>Cerrar</button>
              <button
                className="primary"
                type="button"
                onClick={() => { setPaymentModal({ order: listModal }); setListModal(null); }}
                disabled={listModal.status === "paid"}
              >
                <Plus size={14} /> Nuevo abono
              </button>
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
              <button className="secondary" type="button" onClick={closePaymentModal} disabled={savingPayment}>Cancelar</button>
              <button className="primary" type="submit" disabled={savingPayment}>
                {savingPayment ? "Guardando..." : paymentModal.editingPayment ? "Guardar cambios" : "Registrar abono"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}