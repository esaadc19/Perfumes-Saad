import { TrendingDown, TrendingUp, Minus } from "lucide-react";

/**
 * Variación de un número contra el periodo anterior.
 *
 * Un monto sin contexto es difícil de actuar: "$1.510.000" no dice si
 * fue un buen mes o uno malo. La flecha y el porcentaje responden eso.
 */
export default function Delta({
  current,
  previous,
  format = "percent",
}: {
  current: number;
  previous: number;
  /** "percent" para montos, "points" para porcentajes (margen). */
  format?: "percent" | "points";
}) {
  // Sin base de comparación no hay delta que mostrar: invention sería.
  if (!Number.isFinite(previous) || previous === 0) return null;

  const diff = current - previous;
  const pct = (diff / Math.abs(previous)) * 100;
  const rounded = Math.abs(pct) < 0.1 ? 0 : pct;

  const up = diff > 0;
  const flat = rounded === 0;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  const tone = flat ? "flat" : up ? "up" : "down";
  const magnitude = format === "points"
    ? `${Math.abs(rounded).toFixed(1)} pts`
    : `${Math.abs(rounded).toFixed(1)}%`;

  return (
    <span className={`metric-delta is-${tone}`}>
      <Icon size={12} aria-hidden="true" />
      {flat ? "sin cambio" : `${magnitude} vs. periodo anterior`}
    </span>
  );
}