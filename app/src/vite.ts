import { themeCss } from "@argentic/chest-ui";
import type { Theme } from "@argentic/chest-ui/contract";
import { defineConfig, type BuildEnvironmentOptions, type Plugin, type UserConfig } from "vite";

// The tool's vite.config.ts:
//   export default chestConfig({ theme: identity });
// Two builds of one source. The browser's (src/entry.tsx: the islands and
// the styles) into dist/client/assets under fixed names — pages link them
// with ?v=<build time> —, and the server's (vite build --ssr: src/main.ts
// and src/app.tsx) into dist/server. The server bundles the packages the
// starter uses (less memory, a faster start); `bundle` adds more — a
// package that does not bundle cleanly stays in node_modules.
// The look (theme) becomes part of client.css at build time: a file,
// never an inline <style>, so the strictest policy admits it.
// Without theme (a look chosen at run time, served by createApp's look),
// virtual:look.css is empty: src/entry.tsx need not import it.
export function chestConfig({ theme, bundle = [] }: { theme?: Theme; bundle?: string[] }): UserConfig {
  // The kit's components say "use client" (for Next.js): meaningless here.
  const onLog: NonNullable<BuildEnvironmentOptions["rolldownOptions"]>["onLog"] = (level, log, handler) => (log.code === "MODULE_LEVEL_DIRECTIVE" ? undefined : handler(level, log));
  const browser: BuildEnvironmentOptions = {
    outDir: "dist/client",
    emptyOutDir: true,
    rolldownOptions: {
      input: { client: "src/entry.tsx" },
      // The script and its chunks named by their hash: a chunk imports the
      // entry under the very name the page links (http.tsx, browserFiles).
      output: { entryFileNames: "assets/[name]-[hash].js", chunkFileNames: "assets/[name]-[hash].js", assetFileNames: asset => (asset.names[0]?.endsWith(".css") ? "assets/client.css" : "assets/[name][extname]") },
      onLog,
    },
  };
  const server: BuildEnvironmentOptions = {
    outDir: "dist/server",
    emptyOutDir: true,
    ssr: true,
    copyPublicDir: false,
    rolldownOptions: { input: { main: "src/main.ts", app: "src/app.tsx" }, output: { entryFileNames: "[name].js" }, onLog },
  };
  const look: Plugin = {
    name: "chest-look",
    resolveId: id => (id === "virtual:look.css" ? "\0look.css" : null),
    load: id => (id === "\0look.css" ? (theme ? themeCss(theme, { fontBase: "/assets/fonts" }) : "") : null),
  };
  return defineConfig(({ isSsrBuild, mode }) => ({
    plugins: [look],
    oxc: { jsx: { runtime: "automatic" } },
    // Bundled in a build only: npm run dev keeps them in node_modules (a
    // watcher holding them all costs ~100 MiB more).
    ssr: { noExternal: mode === "development" ? [] : ["hono", "@hono/node-server", "react", "react-dom", "scheduler", "postgres", "@argentic/chest-sdk", "@argentic/chest-ui", "@argentic/chest-app", ...bundle] },
    define: isSsrBuild ? { "process.env.NODE_ENV": JSON.stringify(mode) } : {},
    build: isSsrBuild ? server : browser,
  })) as UserConfig;
}
