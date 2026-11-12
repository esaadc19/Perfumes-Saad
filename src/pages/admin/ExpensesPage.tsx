import { useState } from "react";
import { Check, Pencil, Trash2, Wallet, X } from "lucide-react";
import AdminButton from "../../components/admin/AdminButton";
import EmptyState from "../../components/admin/EmptyState";
import Pagination from "../../components/admin/Pagination";
import { formatBogotaDate, getDaysUntil, money } from "../../lib/format";
import {
  EXPENSE_CATEGORIES,
  type Expense,
  type RecurrenceFrequency,
  type RecurringExpense,
  type UpdateExpenseInput,
  type UpdateRecurringExpenseInput,
} from "../../services/expenses";
import type { ExpenseFormState } from "./types";

interface ExpensesPageProps {
  form: ExpenseFormState;
  onFormChange: (form: ExpenseFormState) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  saving: boolean;
  recurringExpenses: RecurringExpense[];
  payingRecurringExpenseId: string | null;
  deletingRecurringExpenseId: string | null;
  onPayRecurring: (expense: RecurringExpense) => void;
  onDeleteRecurring: (id: string) => void;
  onUpdateExpense?: (id: string, updated: UpdateExpenseInput) => Promise<void>;
  onUpdateRecurring?: (id: string, updated: UpdateRecurringExpenseInput) => Promise<void>;
  expenses: Expense[];
  paginatedExpenses: Expense[];
  currentPage: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  deletingExpenseId: string | null;
  onDeleteExpense: (expense: Expense) => void;
  loading: boolean;
}

