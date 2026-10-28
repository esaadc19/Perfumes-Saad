import { Layers, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import AdminButton from "../../components/admin/AdminButton";
import EmptyState from "../../components/admin/EmptyState";
import { money } from "../../lib/format";
import { getPromotionMaxUnitCost, type Promotion } from "../../services/promotions";

interface PromotionsPageProps {
  promotions: Promotion[];
  feedback: string | null;
  onNew: () => void;
  onEdit: (promotion: Promotion) => void;
  onManageVariants: (promotion: Promotion) => void;
  onToggle: (promotion: Promotion) => void;
  onDelete: (promotion: Promotion) => void;
}

export default function PromotionsPage({
  promotions,
  feedback,
  onNew,
  onEdit,
  onManageVariants,
  onToggle,
  onDelete,
}: PromotionsPageProps) {
  return (
    <>
      {feedback && <p className="import-feedback" role="status">{feedback}</p>}
      <section className="admin-card">
        <div className="card-title promotion-toolbar">
          <p className="page-intro">Elige las presentaciones que participan según su margen. La oferta se repite por cada paquete completo.</p>
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
            {promotions.map((promotion) => {
              const maxUnitCost = getPromotionMaxUnitCost(promotion);
              return (
                <div className="table-row" key={promotion.id}>
                  <strong>{promotion.name}</strong>
                  <span className="promotion-package-cell">
                    <span>{promotion.required_quantity} por {money(promotion.bundle_price)}</span>
                    <small>
                      {promotion.minimum_profit == null
                        ? "Sin tope de costo (comportamiento anterior)"
                        : `Margen mínimo ${money(promotion.minimum_profit)} · Costo máximo ${maxUnitCost == null ? "—" : money(maxUnitCost)}${promotion.cost_includes_tax ? " (con IVA)" : " (sin IVA)"}`}
                    </small>
                  </span>
                  <span>{promotion.allow_mixed ? "Presentaciones combinables" : "Mismo perfume"}</span>
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
                    <AdminButton tone="secondary" compact onClick={() => onManageVariants(promotion)}><Layers size={15}/> Presentaciones</AdminButton>
                    <AdminButton tone="secondary" compact onClick={() => onEdit(promotion)}><Pencil size={15}/> Editar</AdminButton>
                    <AdminButton tone="danger" variant="outline" compact onClick={() => onDelete(promotion)}><Trash2 size={15}/> Eliminar</AdminButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
