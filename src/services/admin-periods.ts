/**
 * Utilidades para manejo de períodos en el Dashboard y Finanzas.
 *
 * Soporta los filtros:
 * - "semana": Últimos 7 días
 * - "mes": Últimos 30 días
 * - "ano": Últimos 365 días / año en curso
 * - "rango": Rango personalizado con fecha de inicio y fin
 *
 * Todas las fechas se calculan en zona horaria de Colombia (Bogotá UTC-5).
 */

export type PeriodPreset = "semana" | "mes" | "ano" | "rango";

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

  if (preset === "mes") {
    const from = addDaysIso(today, -29);
    return {
      preset,
      from,
      to: today,
      days: 30,
      isAllTime: false,
      label: `Últimos 30 días (${formatShortDate(from)} – ${formatShortDate(today)})`,
    };
  }

  if (preset === "ano") {
    const from = addDaysIso(today, -364);
    return {
      preset,
      from,
      to: today,
      days: 365,
      isAllTime: false,
      label: `Últimos 365 días (${formatShortDate(from, true)} – ${formatShortDate(today, true)})`,
    };
  }

  // Rango personalizado
  const from = customFrom || addDaysIso(today, -29);
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
