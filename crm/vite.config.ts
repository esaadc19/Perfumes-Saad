import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// El CRM se sirve bajo /crm/, pero sus archivos se emiten dentro de la misma
// carpeta de salida que la tienda (`dist/crm`). Así Vercel despliega las dos
// apps con un solo `outputDirectory` y sin configuración de rewrites.
export default defineConfig({
  base: "/crm/",
  // Las credenciales se comparten con la tienda: se leen del `.env` de la raíz
  // en vez de duplicar un `.env` dentro de `crm/`.
  envDir: "..",
  plugins: [react()],
  server: {
    // Fijo para que el proxy de `/crm` en la tienda siempre apunte aquí.
    // Con `strictPort` falla en vez de correrse al siguiente puerto libre.
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: "../dist/crm",
    // Fuera de la raíz del proyecto (está dentro de `dist/`), así que hay que
    // autorizarlo explícitamente para que Vite lo limpie entre builds.
    emptyOutDir: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react/jsx-runtime"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});