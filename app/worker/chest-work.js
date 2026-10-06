// The proof of work of a public form (@argentic/chest-app, bound.work):
// find n such that SHA-256(challenge + ":" + n) starts with `bits` zero
// bits. Served at /assets/chest-work.js (chestConfig), run in a Worker so
// the page stays responsive. No third party; the browser's own SHA-256.
const encoder = new TextEncoder();
function zeros(bytes, bits) {
  let i = 0;
  for (; bits >= 8; bits -= 8, i++) if (bytes[i] !== 0) return false;
  return bits === 0 || bytes[i] >> (8 - bits) === 0;
}
self.onmessage = async event => {
  const { challenge, bits } = event.data;
  for (let n = 0; n < 2 ** 32; n++) {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(`${challenge}:${n}`)));
    if (zeros(digest, bits)) {
      self.postMessage({ n });
      return;
    }
  }
};
