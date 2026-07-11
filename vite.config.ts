import { resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";

import { defineConfig, loadEnv, type Plugin } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [manifestProxyPermission(loadEnv(mode, process.cwd(), "").VITE_TMDB_MULTI_SEARCH_PROXY_URL)],
  publicDir: "public",
  build: {
    emptyOutDir: true,
    outDir: "dist",
    rollupOptions: {
      input: {
        content: resolve(__dirname, "src/content/index.ts")
      },
      output: {
        entryFileNames: "[name].js",
        inlineDynamicImports: true
      }
    }
  }
}));

function manifestProxyPermission(proxyUrl: string | undefined): Plugin {
  return {
    name: "watcher-manifest-proxy-permission",
    async closeBundle() {
      const manifestPath = resolve(process.cwd(), "dist/manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { host_permissions: string[] };
      const permission = toHostPermission(proxyUrl);
      manifest.host_permissions = permission ? [permission] : [];
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    }
  };
}

function toHostPermission(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value);
    const localHttp = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    return url.protocol === "https:" || localHttp ? `${url.origin}/*` : null;
  } catch {
    return null;
  }
}
