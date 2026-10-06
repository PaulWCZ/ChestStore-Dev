// Files the public part hands out often, kept in the process by their
// SHA-256 (a quote's PDF as its client was shown it, the terms and
// conditions of sale): a fingerprint names its bytes for ever, so a copy
// kept is never stale. A client's page and its PDF are public: a burst of
// visitors (or a robot) must not turn into one call to the Chest's files
// per request — the first asks the Chest, the next are answered from here.
// Bounded (a few PDFs, 24 MiB at most of the tool's 256): the oldest goes
// first. Nothing here must survive a sleep: a cold process asks the Chest
// again.
export const keptLimits = { totalBytes: 24 << 20, fileBytes: 8 << 20 } as const;

const files = new Map<string, Uint8Array>();
let total = 0;

export function recall(sha256: string): Uint8Array | null {
  const found = files.get(sha256);
  if (!found) return null;
  // The most recently used stays longest.
  files.delete(sha256);
  files.set(sha256, found);
  return found;
}

export function remember(sha256: string, bytes: Uint8Array): void {
  if (bytes.byteLength > keptLimits.fileBytes || files.has(sha256)) return;
  files.set(sha256, bytes);
  total += bytes.byteLength;
  for (const [key, value] of files) {
    if (total <= keptLimits.totalBytes) break;
    files.delete(key);
    total -= value.byteLength;
  }
}

// What is kept now (tests).
export const keptBytes = (): number => total;
export function forgetKept(): void {
  files.clear();
  total = 0;
}
