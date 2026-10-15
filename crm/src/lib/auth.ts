import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { requireSupabase, supabase } from "./supabase";

/**
 * Roles del CRM. `profiles.role` hoy solo vale 'admin' | 'customer'; la Fase 2
 * agrega 'asesor'. Hasta entonces cualquier cuenta que no sea admin entra como
 * 'asesor', que es lo mismo que hacer hoy: entrar al panel.
 */
export type CrmRole = "admin" | "asesor";

export type AuthState = {
  user: User | null;
  session: Session | null;
  role: CrmRole | null;
  loading: boolean;
  error: string | null;
};

export async function loadRole(userId: string): Promise<CrmRole> {
  const { data, error } = await requireSupabase()
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.role === "admin" ? "admin" : "asesor";
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    role: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!supabase) {
      setState((s) => ({ ...s, loading: false, error: "Supabase no está configurado (modo demo)." }));
      return;
    }

    let active = true;

    const sync = async (session: Session | null) => {
      if (!active) return;
      if (!session) {
        setState({ user: null, session: null, role: null, loading: false, error: null });
        return;
      }
      try {
        const role = await loadRole(session.user.id);
        if (!active) return;
        setState({ user: session.user, session, role, loading: false, error: null });
      } catch (err) {
        if (!active) return;
        setState({
          user: session.user,
          session,
          role: null,
          loading: false,
          error:
            err instanceof Error
              ? `No se pudo verificar el rol: ${err.message}`
              : "No se pudo verificar el rol.",
        });
      }
    };

    // El listener de Supabase se dispara dentro de su propio callback; el
    // setTimeout saca la llamada a la base de datos de esa transacción para
    // evitar el aviso de "Auth session missing" en las peticiones de perfil.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => void sync(session), 0);
    });

    void supabase.auth.getSession().then(({ data }) => void sync(data.session));

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return state;
}

export async function signIn(email: string, password: string) {
  const { error } = await requireSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  await requireSupabase().auth.signOut();
}