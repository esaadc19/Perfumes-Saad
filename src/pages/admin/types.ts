import type { RecurrenceFrequency } from "../../services/expenses";

export interface ReportResult {
  whatsappUrl: string;
  emailSent: boolean;
  emailError: string | null;
  label: string;
}

export interface ExpenseFormState {
  name: string;
  amount: string;
  category: string;
  date: string;
  payment_method?: string;
  recurring: boolean;
  frequency: RecurrenceFrequency;
}

export interface AdvisorFormState {
  full_name: string;
  phone: string;
  email: string;
}

export interface ProductPriceFilterState {
  costMin: string;
  costMax: string;
  priceMin: string;
  priceMax: string;
}

export type ProductStockFilter = "all" | "available" | "sold-out";
