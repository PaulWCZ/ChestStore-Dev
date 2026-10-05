import { defineConfig, type BuildEnvironmentOptions } from "vite";

// Two builds of one source: the browser's (src/client/main.tsx — the
// islands and the styles) into dist/client/assets under fixed names, and the
// server's (vite build --ssr) into dist/server, its packages left in
// node_modules.
const browser: BuildEnvironmentOptions = {
  outDir: "dist/client",
  emptyOutDir: true,
  rolldownOptions: {
    input: { client: "src/client/main.tsx" },
    output: { entryFileNames: "assets/[name].js", chunkFileNames: "assets/[name].js", assetFileNames: (asset) => (asset.names[0]?.endsWith(".css") ? "assets/client.css" : "assets/[name][extname]") },
  },
};
const server: BuildEnvironmentOptions = {
  outDir: "dist/server",
  emptyOutDir: true,
  ssr: true,
  rolldownOptions: { input: { main: "src/server/main.tsx", app: "src/server/app.tsx" }, output: { entryFileNames: "[name].js" } },
};

export default defineConfig(({ isSsrBuild }) => ({ oxc: { jsx: { runtime: "automatic" } }, build: isSsrBuild ? server : browser }));