export default function ExpensesPage({
  form,
  onFormChange,
  onSubmit,
  saving,
  recurringExpenses,
  payingRecurringExpenseId,
  deletingRecurringExpenseId,
  onPayRecurring,
  onDeleteRecurring,
  onUpdateExpense,
  onUpdateRecurring,
  expenses,
  paginatedExpenses,
  currentPage,
  pageCount,
  onPageChange,
  deletingExpenseId,
  onDeleteExpense,
  loading,
}: ExpensesPageProps) {
  // Estado para editar gasto normal
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCategory, setEditCategory] = useState("General");
  const [editPaymentMethod, setEditPaymentMethod] = useState("efectivo");
  const [editDate, setEditDate] = useState("");

  // Estado para editar recordatorio recurrente
  const [editingRecurring, setEditingRecurring] = useState<RecurringExpense | null>(null);
  const [editRecName, setEditRecName] = useState("");
  const [editRecAmount, setEditRecAmount] = useState("");
  const [editRecCategory, setEditRecCategory] = useState("General");
  const [editRecFrequency, setEditRecFrequency] = useState<RecurrenceFrequency>("monthly");
  const [editRecDate, setEditRecDate] = useState("");

  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const openEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setEditName(expense.name);
    setEditAmount(String(expense.amount));
    setEditCategory(expense.category);
    setEditPaymentMethod(expense.payment_method || "efectivo");
    setEditDate(expense.expense_date);
    setEditError(null);
  };

  const handleSaveEditExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense || !onUpdateExpense) return;

    const trimmedName = editName.trim();
    const parsedAmount = Number(editAmount);

    if (!trimmedName) {
      setEditError("El nombre del gasto es obligatorio.");
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setEditError("El monto debe ser un número mayor a cero.");
      return;
    }
    if (!editDate) {
      setEditError("La fecha del gasto es obligatoria.");
      return;
    }

    setSavingEdit(true);
    setEditError(null);
    try {
      await onUpdateExpense(editingExpense.id, {
        name: trimmedName,
        amount: parsedAmount,
        category: editCategory,
        expense_date: editDate,
        payment_method: editPaymentMethod,
      });
      setEditingExpense(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "No se pudo actualizar el gasto.");
    } finally {
      setSavingEdit(false);
    }
  };

  const openEditRecurring = (rec: RecurringExpense) => {
    setEditingRecurring(rec);
    setEditRecName(rec.name);
    setEditRecAmount(String(rec.amount));
    setEditRecCategory(rec.category);
    setEditRecFrequency(rec.frequency);
    setEditRecDate(rec.next_due_date);
    setEditError(null);
  };

  const handleSaveEditRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecurring || !onUpdateRecurring) return;

    const trimmedName = editRecName.trim();
    const parsedAmount = Number(editRecAmount);

    if (!trimmedName) {
      setEditError("El nombre del recordatorio es obligatorio.");
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setEditError("El monto debe ser un número mayor a cero.");
      return;
    }
    if (!editRecDate) {
      setEditError("La fecha de próximo vencimiento es obligatoria.");
      return;
    }

    setSavingEdit(true);
    setEditError(null);
    try {
      await onUpdateRecurring(editingRecurring.id, {
        name: trimmedName,
        amount: parsedAmount,
        category: editRecCategory,
        frequency: editRecFrequency,
        next_due_date: editRecDate,
      });
      setEditingRecurring(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "No se pudo actualizar el recordatorio.");
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <section className="admin-card">
      <p className="page-intro">Registra gastos, programa recordatorios y consulta los pagos incluidos en reportes diarios y semanales.</p>
      <form className="expense-form" onSubmit={onSubmit}>
        <label>Nombre
          <input value={form.name} onChange={(event) => onFormChange({ ...form, name: event.target.value })} placeholder="Ej. Alquiler local" required />
        </label>
        <label>Monto
          <input type="number" min="0" step="1" value={form.amount} onChange={(event) => onFormChange({ ...form, amount: event.target.value })} placeholder="0" required />
        </label>
        <label>Categoría
          <select value={form.category} onChange={(event) => onFormChange({ ...form, category: event.target.value })}>
            {EXPENSE_CATEGORIES.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </label>
        <label>Pagado con
          <select value={form.payment_method || "efectivo"} onChange={(event) => onFormChange({ ...form, payment_method: event.target.value })}>
            <option value="efectivo">Efectivo (Caja)</option>
            <option value="nequi_daviplata">Nequi / Daviplata</option>
            <option value="bancolombia">Bancolombia / Transferencia</option>
            <option value="datafono">Datafono / Tarjeta</option>
            <option value="otro">Otro</option>
          </select>
        </label>
        <label>{form.recurring ? "Fecha del pago realizado" : "Fecha"}
          <input type="date" value={form.date} onChange={(event) => onFormChange({ ...form, date: event.target.value })} required />
        </label>
        <label className="expense-recurring-toggle">
          <span>¿Es un gasto recurrente / suscripción?</span>
          <input
            type="checkbox"
            checked={form.recurring}
            onChange={(event) => onFormChange({ ...form, recurring: event.target.checked })}
          />
        </label>
        {form.recurring && (
          <label>Frecuencia
            <select
              value={form.frequency}
              onChange={(event) => onFormChange({
                ...form,
                frequency: event.target.value as RecurrenceFrequency,
              })}
            >
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensual</option>
              <option value="yearly">Anual</option>
            </select>
          </label>
        )}
        <AdminButton type="submit" disabled={saving}>
          {saving ? "Guardando..." : form.recurring ? "Registrar y programar" : "Agregar gasto"}
        </AdminButton>
      </form>
      {form.recurring && (
        <p className="profile-notice">
          Se registrará el gasto en tu contabilidad y gastos operativos actuales, y se programará el recordatorio automático para el siguiente vencimiento.
        </p>
      )}
      {recurringExpenses.length > 0 && (
        <div className="recurring-expenses">
          <h3>Recordatorios de pagos recurrentes</h3>
          {recurringExpenses.map((expense) => {
            const daysUntil = getDaysUntil(expense.next_due_date);
            const dueLabel = daysUntil < 0
              ? `Vencido hace ${Math.abs(daysUntil)} día(s)`
              : daysUntil === 0
                ? "Vence hoy"
                : `Vence en ${daysUntil} día(s)`;
            const frequencyLabel = expense.frequency === "weekly"
              ? "Semanal"
              : expense.frequency === "yearly" ? "Anual" : "Mensual";
            return (
              <div className="recurring-expense-row" key={expense.id}>
                <div>
                  <strong>{expense.name} · {money(expense.amount)}</strong>
                  <span>{expense.category} · {frequencyLabel} · {formatBogotaDate(expense.next_due_date)}</span>
                  <small className={daysUntil <= 0 ? "expense-overdue" : ""}>{dueLabel}</small>
                </div>
                <div className="recurring-expense-actions">
                  <AdminButton
                    tone="secondary"
                    compact
                    type="button"
                    disabled={payingRecurringExpenseId === expense.id}
                    onClick={() => onPayRecurring(expense)}
                  >
                    {payingRecurringExpenseId === expense.id ? "Guardando..." : "Registrar pago"}
                  </AdminButton>
                  <AdminButton
                    tone="secondary"
                    compact
                    type="button"
                    aria-label={`Editar recordatorio ${expense.name}`}
                    onClick={() => openEditRecurring(expense)}
                  >
                    <Pencil size={15} />
                  </AdminButton>
                  <AdminButton
                    tone="danger"
                    variant="outline"
                    compact
                    type="button"
                    aria-label={`Eliminar recordatorio ${expense.name}`}
                    disabled={deletingRecurringExpenseId === expense.id}
                    onClick={() => onDeleteRecurring(expense.id)}
                  >
                    <Trash2 size={16} />
                  </AdminButton>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {expenses.length > 0 ? (
        <>
          <div className="admin-table">
            <div className="table-row expense-row header">
              <span>Nombre</span>
              <span>Categoría</span>
              <span className="cell-center">Monto</span>
              <span className="cell-center">Fecha</span>
              <span></span>
            </div>
            {paginatedExpenses.map((expense) => (
              <div className="table-row expense-row" key={expense.id}>
                <strong>{expense.name}</strong>
                <span>{expense.category}</span>
                <span className="cell-center">{money(expense.amount)}</span>
                <span className="cell-center">{expense.expense_date}</span>
                <div className="expense-actions">
                  <AdminButton
                    tone="secondary"
                    compact
                    type="button"
                    aria-label={`Editar gasto ${expense.name}`}
                    onClick={() => openEditExpense(expense)}
                  >
                    <Pencil size={15} />
                  </AdminButton>
                  <AdminButton
                    tone="danger"
                    variant="outline"
                    compact
                    type="button"
                    aria-label={`Eliminar gasto ${expense.name}`}
                    disabled={deletingExpenseId === expense.id}
                    onClick={() => onDeleteExpense(expense)}
                  >
                    <Trash2 size={15} />
                  </AdminButton>
                </div>
              </div>
            ))}
          </div>
          <Pagination
            page={currentPage}
            pageCount={pageCount}
            total={expenses.length}
            noun="gasto"
            label="Paginación de gastos"
            onPageChange={onPageChange}
          />
        </>
      ) : (
        !loading && (
          <EmptyState
            icon={<Wallet size={26} />}
            title="Todavía no registras gastos"
            hint="Usa el formulario de arriba para agregar tu primer gasto. También puedes marcarlo como recurrente para recibir recordatorios."
          />
        )
      )}

      {/* Modal para editar gasto individual */}
      {editingExpense && (
        <div
          className="overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !savingEdit) setEditingExpense(null);
          }}
        >
          <div className="add-modal" style={{ maxWidth: "480px" }}>
            <button
              className="close"
              type="button"
              onClick={() => {
                if (!savingEdit) setEditingExpense(null);
              }}
              aria-label="Cerrar"
            >
              <X />
            </button>
            <p className="eyebrow">GASTOS OPERATIVOS</p>
            <h2>Editar gasto</h2>
            <p className="credit-modal-info" style={{ marginBottom: "16px" }}>
              Modifica los detalles del gasto registrado.
            </p>

            <form onSubmit={handleSaveEditExpense}>
              <div className="form-grid">
                <label className="form-wide">
                  Nombre del gasto
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                    disabled={savingEdit}
                  />
                </label>
                <label>
                  Monto ($)
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    required
                    disabled={savingEdit}
                  />
                </label>
                <label>
                  Categoría
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    disabled={savingEdit}
                  >
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Pagado con
                  <select
                    value={editPaymentMethod}
                    onChange={(e) => setEditPaymentMethod(e.target.value)}
                    disabled={savingEdit}
                  >
                    <option value="efectivo">Efectivo (Caja)</option>
                    <option value="nequi_daviplata">Nequi / Daviplata</option>
                    <option value="bancolombia">Bancolombia / Transferencia</option>
                    <option value="datafono">Datafono / Tarjeta</option>
                    <option value="otro">Otro</option>
                  </select>
                </label>
                <label>
                  Fecha del gasto
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    required
                    disabled={savingEdit}
                  />
                </label>
              </div>

              {editError && <p className="form-error" role="alert">{editError}</p>}

              <div className="edit-product-actions" style={{ marginTop: "18px" }}>
                <AdminButton
                  tone="secondary"
                  type="button"
                  disabled={savingEdit}
                  onClick={() => setEditingExpense(null)}
                >
                  Cancelar
                </AdminButton>
                <AdminButton type="submit" disabled={savingEdit}>
                  <Check size={15} /> {savingEdit ? "Guardando..." : "Guardar cambios"}
                </AdminButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal para editar gasto recurrente */}
      {editingRecurring && (
        <div
          className="overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !savingEdit) setEditingRecurring(null);
          }}
        >
          <div className="add-modal" style={{ maxWidth: "480px" }}>
            <button
              className="close"
              type="button"
              onClick={() => {
                if (!savingEdit) setEditingRecurring(null);
              }}
              aria-label="Cerrar"
            >
              <X />
            </button>
            <p className="eyebrow">RECORDATORIO</p>
            <h2>Editar recordatorio de pago</h2>
            <p className="credit-modal-info" style={{ marginBottom: "16px" }}>
              Modifica la programación de este gasto recurrente.
            </p>

            <form onSubmit={handleSaveEditRecurring}>
              <div className="form-grid">
                <label className="form-wide">
                  Nombre
                  <input
                    type="text"
                    value={editRecName}
                    onChange={(e) => setEditRecName(e.target.value)}
                    required
                    disabled={savingEdit}
                  />
                </label>
                <label>
                  Monto ($)
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={editRecAmount}
                    onChange={(e) => setEditRecAmount(e.target.value)}
                    required
                    disabled={savingEdit}
                  />
                </label>
                <label>
                  Categoría
                  <select
                    value={editRecCategory}
                    onChange={(e) => setEditRecCategory(e.target.value)}
                    disabled={savingEdit}
                  >
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Frecuencia
                  <select
                    value={editRecFrequency}
                    onChange={(e) => setEditRecFrequency(e.target.value as RecurrenceFrequency)}
                    disabled={savingEdit}
                  >
                    <option value="weekly">Semanal</option>
                    <option value="monthly">Mensual</option>
                    <option value="yearly">Anual</option>
                  </select>
                </label>
                <label>
                  Próximo vencimiento
                  <input
                    type="date"
                    value={editRecDate}
                    onChange={(e) => setEditRecDate(e.target.value)}
                    required
                    disabled={savingEdit}
                  />
                </label>
              </div>

              {editError && <p className="form-error" role="alert">{editError}</p>}

              <div className="edit-product-actions" style={{ marginTop: "18px" }}>
                <AdminButton
                  tone="secondary"
                  type="button"
                  disabled={savingEdit}
                  onClick={() => setEditingRecurring(null)}
                >
                  Cancelar
                </AdminButton>
                <AdminButton type="submit" disabled={savingEdit}>
                  <Check size={15} /> {savingEdit ? "Guardando..." : "Guardar cambios"}
                </AdminButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
