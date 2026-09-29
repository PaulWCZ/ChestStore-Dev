import type { NextConfig } from "next";

// What a Chest needs of a Next.js server:
// - the build fits the Chest's build container: webpack (`next build
//   --webpack`, whose heap Node bounds) rather than Turbopack, one worker, in
//   the main process; types are checked before, by `tsc` in the build script;
// - no build cache left in the image;
// - nothing written at run time (read-only disk): no image optimiser, every
//   page rendered per request (app/layout.tsx);
// - the server's own name kept out of the answers;
// - forbidden() (authInterrupts): a managers' page asked by someone else
//   answers 403 (app/chest/forbidden.tsx).
const config: NextConfig = {
  images: { unoptimized: true },
  poweredByHeader: false,
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },
  experimental: { cpus: 1, webpackBuildWorker: false, webpackMemoryOptimizations: true, authInterrupts: true },
  webpack: webpackConfig => ({ ...webpackConfig, cache: false }),
};

export default config;
