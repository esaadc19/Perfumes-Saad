import type { ReactNode } from "react";
import Delta from "./Delta";

export default function Metric({
  title,
  value,
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
      <span>{title}</span>
      <strong>{value}</strong>
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