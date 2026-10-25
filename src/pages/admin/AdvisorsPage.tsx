import { Pencil, Trash2, UserCheck } from "lucide-react";
import AdminButton from "../../components/admin/AdminButton";
import EmptyState from "../../components/admin/EmptyState";
import type { SalesAdvisor } from "../../services/admin";
import type { AdvisorFormState } from "./types";

interface AdvisorsPageProps {
  advisors: SalesAdvisor[];
  form: AdvisorFormState;
  editingAdvisor: SalesAdvisor | null;
  saving: boolean;
  deletingAdvisorId: string | null;
  loading: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onFormChange: (form: AdvisorFormState) => void;
  onEdit: (advisor: SalesAdvisor) => void;
  onCancelEdit: () => void;
  onDelete: (advisor: SalesAdvisor) => void;
}

export default function AdvisorsPage({
  advisors,
  form,
  editingAdvisor,
  saving,
  deletingAdvisorId,
  loading,
  onSubmit,
  onFormChange,
  onEdit,
  onCancelEdit,
  onDelete,
}: AdvisorsPageProps) {
  return (
    <section className="admin-card">
      <div className="card-title">
        <div>
          <h2>Asesores de venta</h2>
          <span>Registra quién atendió cada pedido. Solo los asesores activos aparecen al crear o editar un pedido.</span>
        </div>
      </div>
      <form className="advisor-form" onSubmit={onSubmit}>
        <div className="advisor-form-grid">
          <label className="auth-label">
            Nombre completo
            <input
              type="text"
              required
              placeholder="Nombre del asesor"
              value={form.full_name}
              disabled={saving}
              onChange={(event) => onFormChange({ ...form, full_name: event.target.value })}
            />
          </label>
          <label className="auth-label">
            WhatsApp
            <input
              type="tel"
              placeholder="Opcional"
              value={form.phone}
              disabled={saving}
              onChange={(event) => onFormChange({ ...form, phone: event.target.value })}
            />
          </label>
          <label className="auth-label">
            Correo
            <input
              type="email"
              placeholder="Opcional"
              value={form.email}
              disabled={saving}
              onChange={(event) => onFormChange({ ...form, email: event.target.value })}
            />
          </label>
        </div>
        <div className="advisor-form-actions">
          <AdminButton type="submit" disabled={saving || !form.full_name.trim()}>
            {editingAdvisor ? "Guardar cambios" : "Agregar asesor"}
          </AdminButton>
          {editingAdvisor && (
            <AdminButton
              tone="secondary"
              compact
              type="button"
              disabled={saving}
              onClick={onCancelEdit}
            >
              Cancelar
            </AdminButton>
          )}
        </div>
      </form>
      <div className="admin-table">
        <div className="table-row advisor-row header">
          <span>Asesor</span><span>WhatsApp</span><span>Correo</span><span className="cell-center">Estado</span><span></span>
        </div>
        {advisors.map((advisor) => (
          <div className="table-row advisor-row" key={advisor.id}>
            <strong>{advisor.full_name}</strong>
            <span>{advisor.phone || "—"}</span>
            <span>{advisor.email || "—"}</span>
            <span className={`cell-center ${advisor.active ? "advisor-active" : "advisor-inactive"}`}>
              {advisor.active ? "Activo" : "Inactivo"}
            </span>
            <div className="order-actions">
              <AdminButton
                tone="secondary"
                compact
                type="button"
                aria-label={`Editar ${advisor.full_name}`}
                disabled={saving}
                onClick={() => onEdit(advisor)}
              >
                <Pencil size={15} /> Editar
              </AdminButton>
              <AdminButton
                tone="danger"
                variant="outline"
                compact
                type="button"
                aria-label={`Eliminar ${advisor.full_name}`}
                disabled={deletingAdvisorId === advisor.id}
                onClick={() => onDelete(advisor)}
              >
                <Trash2 size={16} />
              </AdminButton>
            </div>
          </div>
        ))}
        {!loading && advisors.length === 0 && (
          <EmptyState
            icon={<UserCheck size={26} />}
            title="No hay asesores registrados"
            hint="Agrega el primero con el formulario de arriba."
          />
        )}
      </div>
    </section>
  );
}
