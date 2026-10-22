import { useEffect, useRef, useState } from "react";

type Format = "money" | "int" | "percent";

// The formatters are built once: each frame calls them 60 times a second.
const moneyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});
// Same rules as `percent()` in services/dashboard.ts: es-CO uses a comma.
const percentFormatter = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const formatters: Record<Format, (value: number) => string> = {
  money: (value) => moneyFormatter.format(value),
  int: (value) => String(Math.round(value)),
  percent: (value) => `${percentFormatter.format(value)}%`,
};

const prefersReducedMotion = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The figure counts up from 0 to its value, once, when the card enters the
 * viewport. If the data changes later (another range filter) the count is
 * retargeted from where it is instead of jumping.
 *
 * With "prefers-reduced-motion" on, nothing animates: the final value shows
 * immediately, which is what the OS asks for and what accessibility needs.
 */
export default function CountUp({ value, format = "int" }: { value: number; format?: Format }) {
  const target = Number.isFinite(value) ? value : 0;
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? target : 0));
  const spanRef = useRef<HTMLSpanElement | null>(null);
  // The value currently on screen, so a retarget starts from it.
  const shownRef = useRef(shown);
  const frameRef = useRef(0);
  const startedRef = useRef(false);

  const animate = (from: number, to: number) => {
    cancelAnimationFrame(frameRef.current);
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / 1100);
      // easeOutCubic: fast start, soft landing.
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

  // The first count starts when the card scrolls into view. Without
  // IntersectionObserver it counts right away instead of never.
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
    // Mount only: the observer is created once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A later change (new range) is counted from the current number, not jumped.
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
