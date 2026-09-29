// Safe in the browser: reads the receipt the person just photographed, in
// their own browser (tesseract.js, Apache-2.0, THIRD_PARTY.md), to suggest
// the amount, the day, the VAT and the shop. Everything it needs is served
// by the tool (public/ocr/, copied at build by scripts/ocr-assets.mjs):
// nothing leaves the page, no service is called. The first reading loads
// about 4.7 MB (then the browser keeps them); a data-saving phone, a PDF or
// an iPhone HEIC photo is not read.
import { readReceiptText, type ReceiptGuess } from "../lib/receipt-text.ts";

type OcrWorker = { recognize(image: File): Promise<{ data: { text: string } }>; terminate(): Promise<unknown> };
let worker: Promise<OcrWorker> | null = null;

function start(): Promise<OcrWorker> {
  worker ??= import("tesseract.js").then(({ createWorker }) => createWorker("fra", 1, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr/tesseract-core-simd-lstm.wasm.js",
    langPath: "/ocr",
    gzip: true,
    workerBlobURL: false,
  }) as Promise<OcrWorker>).catch(error => {
    worker = null;
    throw error;
  });
  return worker;
}

const readable = ["image/jpeg", "image/png", "image/webp"];
const patience = 30_000;

export async function readReceipt(file: File, type: string, today: string): Promise<ReceiptGuess | null> {
  if (!readable.includes(type)) return null;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return null;
  try {
    const reading = start().then(w => w.recognize(file));
    const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), patience));
    const result = await Promise.race([reading, timeout]);
    return result ? readReceiptText(result.data.text, today) : null;
  } catch {
    return null;
  }
}
