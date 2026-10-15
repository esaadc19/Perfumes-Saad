import type { ReactNode } from "react";

type Tone = "neutral" | "success" | "danger" | "info";

export default function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={["crm-badge", tone !== "neutral" && `crm-badge--${tone}`].filter(Boolean).join(" ")}>{children}</span>;
}