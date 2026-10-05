import { defineConfig, type BuildEnvironmentOptions, type Plugin } from "vite";
import { themeCss } from "@argentic/chest-ui";
import { identity } from "./src/theme.ts";

// Two builds of one source. The browser's (src/core/entry.tsx: the islands
// and the styles) into dist/client/assets under fixed names — the server
// adds ?v=<content hash> to their links —, and the server's (vite build
// --ssr) into dist/server, its packages left in node_modules.
const browser: BuildEnvironmentOptions = {
  outDir: "dist/client",
  emptyOutDir: true,
  rolldownOptions: {
    input: { client: "src/core/entry.tsx" },
    output: { entryFileNames: "assets/[name].js", chunkFileNames: "assets/[name].js", assetFileNames: asset => (asset.names[0]?.endsWith(".css") ? "assets/client.css" : "assets/[name][extname]") },
    // The kit's components say "use client" (for Next.js): meaningless here.
    onLog: (level, log, handler) => (log.code === "MODULE_LEVEL_DIRECTIVE" ? undefined : handler(level, log)),
  },
};
const server: BuildEnvironmentOptions = {
  outDir: "dist/server",
  emptyOutDir: true,
  ssr: true,
  rolldownOptions: { input: { main: "src/core/main.ts", app: "src/app.tsx" }, output: { entryFileNames: "[name].js" } },
};

// The look (src/theme.ts) becomes part of the stylesheet at build time: a
// file, never an inline <style>, so the strictest policy admits it.
const theme: Plugin = {
  name: "theme",
  resolveId: id => (id === "virtual:theme.css" ? "\0theme.css" : null),
  load: id => (id === "\0theme.css" ? themeCss(identity, { fontBase: "/assets/fonts" }) : null),
};

export default defineConfig(({ isSsrBuild }) => ({ plugins: [theme], oxc: { jsx: { runtime: "automatic" } }, build: isSsrBuild ? server : browser }));
