/**
 * Periodos del reporte.
 *
 * El reporte solo sabia de una semana y el nombre "semanal"
 * quedaba pegado en cada etiqueta, incluso cuando el rango era un mes.
 * Aqui se resuelve el rango una vez y se devuelve tambien una etiqueta
 * legible, para que el correo y la pantalla digan lo mismo.
 *
 * Todo se calcula en hora de Bogotá (UTC-5), no en la del navegador: un
 * cliente en el exterior tiene que ver las mismas fechas que el negocio.
 */

export type PeriodPresetId =
  | "last-week"
  | "current-month"
  | "last-month"
  | "last-30"
  | "current-quarter"
  | "year";

export interface DateRange {
  /** Inclusive. Formato AAAA-MM-DD. */
  from: string;
  /** Inclusive: el último día del rango. */
  to: string;
}

export interface ReportPeriod extends DateRange {
  id: PeriodPresetId | "custom";
  label: string;
}

const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;

/** Fecha de hoy en Bogotá, como AAAA-MM-DD. */
export function getBogotaDate(): string {
  return new Date(Date.now() + BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Convierte AAAA-MM-DD a Date en UTC mediodia, para evitar corimientos. */
function fromIso(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function addDays(iso: string, days: number): string {
  const date = fromIso(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

function addMonths(iso: string, months: number): string {
  const date = fromIso(iso);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  // Si el mes destino es más corto (31 de enero + 1 mes), se queda en el
  // último día válido en vez de saltar al mes siguiente.
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return toIso(date);
}

/** Primer día del mes. */
function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function startOfYear(iso: string): string {
  return `${iso.slice(0, 4)}-01-01`;
}

/** Trimestre calendario: enero-abril-julio-octubre. */
function startOfQuarter(iso: string): string {
  const month = Number(iso.slice(5, 7));
  const firstMonth = Math.floor((month - 1) / 3) * 3 + 1;
  return `${iso.slice(0, 4)}-${String(firstMonth).padStart(2, "0")}-01`;
}

/** Lunes de la semana de `iso`. */
function startOfWeek(iso: string): string {
  const date = fromIso(iso);
  const weekday = date.getUTCDay(); // 0 domingo
  const offset = weekday === 0 ? -6 : 1 - weekday;
  date.setUTCDate(date.getUTCDate() + offset);
  return toIso(date);
}

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "2026-03-01" → "1 de marzo". */
function readableDate(iso: string): string {
  const date = fromIso(iso);
  return `${date.getUTCDate()} de ${MONTH_NAMES[date.getUTCMonth()]}`;
}

/** "2026-03-01" → "marzo 2026". */
function readableMonth(iso: string): string {
  return `${MONTH_NAMES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

/**
 * Resuelve el rango de un preset. `today` se recibe como parámetro para no
 * depender del reloj en pruebas ni en renderizados repetidos.
 */
export function resolvePeriod(id: PeriodPresetId, today: string = getBogotaDate()): ReportPeriod {
  switch (id) {
    case "last-week": {
      // Semana completa anterior: termina el domingo que precede al lunes.
      const thisMonday = startOfWeek(today);
      return {
        id,
        from: addDays(thisMonday, -7),
        to: addDays(thisMonday, -1),
        label: "Semana pasada",
      };
    }
    case "current-month":
      return { id, from: startOfMonth(today), to: today, label: "Mes actual" };
    case "last-month": {
      const previousMonthStart = addMonths(startOfMonth(today), -1);
      return {
        id,
        from: previousMonthStart,
        // El día anterior al 1º del mes actual es el último del anterior.
        to: addDays(startOfMonth(today), -1),
        label: `Mes pasado (${readableMonth(previousMonthStart)})`,
      };
    }
    case "last-30":
      return { id, from: addDays(today, -29), to: today, label: "Últimos 30 días" };
    case "current-quarter":
      return { id, from: startOfQuarter(today), to: today, label: "Trimestre actual" };
    case "year":
      return { id, from: startOfYear(today), to: today, label: "Este año" };
  }
}

export const PERIOD_PRESETS: Array<{ id: PeriodPresetId; label: string }> = [
  { id: "last-week", label: "Semana pasada" },
  { id: "current-month", label: "Mes actual" },
  { id: "last-month", label: "Mes pasado" },
  { id: "last-30", label: "Últimos 30 días" },
  { id: "current-quarter", label: "Trimestre actual" },
  { id: "year", label: "Este año" },
];

/**
 * Convierte el rango a los argumentos de la RPC. El rango es
 * [from, to) en SQL: para cubrir el día final hay que pasar `to + 1 día`.
 */
export function toRpcArgs(period: ReportPeriod): { p_from: string; p_to: string } {
  return { p_from: period.from, p_to: addDays(period.to, 1) };
}

/** Valida un rango escrito a mano. Devuelve el error o null si está bien. */
export function validateRange(from: string, to: string, today: string = getBogotaDate()): string | null {
  if (!from || !to) return "Elige las dos fechas.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return "Las fechas no tienen el formato correcto.";
  }
  if (from > to) return "La fecha inicial no puede ser posterior a la final.";
  if (from > today) return "No se puede generar un reporte de una fecha futura.";
  return null;
}

/** Rango escrito a mano, listo para enviar. */
export function customPeriod(from: string, to: string): ReportPeriod {
  return {
    id: "custom",
    from,
    to,
    label: `Del ${readableDate(from)} al ${readableDate(to)}`,
  };
}