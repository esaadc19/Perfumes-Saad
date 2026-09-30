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

export async function createExpense(expense: NewExpense): Promise<void> {
  if (!supabase) throw new Error("Supabase no está configurado.");

  const { error } = await supabase.from("expenses").insert({
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
