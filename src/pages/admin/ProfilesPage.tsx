import { Search, ShieldCheck } from "lucide-react";
import EmptyState from "../../components/admin/EmptyState";
import Pagination from "../../components/admin/Pagination";
import type { AdminProfile } from "../../services/admin";

interface ProfilesPageProps {
  profiles: AdminProfile[];
  visibleCount: number;
  loading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  currentUserId: string;
  savingProfileId: string | null;
  onRoleChange: (profile: AdminProfile, role: AdminProfile["role"]) => void;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}

export default function ProfilesPage({
  profiles,
  visibleCount,
  loading,
  search,
  onSearchChange,
  currentUserId,
  savingProfileId,
  onRoleChange,
  page,
  pageCount,
  onPageChange,
}: ProfilesPageProps) {
  return (
    <section className="admin-card">
      <div className="card-title customer-toolbar">
        <p className="customer-toolbar-note">Asigna acceso administrativo únicamente a cuentas registradas.</p>
        <label className="admin-search">
          <Search size={16} />
          <input
            aria-label="Buscar perfiles"
            placeholder="Buscar"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
      </div>
      <div className="profile-notice"><ShieldCheck size={17}/> Los usuarios se registran desde la tienda como clientes. Puedes promover una cuenta a administrador; no puedes cambiar tu propio rol.</div>
      <div className="admin-table">
        <div className="table-row profile-row header"><span>Perfil</span><span>WhatsApp</span><span className="cell-center">Alta</span><span className="cell-center">Permiso</span></div>
        {profiles.map((profile) => (
          <div className="table-row profile-row" key={profile.id}>
            <div className="profile-cell"><strong>{profile.full_name || "Sin nombre"}</strong><span>{profile.email || "Sin correo"}</span></div>
            <span>{profile.phone || "—"}</span>
            <span className="cell-center">{new Date(profile.created_at).toLocaleDateString("es-CO")}</span>
            <label className="mobile-select-cell">
              <select aria-label={`Permiso de ${profile.email ?? profile.id}`} value={profile.role} disabled={profile.id === currentUserId || savingProfileId === profile.id} onChange={(event) => onRoleChange(profile, event.target.value as AdminProfile["role"])}>
                <option value="customer">Cliente</option><option value="admin">Administrador</option><option value="asesor">Asesor</option>
              </select>
            </label>
          </div>
        ))}
        {!loading && visibleCount === 0 && (
          <EmptyState
            icon={<ShieldCheck size={26} />}
            title="No hay perfiles que coincidan con la búsqueda."
            hint="Prueba con otro nombre o correo."
          />
        )}
      </div>
      <Pagination
        page={page}
        pageCount={pageCount}
        total={visibleCount}
        noun="perfil"
        label="Paginación de perfiles"
        onPageChange={onPageChange}
      />
    </section>
  );
}
