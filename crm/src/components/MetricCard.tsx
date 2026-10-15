import { SlidersHorizontal } from "lucide-react";
import Card from "./Card";
import type { ReactNode } from "react";

type Props = {
  title: string;
  /** Metric family, shown in small grey text under the title. */
  kind?: string;
  filter?: { value: string; options: { value: string; label: string }[]; onChange: (value: string) => void };
  value: ReactNode;
  caption?: ReactNode;
  children?: ReactNode;
};

/**
 * Metric card: title on the left, its own filter on the right, then the figure.
 * The per-card filter is the signature of the reference design, so it lives in
 * the base component instead of being rebuilt on each screen.
 */
export default function MetricCard({ title, kind, filter, value, caption, children }: Props) {
  return (
    <Card
      title={title}
      caption={kind}
      actions={
        filter ? (
          <div className="crm-metric__filter">
            <select
              className="crm-select"
              value={filter.value}
              onChange={(event) => filter.onChange(event.target.value)}
              name={`filter-${title.toLowerCase().replace(/\s+/g, "-")}`}
              aria-label={`Filtrar ${title}`}
            >
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <SlidersHorizontal size={14} color="#9ca3af" aria-hidden />
          </div>
        ) : null
      }
    >
      <div className="crm-metric__value">{value}</div>
      {caption && <div className="crm-metric__caption">{caption}</div>}
      {children}
    </Card>
  );
}