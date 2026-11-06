import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served by Caddy at the root of panel.<host>, with hash routing (no SPA fallback needed).
// `dist/` is committed so generated projects need no Node build step.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 500,
  },
});
