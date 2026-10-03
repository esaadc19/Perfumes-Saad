import type { ReactNode } from "react";

export default function Metric({
  title,
  value,
  icon,
  warning,
  onClick,
}: {
  title: string;
  value: string;
  icon: ReactNode;
  warning?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className={warning ? "metric-icon warning" : "metric-icon"}>{icon}</span>
      <span>{title}</span>
      <strong>{value}</strong>
      {onClick && <small className="metric-hint">Ver detalle</small>}
    </>
  );

  return onClick ? (
    <button className="metric metric-action" onClick={onClick}>{content}</button>
  ) : (
    <div className="metric">{content}</div>
  );
}
