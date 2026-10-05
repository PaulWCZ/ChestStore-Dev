import { defineConfig, type BuildEnvironmentOptions, type Plugin } from "vite";
import { themeCss } from "@argentic/chest-ui";
import { identity } from "./src/theme.ts";

// Two builds of one source. The browser's (src/core/entry.tsx: the islands
// and the styles) into dist/client/assets under fixed names — the server
// adds ?v=<build time> to their links —, and the server's (vite build
// --ssr) into dist/server. The server bundles the starter's own packages
// (less memory, a faster start); a package added later stays in
// node_modules — list it in noExternal when it bundles cleanly.
// The kit's components say "use client" (for Next.js): meaningless here.
const onLog: NonNullable<BuildEnvironmentOptions["rolldownOptions"]>["onLog"] = (level, log, handler) => (log.code === "MODULE_LEVEL_DIRECTIVE" ? undefined : handler(level, log));

const browser: BuildEnvironmentOptions = {
  outDir: "dist/client",
  emptyOutDir: true,
  rolldownOptions: {
    input: { client: "src/core/entry.tsx" },
    output: { entryFileNames: "assets/[name].js", chunkFileNames: "assets/[name].js", assetFileNames: asset => (asset.names[0]?.endsWith(".css") ? "assets/client.css" : "assets/[name][extname]") },
    onLog,
  },
};
const server: BuildEnvironmentOptions = {
  outDir: "dist/server",
  emptyOutDir: true,
  ssr: true,
  copyPublicDir: false,
  rolldownOptions: { input: { main: "src/core/main.ts", app: "src/app.tsx" }, output: { entryFileNames: "[name].js" }, onLog },
};

// The look (src/theme.ts) becomes part of the stylesheet at build time: a
// file, never an inline <style>, so the strictest policy admits it.
const theme: Plugin = {
  name: "theme",
  resolveId: id => (id === "virtual:theme.css" ? "\0theme.css" : null),
  load: id => (id === "\0theme.css" ? themeCss(identity, { fontBase: "/assets/fonts" }) : null),
};

export default defineConfig(({ isSsrBuild, mode }) => ({
  plugins: [theme],
  oxc: { jsx: { runtime: "automatic" } },
  ssr: { noExternal: ["hono", "@hono/node-server", "react", "react-dom", "scheduler", "postgres", "@argentic/chest-sdk", "@argentic/chest-ui"] },
  define: isSsrBuild ? { "process.env.NODE_ENV": JSON.stringify(mode) } : {},
  build: isSsrBuild ? server : browser,
}));
