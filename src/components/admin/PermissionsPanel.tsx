import { useMemo, useState } from "react";
import { Check, ShieldCheck } from "lucide-react";
import AdminButton from "./AdminButton";
import { setAdminSectionPermission, type AdminProfile, type AdminSectionPermission } from "../../services/admin";

export interface PermissionSection {
  id: string;
  title: string;
}

/**
 * Permisos de acceso al panel, seccion por seccion.
 *
 * El rol dice si la cuenta puede ENTRAR (admin, asesor). Esto dice que
 * puede VER una vez dentro. Son dos cosas separadas: con el rol solo,
 * un asesor entra y ve Cartera, Gastos y Reportes, que es justo lo que
 * uno no quiere que vea.
 *
 * Una cuenta sin ninguna casilla marcada no ve nada del panel.
 */
export default function PermissionsPanel({
  profiles,
  permissions,
  sections,
  currentUserId,
  onChanged,
}: {
  profiles: AdminProfile[];
  permissions: AdminSectionPermission[];
  sections: PermissionSection[];
  currentUserId: string;
  onChanged: () => void;
}) {
  // Que casillas estan marcadas, por usuario.
  const granted = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const row of permissions) {
      if (!row.allowed) continue;
      const set = map.get(row.profile_id) ?? new Set<string>();
      set.add(row.section_id);
      map.set(row.profile_id, set);
    }
    return map;
  }, [permissions]);

  // Solo las cuentas que pueden entrar al panel: un cliente no tiene
  // secciones que habilitar.
  const staff = useMemo(
    () => profiles.filter((profile) => profile.role === "admin" || profile.role === "asesor"),
    [profiles]
  );

  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const toggle = async (profileId: string, sectionId: string, allowed: boolean) => {
    const key = `${profileId}:${sectionId}`;
    setSavingKey(key);
    setError(null);
    setFeedback(null);
    try {
      await setAdminSectionPermission(profileId, sectionId, allowed);
      onChanged();
    } catch (toggleError) {
      console.error("No se pudo cambiar el permiso:", toggleError);
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "No se pudo cambiar el permiso."
      );
    } finally {
      setSavingKey(null);
    }
  };

  const setAll = async (profileId: string, allowed: boolean) => {
    setSavingKey(`${profileId}:*`);
    setError(null);
    setFeedback(null);
    try {
      // Se hacen de una en una porque cada permiso es una fila y la
      // funcion de la base es de una seccion por llamada.
      for (const section of sections) {
        await setAdminSectionPermission(profileId, section.id, allowed);
      }
      onChanged();
      setFeedback(allowed ? "Se le dieron todas las secciones." : "Se le quitaron todas las secciones.");
    } catch (bulkError) {
      console.error("No se pudieron cambiar los permisos:", bulkError);
      setError(bulkError instanceof Error ? bulkError.message : "No se pudieron cambiar los permisos.");
    } finally {
      setSavingKey(null);
    }
  };

  if (staff.length === 0) {
    return (
      <p className="empty-state">
        <span className="empty-state-icon"><ShieldCheck size={26} /></span>
        <strong>No hay cuentas con acceso al panel</strong>
        <span>
          Cuando un administrador o un asesor tenga cuenta, aquí le asignas las
          secciones que puede ver.
        </span>
      </p>
    );
  }

  return (
    <div className="permissions-panel">
      <div className="permissions-intro">
        <h3>Permisos de acceso</h3>
        <p>
          Elige qué secciones del panel ve cada persona. Un asesor o
          administrador sin ninguna casilla marcada no ve nada: entra al
          panel y le aparece un aviso, no los datos.
        </p>
      </div>

      {error && <p className="admin-error" role="alert">{error}</p>}
      {feedback && <p className="admin-success" role="status">{feedback}</p>}

      {staff.map((profile) => {
        const own = profile.id === currentUserId;
        const has = granted.get(profile.id) ?? new Set<string>();
        const allOn = sections.every((section) => has.has(section.id));
        const busy = savingKey?.startsWith(`${profile.id}:`) ?? false;

        return (
          <div className="permission-card" key={profile.id}>
            <div className="permission-card-head">
              <div>
                <strong>{profile.full_name || "Sin nombre"}</strong>
                <span>{profile.email || "Sin correo"}</span>
              </div>
              <span className={`permission-role permission-role--${profile.role}`}>
                {profile.role === "admin" ? "Administrador" : "Asesor"}
              </span>
            </div>

            {own && (
              <p className="permission-own-note">
                Esta es tu cuenta. No puedes cambiarte los permisos a ti mismo:
                si te los quitas, no quedaría nadie para devolvértelos.
              </p>
            )}

            <div className="permission-grid">
              {sections.map((section) => {
                const checked = has.has(section.id);
                const key = `${profile.id}:${section.id}`;
                return (
                  <label
                    key={section.id}
                    className={`permission-chip${checked ? " is-on" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={own || savingKey === key}
                      onChange={(event) => void toggle(profile.id, section.id, event.target.checked)}
                    />
                    <span className="permission-chip-box" aria-hidden="true">
                      {checked && <Check size={13} />}
                    </span>
                    {section.title}
                  </label>
                );
              })}
            </div>

            {!own && (
              <div className="permission-card-actions">
                <AdminButton
                  tone="secondary"
                  compact
                  type="button"
                  disabled={busy || allOn}
                  onClick={() => void setAll(profile.id, true)}
                >
                  Dar todas
                </AdminButton>
                <AdminButton
                  tone="secondary"
                  compact
                  type="button"
                  disabled={busy || !allOn}
                  onClick={() => void setAll(profile.id, false)}
                >
                  Quitar todas
                </AdminButton>
                {busy && <span className="permission-saving">Guardando...</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
