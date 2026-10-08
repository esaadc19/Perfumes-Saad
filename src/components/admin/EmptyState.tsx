import type { ReactNode } from "react";
import { PackageOpen } from "lucide-react";

type Tone = "neutral" | "danger";

/**
 * Estado vacío unificado para todas las tablas del admin.
 * Antes cada pantalla repetía `<p className="insight">`, lo que dejaba
 * el mismo mensaje con cincoigns estilos distintos.
 */
export default function EmptyState({
  title,
  hint,
  tone = "neutral",
  icon,
  action,
}: {
  title: string;
  hint?: string;
  tone?: Tone;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`empty-state${tone === "danger" ? " is-danger" : ""}`} role="status">
      <span className="empty-state-icon">{icon ?? <PackageOpen size={26} />}</span>
      <strong>{title}</strong>
      {hint && <span>{hint}</span>}
      {action}
    </div>
  );
}