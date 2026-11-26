// The receipt reader's files (tesseract.js, its core and its French model),
// served at /chest/ocr/<version>/<file>: the version is in the address, so
// a browser keeps them a year, and an upgrade is a new address.
// scripts/ocr-assets.mjs copies them into dist/ocr/<version>/ and refuses
// to build when this version is not the installed packages' (tesseract.js
// and @tesseract.js-data/fra, "<tesseract.js>-<fra>").
export const ocrVersion = "7.0.0-1.0.0";
export const ocrBase = `/chest/ocr/${ocrVersion}`;
export const ocrFiles: Readonly<Record<string, string>> = {
  "worker.min.js": "text/javascript; charset=utf-8",
  "tesseract-core-simd-lstm.wasm.js": "text/javascript; charset=utf-8",
  "fra.traineddata.gz": "application/octet-stream",
};
