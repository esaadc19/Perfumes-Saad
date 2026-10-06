import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // Aviso de tamaño desactivado: el bundle inicial queda por debajo de este
    // umbral gracias al code-splitting del panel de administración.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Separar vendors permite que el navegador los cachee entre despliegues,
        // ya que cambian mucho menos que el código de la aplicación.
        manualChunks: {
          react: ["react", "react-dom", "react/jsx-runtime"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
