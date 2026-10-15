import type { ReactNode } from "react";

type Props = {
  title: ReactNode;
  /** Secondary line under the title, e.g. the metric type. */
  caption?: ReactNode;
  /** Controls rendered on the right of the header (filters, etc.). */
  actions?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
  className?: string;
};

export default function Card({ title, caption, actions, children, bodyClassName, className }: Props) {
  return (
    <section className={["crm-card", className].filter(Boolean).join(" ")}>
      <header className="crm-card__head">
        <div>
          <h2 className="crm-card__title">{title}</h2>
          {caption && <span className="crm-card__sub">{caption}</span>}
        </div>
        {actions}
      </header>
      <div className={["crm-card__body", bodyClassName].filter(Boolean).join(" ")}>{children}</div>
    </section>
  );
}