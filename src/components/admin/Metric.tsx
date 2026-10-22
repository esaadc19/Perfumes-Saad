import type { ReactNode } from "react";
import CountUp from "./CountUp";
import Delta from "./Delta";

export default function Metric({
  title,
  value,
  numericValue,
  format = "int",
  icon,
  warning,
  emphasis,
  hint,
  /** Variación contra el periodo anterior. Omitir si no aplica. */
  delta,
  deltaFormat,
  onClick,
}: {
  title: string;
  value: string;
  /**
   * El número crudo, para que la tarjeta lo cuente desde 0 hasta su valor.
   * Sin esto se muestra `value` tal cual, como siempre.
   */
  numericValue?: number;
  /** Cómo se cuenta `numericValue`. */
  format?: "money" | "int" | "percent";
  icon: ReactNode;
  warning?: boolean;
  /** Resalta la tarjeta como el resultado principal de su grupo. */
  emphasis?: boolean;
  /** Una línea que explica el número, para cuando no es obvio. */
  hint?: string;
  delta?: { current: number; previous: number };
  deltaFormat?: "percent" | "points";
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className={warning ? "metric-icon warning" : "metric-icon"}>{icon}</span>
      <span className="metric-label">{title}</span>
      <strong>{numericValue === undefined ? value : <CountUp value={numericValue} format={format} />}</strong>
      {delta && (
        <Delta current={delta.current} previous={delta.previous} format={deltaFormat} />
      )}
      {hint && <small className="metric-note">{hint}</small>}
      {onClick && <small className="metric-hint">Ver detalle</small>}
    </>
  );

  const className = ["metric", emphasis ? "is-emphasis" : null, onClick ? "metric-action" : null]
    .filter(Boolean)
    .join(" ");

  return onClick ? (
    <button className={className} onClick={onClick}>{content}</button>
  ) : (
    <div className={className}>{content}</div>
  );
}
