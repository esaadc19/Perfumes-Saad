import { createClient } from "@supabase/supabase-js";

const env = (import.meta as ImportMeta & {
  env: {
    VITE_SUPABASE_URL?: string;
    VITE_SUPABASE_ANON_KEY?: string;
  };
}).env;

/**
 * Mismo proyecto de Supabase que la tienda, mismas credenciales (`envDir: ".."`
 * en `vite.config.ts` lee el `.env` de la raíz). Solo la anon key viaja al
 * cliente: la service role se usa únicamente en las funciones de `api/`.
 */
export const supabase =
  env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY
    ? createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
    : null;

/** Sin `.env` no hay Supabase: el CRM muestra el modo demo en vez de romperse. */
export const isDemoMode = supabase === null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase no está configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el .env."
    );
  }
  return supabase;
}