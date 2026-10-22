import { useState } from "react";
import Button from "./components/Button";
import { signOut, useAuth } from "./lib/auth";
import { isDemoMode } from "./lib/supabase";
import Shell from "./layout/Shell";
import { isAllowed } from "./layout/nav";
import type { SectionId } from "./layout/nav";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Inbox from "./pages/Inbox";
import Contacts from "./pages/Contacts";
import Board from "./pages/Board";
import PipelineSettings from "./pages/PipelineSettings";
import Placeholder from "./pages/Placeholder";

/** Fase de cada módulo, para el mensaje de "pantalla pendiente". */
const PHASE: Partial<Record<SectionId, string>> = {
  tablero: "Fase 4",
  conversaciones: "Fase 3",
  contactos: "Fase 3",
  tareas: "Fase 7",
  "agente-ia": "Fase 6",
  "preguntar-ia": "Fase 6",
  informes: "Fase 7",
  configuracion: "Fase 2",
};

/** Título de las pantallas que todavía no tienen una propia. */
const TITLES: Record<SectionId, string> = {
  dashboard: "Panel",
  tablero: "Tablero",
  conversaciones: "Conversaciones",
  contactos: "Contactos",
  tareas: "Tareas",
  "agente-ia": "Agente IA",
  "preguntar-ia": "Preguntar a la IA",
  informes: "Informes",
  configuracion: "Configuración",
};

export default function App() {
  const { user, role, loading, error } = useAuth();
  const [section, setSection] = useState<SectionId>("dashboard");
  const [shellError, setShellError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const activeSection = isAllowed(section, role) ? section : "dashboard";

  if (loading) {
    return (
      <div className="crm-login">
        <span style={{ color: "#dfe4ee", fontSize: 13 }}>Cargando…</span>
      </div>
    );
  }

  if (isDemoMode) {
    return (
      <div className="crm-login">
        <div className="crm-login__card">
          <h1 className="crm-login__title">Falta configurar Supabase</h1>
          <p style={{ fontSize: 13, color: "var(--crm-text-soft)" }}>
            El CRM lee <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> del{" "}
            <code>.env</code> de la raíz del repositorio. Revisa que existan y reinicia Vite.
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Login onError={setShellError} />
        {shellError && null}
      </>
    );
  }

  if (error) {
    return (
      <div className="crm-login">
        <div className="crm-login__card">
          <h1 className="crm-login__title">No se pudo verificar tu rol</h1>
          <p style={{ fontSize: 13, color: "var(--crm-text-soft)" }}>{error}</p>
        </div>
      </div>
    );
  }

  // Sesión válida, pero la cuenta no es del personal (rol 'customer' o perfil
  // inexistente): no es un error de la app, es un acceso legítimo al que no
  // se le da entrada. Se cierra la sesión para que los datos queden sueltos.
  if (!role) {
    return (
      <div className="crm-login">
        <div className="crm-login__card">
          <h1 className="crm-login__title">No tenés acceso al CRM</h1>
          <p style={{ fontSize: 13, color: "var(--crm-text-soft)" }}>
            Este espacio es para los perfiles de administrador y asesor de la
            tienda. Si pensás que es un error, hablá con el administrador.
          </p>
          <Button
            style={{ marginTop: 14 }}
            disabled={signingOut}
            onClick={() => {
              setSigningOut(true);
              void signOut();
            }}
          >
            {signingOut ? "Saliendo…" : "Cerrar sesión"}
          </Button>
        </div>
      </div>
    );
  }

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    "";

  return (
    <Shell
      section={activeSection}
      onSection={setSection}
      role={role}
      displayName={displayName}
      email={user.email ?? null}
      onSignOut={() => void signOut()}
    >
      {activeSection === "dashboard" && <Dashboard />}
      {activeSection === "conversaciones" && <Inbox userId={user.id} />}
      {activeSection === "contactos" && <Contacts />}
      {activeSection === "tablero" && <Board userId={user.id} />}
      {activeSection === "configuracion" && (
        <>
          <div className="crm-page-head">
            <h1 className="crm-page-title">Configuración</h1>
          </div>
          <PipelineSettings />
        </>
      )}
      {!["dashboard", "conversaciones", "contactos", "tablero", "configuracion"].includes(activeSection) && (
        <Placeholder title={TITLES[activeSection]} phase={PHASE[activeSection] ?? "una fase posterior"} />
      )}
    </Shell>
  );
}