import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:3000" } },
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@vladmandic/face-api")) {
            return "face-api-vendor";
          }
          if (id.includes("jspdf") || id.includes("html2canvas")) {
            return "pdf-vendor";
          }
        },
      },
    },
  },
});
