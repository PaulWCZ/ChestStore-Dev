// Copies what the phone needs to read a receipt into dist/ocr/<version>/, from the
// installed packages (npm ci), after the build: tesseract.js's worker, its
// core (WebAssembly with SIMD, LSTM engine only) and the French model
// (tessdata "best_int", 0.7 MB), with their licences. The server answers
// them at /chest/ocr/<version>/<file> (src/app.tsx) with a policy of their own: the
// worker compiles WebAssembly, which the pages' policy forbids. Nothing is
// fetched from the network at run time: the page loads these files from the
// tool.
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const root = join(dirname(new URL(import.meta.url).pathname), "..");
const pkg = name => dirname(require.resolve(name + "/package.json"));
const js = pkg("tesseract.js");
const core = pkg("tesseract.js-core");
const fra = pkg("@tesseract.js-data/fra");
// The version in the files' address (src/shared/ocr-files.ts) must be the
// installed one: a browser keeps these files a year under it.
const versionOf = dir => JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version;
const version = `${versionOf(js)}-${versionOf(fra)}`;
const declared = /ocrVersion = "([^"]+)"/u.exec(readFileSync(join(root, "src", "shared", "ocr-files.ts"), "utf8"))?.[1];
if (declared !== version) {
  console.error(`ocr assets: src/shared/ocr-files.ts says ${declared}, the installed packages are ${version}: change ocrVersion`);
  process.exit(1);
}
rmSync(join(root, "dist", "ocr"), { recursive: true, force: true });
const out = join(root, "dist", "ocr", version);
mkdirSync(out, { recursive: true });
const files = [
  [join(js, "dist", "worker.min.js"), "worker.min.js"],
  [join(js, "LICENSE.md"), "LICENSE-tesseract.js.txt"],
  [join(core, "tesseract-core-simd-lstm.wasm.js"), "tesseract-core-simd-lstm.wasm.js"],
  [join(core, "LICENSE"), "LICENSE-tesseract.js-core.txt"],
  [join(fra, "4.0.0_best_int", "fra.traineddata.gz"), "fra.traineddata.gz"],
];
for (const [from, to] of files) copyFileSync(from, join(out, to));
console.log(`ocr assets: ${files.length} files in dist/ocr/${version}`);
