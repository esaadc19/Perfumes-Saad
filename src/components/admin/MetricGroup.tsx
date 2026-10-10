import type { ReactNode } from "react";
import Metric from "./Metric";

/**
 * Grupo de métricas con título y una línea que explica qué contesta.
 *
 * Antes todas las tarjetas iban sueltas en cinco rejillas de cuatro: una
 * persona nueva no tenía forma de saber si "Total vendido" era lo mismo
 * que "Clientes registrados". El título y la pista hacen explícito el
 * dominio de cada número.
 */
export default function MetricGroup({
  title,
  hint,
  icon,
  wide,
  children,
}: {
  title: string;
  hint: string;
  icon: ReactNode;
  /** Grupo a todo el ancho, con más columnas: lo usa Ventas. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`metric-group${wide ? " metric-group--wide" : ""}`}>
      <div className="metric-group-head">
        <span className="metric-group-icon">{icon}</span>
        <div>
          <h3>{title}</h3>
          <p>{hint}</p>
        </div>
      </div>
      <div className="metrics">{children}</div>
    </section>
  );
}

export { Metric };