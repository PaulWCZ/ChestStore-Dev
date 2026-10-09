// Runs a built tool behind the local Chest until stopped:
//   node lab/starter-bench/serve.mjs starter 4100   → http://127.0.0.1:4100/chest
import { resolve } from "node:path";
import { runTool } from "./chest.mjs";

const tool = await runTool(resolve(process.argv[2]), { front: Number(process.argv[3] ?? 4100), quiet: false });
console.log(`${tool.origin}/chest (ready in ${Math.round(tool.ready)} ms)`);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => tool.stop().then(() => process.exit(0)));
