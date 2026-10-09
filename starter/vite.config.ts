import { chestConfig } from "@argentic/chest-app/vite";
import { identity } from "./src/theme.ts";

// The two builds (the browser's, the server's) and the look built into
// client.css: @argentic/chest-app/vite. `bundle: ["a-package"]` bundles a
// package added to the server (less memory) when it bundles cleanly.
export default chestConfig({ theme: identity });
