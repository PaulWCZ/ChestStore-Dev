import type { NextConfig } from "next";

// What a Chest needs of a Next.js server (README, "On a Chest"):
// - the build fits the Chest's build container (512 MiB, 1 CPU): webpack
//   (`next build --webpack`, whose heap Node bounds) rather than Turbopack,
//   one worker, in the main process; the types are checked before, by
//   `tsc` in the build script, not by a second process beside the build;
// - no build cache left in the image: the Chest keeps the layer of npm ci;
// - nothing written at run time, where the file system is read-only: no
//   image optimizer (it keeps a cache on disk), every page rendered per
//   request (app/layout.tsx);
// - the server's own name kept out of the answers.
const config: NextConfig = {
  images: { unoptimized: true },
  poweredByHeader: false,
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },
  experimental: { cpus: 1, webpackBuildWorker: false, webpackMemoryOptimizations: true },
  webpack: webpackConfig => ({ ...webpackConfig, cache: false }),
};

export default config;
