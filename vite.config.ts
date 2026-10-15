import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Puerto fijo: si se corre al revés o algo ocupa el 5173, es mejor fallar
    // que arrancar en otro puerto y desbaratar el proxy de `/crm`.
    port: 5173,
    strictPort: true,
    proxy: {
      // El CRM corre como una segunda app de Vite (puerto 5174). El proxy deja
      // `/crm` disponible en el mismo servidor de la tienda, así no hay que
      // recordar el otro puerto. Sin `rewrite`: el CRM ya tiene base `/crm/`.
      "/crm": {
        target: "http://localhost:5174",
        changeOrigin: true,
      },
    },
  },
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
