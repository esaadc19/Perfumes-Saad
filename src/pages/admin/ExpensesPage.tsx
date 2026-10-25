import { Trash2, Wallet } from "lucide-react";
import AdminButton from "../../components/admin/AdminButton";
import EmptyState from "../../components/admin/EmptyState";
import Pagination from "../../components/admin/Pagination";
import { formatBogotaDate, getDaysUntil, money } from "../../lib/format";
import {
  EXPENSE_CATEGORIES,
  type Expense,
  type RecurrenceFrequency,
  type RecurringExpense,
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
  expenses,
  paginatedExpenses,
  currentPage,
  pageCount,
  onPageChange,
  deletingExpenseId,
  onDeleteExpense,
  loading,
}: ExpensesPageProps) {
  return (
    <section className="admin-card">
      <div className="card-title">
        <div>
          <h2>Gastos</h2>
          <span>Registra gastos, programa recordatorios y consulta los pagos incluidos en reportes diarios y semanales.</span>
        </div>
      </div>
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
        <label>{form.recurring ? "Primer vencimiento" : "Fecha"}
          <input type="date" value={form.date} onChange={(event) => onFormChange({ ...form, date: event.target.value })} required />
        </label>
        <label className="expense-recurring-toggle">
          <span>¿Es un gasto recurrente?</span>
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
          {saving ? "Guardando..." : form.recurring ? "Crear recordatorio" : "Agregar gasto"}
        </AdminButton>
      </form>
      {form.recurring && (
        <p className="profile-notice">
          La fecha indicada será el primer vencimiento. Verás los próximos pagos aquí y el correo se enviará el día del vencimiento y cada día que siga pendiente.
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
            <div className="table-row expense-row header"><span>Nombre</span><span>Categoría</span><span className="cell-center">Monto</span><span className="cell-center">Fecha</span><span></span></div>
            {paginatedExpenses.map((expense) => (
              <div className="table-row expense-row" key={expense.id}>
                <strong>{expense.name}</strong>
                <span>{expense.category}</span>
                <span className="cell-center">{money(expense.amount)}</span>
                <span className="cell-center">{expense.expense_date}</span>
                <AdminButton
                  tone="danger"
                  variant="outline"
                  compact
                  type="button"
                  aria-label={`Eliminar gasto ${expense.name}`}
                  disabled={deletingExpenseId === expense.id}
                  onClick={() => onDeleteExpense(expense)}
                >
                  <Trash2 size={16} />
                </AdminButton>
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
    </section>
  );
}
