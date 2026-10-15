import type { ReactNode } from "react";
import { Search } from "lucide-react";

type Props = {
  title: string;
  hint?: string;
  icon?: ReactNode;
  action?: ReactNode;
};

/** Empty state, following the reference: soft blue circle icon over a short message. */
export default function EmptyState({ title, hint, icon, action }: Props) {
  return (
    <div className="crm-empty" role="status">
      <span className="crm-empty__icon">{icon ?? <Search size={20} />}</span>
      <span className="crm-empty__title">{title}</span>
      {hint && <span>{hint}</span>}
      {action}
    </div>
  );
}