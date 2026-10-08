import { ChevronLeft, ChevronRight } from "lucide-react";
import AdminButton from "./AdminButton";

export default function Pagination({
  page,
  pageCount,
  total,
  noun,
  label,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  noun: string;
  label: string;
  onPageChange: (page: number) => void;
}) {
  const single = pageCount <= 1;
  return (
    <div className="pagination" role="navigation" aria-label={label}>
      <AdminButton
        tone="secondary"
        compact
        type="button"
        disabled={single || page <= 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
        aria-label="Página anterior"
      >
        <ChevronLeft size={15} /> Anterior
      </AdminButton>
      <span className="pagination-info">
        {single
          ? `${total} ${noun}${total === 1 ? "" : "s"}`
          : `Página ${page} de ${pageCount} · ${total} ${noun}s`}
      </span>
      <AdminButton
        tone="secondary"
        compact
        type="button"
        disabled={single || page >= pageCount}
        onClick={() => onPageChange(Math.min(pageCount, page + 1))}
        aria-label="Página siguiente"
      >
        Siguiente <ChevronRight size={15} />
      </AdminButton>
    </div>
  );
}
