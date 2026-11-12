import { supabase } from "../lib/supabase";

export interface Expense {
  id: string;
  name: string;
  amount: number;
  category: string;
  expense_date: string;
  payment_method?: string;
  created_at: string;
}

export interface NewExpense {
  name: string;
  amount: number;
  category: string;
  expense_date: string;
  payment_method?: string;
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

  if (expense.recurrence_frequency) {
    // 1. Registrar el pago realizado en los gastos operativos del periodo
    const { error: expError } = await supabase.from("expenses").insert({
      name: expense.name,
      amount: expense.amount,
      category: expense.category,
      expense_date: expense.expense_date,
      payment_method: expense.payment_method || "efectivo",
    });

    if (expError) {
      console.error("Error creando gasto inicial:", expError);
      throw expError;
    }

    // 2. Calcular la próxima fecha de vencimiento según la periodicidad
    const [year, month, day] = expense.expense_date.split("-").map(Number);
    const dateObj = new Date(year, month - 1, day);
    if (expense.recurrence_frequency === "weekly") {
      dateObj.setDate(dateObj.getDate() + 7);
    } else if (expense.recurrence_frequency === "yearly") {
      dateObj.setFullYear(dateObj.getFullYear() + 1);
    } else {
      dateObj.setMonth(dateObj.getMonth() + 1);
    }
    const nextDue = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(dateObj.getDate()).padStart(2, "0")}`;

    // 3. Crear el recordatorio recurrente para el próximo ciclo
    const { error: recError } = await supabase.from("recurring_expenses").insert({
      name: expense.name,
      amount: expense.amount,
      category: expense.category,
      frequency: expense.recurrence_frequency,
      next_due_date: nextDue,
      payment_method: expense.payment_method || "efectivo",
    });

    if (recError) {
      console.error("Error programando gasto recurrente:", recError);
      throw recError;
    }
  } else {
    const { error } = await supabase.from("expenses").insert({
      name: expense.name,
      amount: expense.amount,
      category: expense.category,
      expense_date: expense.expense_date,
      payment_method: expense.payment_method || "efectivo",
    });

    if (error) {
      console.error("Error creando gasto:", error);
      throw error;
    }
  }
}

export interface UpdateExpenseInput {
  name: string;
  amount: number;
  category: string;
  expense_date: string;
  payment_method?: string;
}

export async function updateExpense(
  id: string,
  input: UpdateExpenseInput
): Promise<void> {
  if (!supabase) throw new Error("Supabase no está configurado.");

  const { error } = await supabase
    .from("expenses")
    .update({
      name: input.name,
      amount: input.amount,
      category: input.category,
      expense_date: input.expense_date,
      payment_method: input.payment_method || "efectivo",
    })
    .eq("id", id);

  if (error) {
    console.error("Error actualizando gasto:", error);
    throw error;
  }
}

export interface UpdateRecurringExpenseInput {
  name: string;
  amount: number;
  category: string;
  frequency: RecurrenceFrequency;
  next_due_date: string;
  payment_method?: string;
}

export async function updateRecurringExpense(
  id: string,
  input: UpdateRecurringExpenseInput
): Promise<void> {
  if (!supabase) throw new Error("Supabase no está configurado.");

  const { error } = await supabase
    .from("recurring_expenses")
    .update({
      name: input.name,
      amount: input.amount,
      category: input.category,
      frequency: input.frequency,
      next_due_date: input.next_due_date,
      payment_method: input.payment_method || "efectivo",
    })
    .eq("id", id);

  if (error) {
    console.error("Error actualizando gasto recurrente:", error);
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
  "Gastos Fijos",
  "Servicios",
  "Marketing",
  "General",
  "Alquiler",
  "Transporte",
  "Insumos",
  "Nómina",
  "Otros",
];
