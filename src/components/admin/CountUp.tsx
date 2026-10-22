import { useEffect, useRef, useState } from "react";

type Format = "money" | "int" | "percent";

/** El formateador se crea una vez: en cada cuadro se invoca 60 veces. */
const moneyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const formatters: Record<Format, (value: number) => string> = {
  money: (value) => moneyFormatter.format(value),
  int: (value) => String(Math.round(value)),
  percent: (value) => `${Number(value.toFixed(1))}%`,
};

const prefersReducedMotion = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * El número cuenta desde 0 hasta su valor, una sola vez, cuando la tarjeta
 * entra en pantalla. Si el dato cambia después (otro periodo del panel) se
 * cuenta hasta el nuevo en vez de saltar.
 *
 * Con "prefers-reduced-motion" activo no se anima: aparece el valor final,
 * que es lo que pide el sistema y lo que exige la accesibilidad.
 */
export default function CountUp({
  value,
  format = "int",
}: {
  value: number;
  format?: Format;
}) {
  const target = Number.isFinite(value) ? value : 0;
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? target : 0));
  const spanRef = useRef<HTMLSpanElement | null>(null);
  /** El valor que se está mostrando ahora, para poder redirigir el vuelo. */
  const shownRef = useRef(shown);
  const frameRef = useRef(0);
  const startedRef = useRef(false);

  const animate = (from: number, to: number) => {
    cancelAnimationFrame(frameRef.current);
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / 1100);
      // easeOutCubic: arranca rapido y aterriza suave.
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (to - from) * eased;
      shownRef.current = current;
      setShown(current);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        shownRef.current = to;
        setShown(to);
      }
    };
    frameRef.current = requestAnimationFrame(step);
  };

  // La primera cuenta empieza al entrar en pantalla. Sin IntersectionObserver
  // (navegadores viejos) se cuenta igual, sin esperar.
  useEffect(() => {
    if (prefersReducedMotion()) {
      startedRef.current = true;
      shownRef.current = target;
      setShown(target);
      return;
    }
    const node = spanRef.current;
    if (!node || typeof IntersectionObserver !== "function") {
      startedRef.current = true;
      animate(0, target);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        startedRef.current = true;
        observer.disconnect();
        animate(0, target);
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frameRef.current);
    };
    // Solo al montar: el observer se crea una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si el valor cambia despues de arrancar (cambio de periodo, recarga),
  // el conteo se redirige desde donde esta hasta el numero nuevo.
  useEffect(() => {
    if (!startedRef.current) return;
    if (prefersReducedMotion()) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    animate(shownRef.current, target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return <span ref={spanRef}>{formatters[format](shown)}</span>;
}
