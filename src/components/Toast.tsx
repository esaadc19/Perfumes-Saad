import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

export type ToastKind = "success" | "error" | "info";

type Toast = {
  id: number;
  kind: ToastKind;
  message: string;
};

const TOAST_DURATION = 4200;

const ICONS: Record<ToastKind, typeof Info> = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const notify = useCallback((kind: ToastKind, message: string) => {
    const id = nextId.current++;
    setToasts((current) => [...current.slice(-3), { id, kind, message }]);
    timers.current.set(id, setTimeout(() => dismiss(id), TOAST_DURATION));
  }, [dismiss]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  return {
    toasts,
    dismiss,
    notify,
    notifySuccess: useCallback((message: string) => notify("success", message), [notify]),
    notifyError: useCallback((message: string) => notify("error", message), [notify]),
    notifyInfo: useCallback((message: string) => notify("info", message), [notify]),
  };
}

export function Toaster({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="toast-stack" role="region" aria-label="Notificaciones">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.kind];
        return (
          <div className={`toast toast-${toast.kind}`} role="status" key={toast.id}>
            <Icon size={17} aria-hidden="true" />
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Cerrar notificación"
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
