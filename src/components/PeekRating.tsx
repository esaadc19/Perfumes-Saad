import { useState, type CSSProperties } from "react";

type PeekRatingProps = {
  defaultValue?: number;
  count?: number;
  shape?: "star" | "heart";
  labels?: string[];
  activeColor?: string;
  idleColor?: string;
  tipColor?: string;
  tipTextColor?: string;
  size?: number;
  lift?: number;
  magnify?: number;
  riseDuration?: number;
  popScale?: number;
  showTip?: boolean;
  allowClear?: boolean;
  onChange?: (value: number) => void;
  showLabels?: boolean;
  readOnly?: boolean;
};

export default function PeekRating({
  defaultValue = 3,
  count = 5,
  shape = "star",
  labels = [],
  activeColor = "#f5b400",
  idleColor = "#52525b",
  tipColor = "#27272a",
  tipTextColor = "#f5f5f5",
  size = 40,
  lift = 8,
  magnify = 1.15,
  riseDuration = 320,
  popScale = 1.3,
  showTip = true,
  allowClear = true,
  onChange,
  showLabels = true,
  readOnly = false,
}: PeekRatingProps) {
  const safeCount = Math.max(1, Math.floor(count));
  const [rating, setRating] = useState(Math.min(safeCount, Math.max(0, defaultValue)));
  const [hoveredValue, setHoveredValue] = useState(0);
  const visibleValue = hoveredValue || rating;
  const glyph = shape === "heart" ? "♥" : "★";
  const accessibleLabel = (value: number) =>
    labels[value - 1] ? `${value} de ${safeCount}: ${labels[value - 1]}` : `${value} de ${safeCount}`;

  const chooseRating = (value: number) => {
    if (readOnly) return;
    const nextRating = allowClear && value === rating ? 0 : value;
    setRating(nextRating);
    setHoveredValue(0);
    onChange?.(nextRating);
  };

  return (
    <div
      className={`peek-rating${readOnly ? " is-read-only" : ""}`}
      role="group"
      aria-label="Calificación del producto"
      onMouseLeave={() => setHoveredValue(0)}
      style={{
        "--rating-active": activeColor,
        "--rating-idle": idleColor,
        "--rating-tip": tipColor,
        "--rating-tip-text": tipTextColor,
        "--rating-size": `${size}px`,
        "--rating-lift": `${lift}px`,
        "--rating-magnify": magnify,
        "--rating-duration": `${riseDuration}ms`,
        "--rating-pop": popScale,
      } as CSSProperties}
    >
      <div className="peek-rating-stars">
        {Array.from({ length: safeCount }, (_, index) => {
          const value = index + 1;
          const active = value <= visibleValue;
          const label = labels[value - 1];

          return (
            <button
              key={value}
              type="button"
              className={`peek-rating-star${active ? " is-active" : ""}${hoveredValue === value ? " is-peeked" : ""}`}
              aria-label={accessibleLabel(value)}
              aria-pressed={rating === value}
              disabled={readOnly}
              onMouseEnter={() => setHoveredValue(value)}
              onFocus={() => setHoveredValue(value)}
              onBlur={() => setHoveredValue(0)}
              onClick={() => chooseRating(value)}
            >
              {glyph}
              {showTip && hoveredValue === value && label && (
                <span className="peek-rating-tip" role="tooltip">{label}</span>
              )}
            </button>
          );
        })}
      </div>
      {showLabels && (
        <span className="peek-rating-label" aria-live="polite">
          {visibleValue > 0 ? labels[visibleValue - 1] ?? `${visibleValue} de ${safeCount}` : "Sin calificación"}
        </span>
      )}
    </div>
  );
}
