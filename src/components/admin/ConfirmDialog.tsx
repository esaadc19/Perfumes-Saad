import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import AdminButton from "./AdminButton";

/**
 * Confirmación de una acción que no se puede deshacer.
 *
 * Existe porque `window.confirm()` está prohibido en
 * `.agents/ux-experience.agents.md`, y no por purismo: los botones del
 * diálogo son nativos del sistema operativo, se ven distintos en cada
 * navegador, no se pueden estilizar y en móvil tapan la pantalla sin
 * poder cerrarse con Escape.
 *
 * Atrapa el foco mientras está abierto y lo devuelve al elemento que lo
 * tenía, para que alguien que navega solo con teclado no quede encerrado.
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Eliminar",
  onConfirm,
  onCancel,
  busy = false,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Guardado para devolver el foco al botón que abrió el diálogo.
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busy) onCancel();
        return;
      }
      if (event.key !== "Tab") return;

      // Mantiene el foco dentro del diálogo: si se escapara, alguien que
      // navega con Tab seguiría operating sobre la página de fondo.
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus.current?.focus();
    };
  }, [busy, onCancel]);

  // `.overlay` es la clase de fondo que ya usan los demas modales del
  // proyecto. `.modal-overlay` no existia: el dialogo salia pegado en la
  // esquina, sin fondo y por detras del menu lateral.
  return (
    <div className="overlay" role="presentation" onClick={() => !busy && onCancel()}>
      <div
        ref={dialogRef}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="confirm-title">
          <AlertTriangle size={18} /> {title}
        </h3>
        <p id="confirm-message">{message}</p>
        <div className="confirm-dialog-actions">
          <AdminButton
            tone="secondary"
            compact
            type="button"
            ref={cancelRef}
            onClick={onCancel}
            disabled={busy}
          >
            Cancelar
          </AdminButton>
          <AdminButton tone="danger" compact type="button" onClick={onConfirm} disabled={busy}>
            {busy ? "Eliminando…" : confirmLabel}
          </AdminButton>
        </div>
      </div>
    </div>
  );
}