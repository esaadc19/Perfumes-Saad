/**
 * Utilidades para manejo de períodos en el Dashboard y Finanzas.
 *
 * Soporta los filtros:
 * - "semana": Últimos 7 días desde el día que se consulta
 * - "mes": Mes que está cursando (1º del mes en curso hasta hoy)
 * - "mes_pasado": Mes calendario anterior completo
 * - "ano": Año en curso (1º de enero hasta hoy)
 * - "rango": Rango personalizado con fecha de inicio y fin (y todo el historial)
 *
 * Todas las fechas se calculan en zona horaria de Colombia (Bogotá UTC-5).
 */

export type PeriodPreset = "semana" | "mes" | "mes_pasado" | "ano" | "rango";

export interface PeriodFilterValue {
  preset: PeriodPreset;
  from: string | null;
  to: string | null;
  days: number | null;
  isAllTime: boolean;
  label: string;
}

const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;

/** Fecha de hoy en Bogotá en formato AAAA-MM-DD. */
export function getBogotaDate(): string {
  return new Date(Date.now() + BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Convierte AAAA-MM-DD a Date a mediodía UTC para evitar desfases de huso. */
function fromIso(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Suma o resta días a una fecha AAAA-MM-DD. */
export function addDaysIso(iso: string, days: number): string {
  const date = fromIso(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

/** Primer día del mes de una fecha AAAA-MM-DD. */
export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Primer día del año de una fecha AAAA-MM-DD. */
export function startOfYear(iso: string): string {
  return `${iso.slice(0, 4)}-01-01`;
}

/** Obtiene el rango del mes anterior completo (AAAA-MM-DD). */
export function getLastMonthRange(today: string = getBogotaDate()): { from: string; to: string } {
  const curYear = parseInt(today.slice(0, 4), 10);
  const curMonth = parseInt(today.slice(5, 7), 10);
  const prevYear = curMonth === 1 ? curYear - 1 : curYear;
  const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
  const prevMonthStr = String(prevMonth).padStart(2, "0");
  const from = `${prevYear}-${prevMonthStr}-01`;
  const lastDayNum = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
  const to = `${prevYear}-${prevMonthStr}-${String(lastDayNum).padStart(2, "0")}`;
  return { from, to };
}

/** Calcula la diferencia en días entre dos fechas (inclusivo). */
export function countDaysBetween(fromIsoStr: string, toIsoStr: string): number {
  if (!fromIsoStr || !toIsoStr) return 0;
  const d1 = fromIso(fromIsoStr).getTime();
  const d2 = fromIso(toIsoStr).getTime();
  const diff = Math.round((d2 - d1) / (24 * 60 * 60 * 1000)) + 1;
  return Math.max(1, diff);
}

const MONTH_NAMES_SHORT = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic"
];

const MONTH_NAMES_FULL = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
];

/** Nombre completo del mes a partir de AAAA-MM-DD. */
export function formatMonthName(iso: string): string {
  if (!iso) return "";
  const monthIdx = parseInt(iso.slice(5, 7), 10) - 1;
  return MONTH_NAMES_FULL[monthIdx] || "";
}

/** Formatea una fecha como "1 oct" o "1 oct 2026". */
export function formatShortDate(iso: string, includeYear = false): string {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const day = parseInt(parts[2], 10);
  const monthIdx = parseInt(parts[1], 10) - 1;
  const monthStr = MONTH_NAMES_SHORT[monthIdx] ?? "";
  if (includeYear) {
    return `${day} ${monthStr} ${parts[0]}`;
  }
  return `${day} ${monthStr}`;
}

/** Resuelve las fechas y etiqueta según el preset seleccionado. */
export function resolvePeriodFilter(
  preset: PeriodPreset,
  customFrom?: string | null,
  customTo?: string | null,
  isAllTime = false,
  today: string = getBogotaDate()
): PeriodFilterValue {
  if (isAllTime) {
    return {
      preset: "rango",
      from: null,
      to: null,
      days: null,
      isAllTime: true,
      label: "Todo el historial acumulado",
    };
  }

  // 1. Semana: Últimos 7 días desde el día en que se coloca
  if (preset === "semana") {
    const from = addDaysIso(today, -6);
    return {
      preset,
      from,
      to: today,
      days: 7,
      isAllTime: false,
      label: `Últimos 7 días (${formatShortDate(from)} – ${formatShortDate(today)})`,
    };
  }

  // 2. Mes: Mes que está cursando (1º del mes hasta hoy)
  if (preset === "mes") {
    const from = startOfMonth(today);
    const days = countDaysBetween(from, today);
    const monthName = formatMonthName(today);
    return {
      preset,
      from,
      to: today,
      days,
      isAllTime: false,
      label: `Mes en curso (${monthName}: ${formatShortDate(from)} – ${formatShortDate(today)})`,
    };
  }

  // 3. Mes pasado: Mes calendario anterior completo
  if (preset === "mes_pasado") {
    const { from, to } = getLastMonthRange(today);
    const days = countDaysBetween(from, to);
    const monthName = formatMonthName(from);
    return {
      preset,
      from,
      to,
      days,
      isAllTime: false,
      label: `Mes pasado (${monthName}: ${formatShortDate(from, true)} – ${formatShortDate(to, true)})`,
    };
  }

  // 4. Año: Año en curso (1º de enero hasta hoy)
  if (preset === "ano") {
    const from = startOfYear(today);
    const days = countDaysBetween(from, today);
    return {
      preset,
      from,
      to: today,
      days,
      isAllTime: false,
      label: `Año en curso (${today.slice(0, 4)}: ${formatShortDate(from, true)} – ${formatShortDate(today, true)})`,
    };
  }

  // 5. Rango personalizado (deja el rango como está)
  const from = customFrom || startOfMonth(today);
  const to = customTo || today;
  const days = countDaysBetween(from, to);

  return {
    preset: "rango",
    from,
    to,
    days,
    isAllTime: false,
    label: `Del ${formatShortDate(from, true)} al ${formatShortDate(to, true)} (${days} ${days === 1 ? "día" : "días"})`,
  };
}