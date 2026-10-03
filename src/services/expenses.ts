import { supabase } from "../lib/supabase";

export interface Expense {
  id: string;
  name: string;
  amount: number;
  category: string;
  expense_date: string;
  created_at: string;
}

export interface NewExpense {
  name: string;
  amount: number;
  category: string;
  expense_date: string;
  recurrence_frequency?: RecurrenceFrequency | null;
}

export type RecurrenceFrequency = "weekly" | "monthly" | "yearly";

export interface RecurringExpense {
  id: string;
  name: string;
  amount: number;
  category: string;
  frequency: RecurrenceFrequency;
  next_due_date: string;
}

export async function getExpenses(): Promise<Expense[]> {
  if (!supabase) throw new Error("Supabase no está configurado.");

  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .order("expense_date", { ascending: false });

  if (error) {
    console.error("Error cargando gastos:", error);
    throw error;
  }

  return data ?? [];
}

export async function getRecurringExpenses(): Promise<RecurringExpense[]> {
  if (!supabase) throw new Error("Supabase no está configurado.");

  const { data, error } = await supabase
    .from("recurring_expenses")
    .select("id, name, amount, category, frequency, next_due_date")
    .eq("active", true)
    .order("next_due_date", { ascending: true });

  if (error) {
    console.error("Error cargando los gastos recurrentes:", error);
    throw error;
  }

  return (data ?? []).map((expense) => ({
    ...expense,
    amount: Number(expense.amount),
  })) as RecurringExpense[];
}

export async function createExpense(expense: NewExpense): Promise<void> {
  if (!supabase) throw new Error("Supabase no está configurado.");

  const { error } = expense.recurrence_frequency
    ? await supabase.from("recurring_expenses").insert({
        name: expense.name,
        amount: expense.amount,
        category: expense.category,
        frequency: expense.recurrence_frequency,
        next_due_date: expense.expense_date,
      })
    : await supabase.from("expenses").insert({
        name: expense.name,
        amount: expense.amount,
        category: expense.category,
        expense_date: expense.expense_date,
      });

  if (error) {
    console.error("Error creando gasto:", error);
    throw error;
  }
}

export async function markRecurringExpensePaid(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase no está configurado.");

  const { error } = await supabase.rpc("admin_pay_recurring_expense", {
    target_expense_id: id,
  });

  if (error) {
    console.error("No se pudo registrar el pago recurrente:", error);
    throw error;
  }
}

export async function deleteRecurringExpense(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase no está configurado.");

  const { error } = await supabase.from("recurring_expenses").delete().eq("id", id);

  if (error) {
    console.error("No se pudo eliminar el gasto recurrente:", error);
    throw error;
  }
}

export async function deleteExpense(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase no está configurado.");

  const { error } = await supabase.from("expenses").delete().eq("id", id);

  if (error) {
    console.error("Error eliminando gasto:", error);
    throw error;
  }
}

export const EXPENSE_CATEGORIES = [
  "General",
  "Alquiler",
  "Servicios",
  "Marketing",
  "Transporte",
  "Insumos",
  "Nómina",
  "Otros",
];
