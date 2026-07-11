import { resolve } from "node:path";

import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    emptyOutDir: false,
    outDir: "dist",
    rollupOptions: {
      input: resolve(__dirname, "src/background/index.ts"),
      output: {
        entryFileNames: "background.js",
        inlineDynamicImports: true
      }
    }
  }
});
