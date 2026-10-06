import { themeCss } from "@argentic/chest-ui";
import type { Theme } from "@argentic/chest-ui/contract";
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
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
// What every tool's client.css starts with.
export const baseCss = ".island{display:contents}";

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
  // The package's own rules, first in client.css (a tool's styles come
  // after and may override them): an island's wrapper <div> takes no room
  // of its own — its content lays out as if the wrapper were not there (an
  // empty island leaves no gap in a flex or grid gap).
  const base: Plugin = {
    name: "chest-base",
    apply: "build",
    generateBundle(_, bundle) {
      const css = Object.values(bundle).find(file => file.type === "asset" && file.fileName === "assets/client.css");
      if (css?.type === "asset") css.source = `${baseCss}\n${typeof css.source === "string" ? css.source : new TextDecoder().decode(css.source)}`;
      else this.emitFile({ type: "asset", fileName: "assets/client.css", source: baseCss });
    },
  };
  // The browser's files compressed once, at build: client-<hash>.js.br and
  // .gz beside each, served by Accept-Encoding (the Chest's front does not
  // compress). In development, none (a stale .br would hide a rebuild).
  const precompress = (development: boolean): Plugin => ({
    name: "chest-precompress",
    apply: "build",
    closeBundle() {
      const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
      let files: string[];
      try {
        files = walk("dist/client");
      } catch {
        return;
      }
      for (const file of files) {
        if (/\.(br|gz)$/u.test(file)) {
          if (development) rmSync(file);
          continue;
        }
        if (development || !/\.(js|mjs|css|svg|json|txt|map)$/u.test(file) || statSync(file).size < 1024) continue;
        const bytes = readFileSync(file);
        writeFileSync(`${file}.gz`, gzipSync(bytes, { level: 9 }));
        writeFileSync(`${file}.br`, brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length } }));
      }
    },
  });
  return defineConfig(({ isSsrBuild, mode }) => ({
    plugins: isSsrBuild ? [look] : [look, base, precompress(mode === "development")],
    // The JSX runtime and React's build follow the Vite mode, never the
    // shell's NODE_ENV (the Perseus workbench sets development: a build's
    // JSX must still be the production runtime its React provides).
    oxc: { jsx: { runtime: "automatic", development: mode === "development" } },
    // Bundled in a build only: npm run dev keeps them in node_modules (a
    // watcher holding them all costs ~100 MiB more).
    ssr: { noExternal: mode === "development" ? [] : ["hono", "@hono/node-server", "react", "react-dom", "scheduler", "postgres", "@argentic/chest-sdk", "@argentic/chest-ui", "@argentic/chest-app", ...bundle] },
    define: { "process.env.NODE_ENV": JSON.stringify(mode === "development" ? "development" : "production") },
    build: isSsrBuild ? server : browser,
  })) as UserConfig;
}
