// Copies what the phone needs to read a receipt into public/ocr/, from the
// installed packages (npm ci), before the build: tesseract.js's worker, its
// core (WebAssembly with SIMD, LSTM engine only) and the French model
// (tessdata "best_int", 0.7 MB), with their licences. Nothing is fetched
// from the network at run time: the page loads these files from the tool.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const root = join(dirname(new URL(import.meta.url).pathname), "..");
const out = join(root, "public", "ocr");
mkdirSync(out, { recursive: true });
const pkg = name => dirname(require.resolve(name + "/package.json"));
const js = pkg("tesseract.js");
const core = pkg("tesseract.js-core");
const fra = pkg("@tesseract.js-data/fra");
const files = [
  [join(js, "dist", "worker.min.js"), "worker.min.js"],
  [join(js, "LICENSE.md"), "LICENSE-tesseract.js.txt"],
  [join(core, "tesseract-core-simd-lstm.wasm.js"), "tesseract-core-simd-lstm.wasm.js"],
  [join(core, "LICENSE"), "LICENSE-tesseract.js-core.txt"],
  [join(fra, "4.0.0_best_int", "fra.traineddata.gz"), "fra.traineddata.gz"],
];
for (const [from, to] of files) copyFileSync(from, join(out, to));
console.log(`ocr assets: ${files.length} files in public/ocr`);
