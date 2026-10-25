import { Pencil, Plus, Tag, Trash2 } from "lucide-react";
import AdminButton from "../../components/admin/AdminButton";
import EmptyState from "../../components/admin/EmptyState";
import { money } from "../../lib/format";
import type { Promotion } from "../../services/promotions";

interface PromotionsPageProps {
  promotions: Promotion[];
  feedback: string | null;
  onNew: () => void;
  onEdit: (promotion: Promotion) => void;
  onToggle: (promotion: Promotion) => void;
  onDelete: (promotion: Promotion) => void;
}

export default function PromotionsPage({
  promotions,
  feedback,
  onNew,
  onEdit,
  onToggle,
  onDelete,
}: PromotionsPageProps) {
  return (
    <>
      {feedback && <p className="import-feedback" role="status">{feedback}</p>}
      <section className="admin-card">
        <div className="card-title">
          <div>
            <h2>Promociones y ofertas</h2>
            <span>Asocia los productos desde su formulario. La oferta se repite por cada paquete completo.</span>
          </div>
          <AdminButton type="button" onClick={onNew}><Plus size={17}/> Nueva promoción</AdminButton>
        </div>
        {promotions.length === 0 ? (
          <EmptyState
            icon={<Tag size={26} />}
            title="Todavía no hay promociones"
            hint="Crea una para ofrecer paquetes con precio especial."
            action={
              <AdminButton tone="secondary" compact type="button" onClick={onNew}>
                <Plus size={14} /> Nueva promoción
              </AdminButton>
            }
          />
        ) : (
          <div className="admin-table promotion-table">
            <div className="table-row header"><span>Promoción</span><span>Paquete</span><span>Combinación</span><span className="cell-center">Estado</span><span className="cell-center">Acciones</span></div>
            {promotions.map((promotion) => (
              <div className="table-row" key={promotion.id}>
                <strong>{promotion.name}</strong>
                <span>{promotion.required_quantity} por {money(promotion.bundle_price)}</span>
                <span>{promotion.allow_mixed ? "Productos asociados combinables" : "Mismo perfume"}</span>
                <button
                  type="button"
                  className={`status-pill ${promotion.active ? "status-paid" : ""} status-toggle`}
                  aria-pressed={promotion.active}
                  title={promotion.active ? "Activa · pausar" : "Pausada · activar"}
                  onClick={() => onToggle(promotion)}
                >
                  {promotion.active ? "Activa" : "Inactiva"}
                </button>
                <div className="product-actions">
                  <AdminButton tone="secondary" compact onClick={() => onEdit(promotion)}><Pencil size={15}/> Editar</AdminButton>
                  <AdminButton tone="danger" variant="outline" compact onClick={() => onDelete(promotion)}><Trash2 size={15}/> Eliminar</AdminButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
