import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Bloque "Requiere atención".
 *
 * Solo se pinta si hay al menos una alerta con valor mayor que cero. Antes
 * estas tarjetas vivían mezcladas entre métricas informativas —"stock bajo"
 * era la cuarta de dieciocho—, y las que estaban en cero ocupaban el mismo
 * espacio con tono de alarma.
 */
export default function AlertBlock({ items }: { items: ReactNode[] }) {
  const visible = items.filter(Boolean);
  if (visible.length === 0) return null;

  return (
    <section className="alert-block" aria-labelledby="alert-block-title">
      <div className="alert-block-head">
        <AlertTriangle size={17} />
        <div>
          <h3 id="alert-block-title">Requiere atención</h3>
          <p>Estos son los pendientes que necesitan una acción tuya.</p>
        </div>
      </div>
      <div className="alert-block-items">{visible}</div>
    </section>
  );
}