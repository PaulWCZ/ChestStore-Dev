// Safe in the browser (it runs there only): the keys an author of
// anonymous free texts keeps in their own browser, to read the replies to
// what they wrote (lib/replies.ts). A key is 32 random bytes in hex; the
// server receives only its SHA-256 with the text. Kept in localStorage per
// poll; another browser or a cleared one has none (README, "Anonymous
// polls").
const storeKey = "polls:reply-keys";

const hex = (bytes: Uint8Array) => [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");

export function newKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return hex(bytes);
}

// hashOf: SHA-256 of the key's text, as the server computes it; null where
// the browser has no Web Crypto (a page not served over HTTPS).
export async function hashOf(key: string): Promise<string | null> {
  try {
    return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key))));
  } catch {
    return null;
  }
}

function read(): Record<string, string[]> {
  try {
    const value = JSON.parse(window.localStorage.getItem(storeKey) ?? "{}") as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, string[]> : {};
  } catch {
    return {};
  }
}

export function keysFor(pollId: string): string[] {
  const found = read()[pollId];
  return Array.isArray(found) ? found.filter(k => typeof k === "string" && /^[0-9a-f]{64}$/u.test(k)).slice(0, 20) : [];
}

export function keep(pollId: string, keys: string[]): void {
  if (keys.length === 0) return;
  try {
    const all = read();
    all[pollId] = [...new Set([...(all[pollId] ?? []), ...keys])].slice(0, 20);
    window.localStorage.setItem(storeKey, JSON.stringify(all));
  } catch {
    // Private browsing, storage full: no replies will reach this answer.
  }
}
