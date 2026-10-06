import { defineConfig, type BuildEnvironmentOptions } from "vite";

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

// The look is not built in: it is the company's choice, read at each
// request and served as a stylesheet of its own (src/theme.ts, src/app.tsx).
export default defineConfig(({ isSsrBuild, mode }) => ({
  oxc: { jsx: { runtime: "automatic" } },
  ssr: { noExternal: ["hono", "@hono/node-server", "react", "react-dom", "scheduler", "postgres", "@argentic/chest-sdk", "@argentic/chest-ui"] },
  define: isSsrBuild ? { "process.env.NODE_ENV": JSON.stringify(mode) } : {},
  build: isSsrBuild ? server : browser,
}));
