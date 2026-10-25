export const money = (value: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);

export const getBogotaDate = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

export const formatBogotaDate = (date: string) => new Date(`${date}T12:00:00-05:00`)
  .toLocaleDateString("es-CO", { timeZone: "America/Bogota" });

export const getDaysUntil = (date: string) => Math.round(
  (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${getBogotaDate()}T00:00:00Z`)) / 86_400_000
);
