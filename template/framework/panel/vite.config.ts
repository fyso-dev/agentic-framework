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
    cssCodeSplit: false,
    chunkSizeWarningLimit: 500,
    // No content hash: `dist/` is committed, so each build overwrites the same
    // files instead of adding/removing them. Caddy serves them with no-cache.
    rollupOptions: {
      preserveEntrySignatures: "strict",
      input: {index:new URL("./index.html",import.meta.url).pathname,"extension-sdk":new URL("./src/extension-sdk.tsx",import.meta.url).pathname},
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: asset => asset.names.some(name=>name.endsWith(".css")) ? "assets/panel.css" : "assets/[name][extname]",
      },
    },
  },
});
