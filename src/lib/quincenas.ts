/**
 * Utilidades para el manejo de cobro por quincenas en Colombia (15 y último día de mes).
 * Sigue el esquema 50/50 de Perfumes SAAD: Cuota inicial al recibir, saldo en la siguiente quincena.
 */

export interface QuincenaOption {
  key: string;
  label: string;
  dateStr: string; // YYYY-MM-DD
  isNext: boolean;
}

export function getUpcomingQuincenas(referenceDate = new Date(), count = 4): QuincenaOption[] {
  // Convertir a zona horaria de Bogotá (America/Bogota)
  const bogotaStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(referenceDate);

  const [year, month, day] = bogotaStr.split("-").map(Number);
  const options: QuincenaOption[] = [];

  let currentYear = year;
  let currentMonth = month;
  // Si estamos en o antes del día 15, la primera quincena es el 15 de este mes.
  // Si ya pasó el día 15, la primera es el fin de este mes.
  let isMidMonth = day <= 15;

  const monthNames = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
  ];

  for (let i = 0; i < count; i++) {
    const lastDayOfMonth = new Date(currentYear, currentMonth, 0).getDate();
    const targetDay = isMidMonth ? 15 : lastDayOfMonth;
    const yStr = String(currentYear);
    const mStr = String(currentMonth).padStart(2, "0");
    const dStr = String(targetDay).padStart(2, "0");
    const dateStr = `${yStr}-${mStr}-${dStr}`;

    const monthName = monthNames[currentMonth - 1];
    const shortLabel = isMidMonth
      ? `15 de ${monthName}`
      : `Fin de mes (${targetDay} de ${monthName})`;

    options.push({
      key: dateStr,
      label: shortLabel,
      dateStr,
      isNext: i === 0,
    });

    if (isMidMonth) {
      isMidMonth = false;
    } else {
      isMidMonth = true;
      currentMonth += 1;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear += 1;
      }
    }
  }

  return options;
}

export function formatDueDateColombian(dateStr: string | null | undefined): {
  formatted: string;
  daysDiff: number | null;
  relativeLabel: string;
  isOverdue: boolean;
  isSoon: boolean;
} {
  if (!dateStr) {
    return {
      formatted: "Sin fecha",
      daysDiff: null,
      relativeLabel: "Sin fecha asignada",
      isOverdue: false,
      isSoon: false,
    };
  }

  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) {
    return {
      formatted: "Fecha inválida",
      daysDiff: null,
      relativeLabel: "Fecha inválida",
      isOverdue: false,
      isSoon: false,
    };
  }

  const target = new Date(y, m - 1, d);

  const bogotaStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [ty, tm, td] = bogotaStr.split("-").map(Number);
  const today = new Date(ty, tm - 1, td);

  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  const monthShort = [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
  ][m - 1];

  const formatted = `${d} ${monthShort} ${y}`;

  let relativeLabel = "";
  let isOverdue = false;
  let isSoon = false;

  if (diffDays < 0) {
    isOverdue = true;
    relativeLabel = `Venció hace ${Math.abs(diffDays)} ${Math.abs(diffDays) === 1 ? "día" : "días"}`;
  } else if (diffDays === 0) {
    isSoon = true;
    relativeLabel = "Vence hoy";
  } else if (diffDays === 1) {
    isSoon = true;
    relativeLabel = "Vence mañana";
  } else if (diffDays <= 5) {
    isSoon = true;
    relativeLabel = `Vence en ${diffDays} días`;
  } else {
    relativeLabel = `En ${diffDays} días`;
  }

  return { formatted, daysDiff: diffDays, relativeLabel, isOverdue, isSoon };
}
