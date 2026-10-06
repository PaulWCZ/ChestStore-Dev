// The harness's TLS certificate: the two hosts are served over https, as a
// Chest serves them (the SDK reads https origins only in CHEST_TEAM_URL and
// CHEST_PUBLIC_URL, X-Forwarded-Proto is https, Secure and __Host- cookies
// work). Self-signed for 127.0.0.1 (the team host) and localhost (the
// public host), made once with openssl in lab/chest-dev/.cert (not
// committed). Browsers of flows, screens and audits accept it
// (ignoreHTTPSErrors); Node clients of this machine are told to with
// NODE_TLS_REJECT_UNAUTHORIZED=0 (only in lab scripts that talk to the
// harness).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), ".cert");

export function certificate() {
  const key = join(dir, "key.pem"), cert = join(dir, "cert.pem");
  if (!existsSync(key) || !existsSync(cert)) {
    mkdirSync(dir, { recursive: true });
    execFileSync("openssl", ["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-days", "3650", "-subj", "/CN=chest-dev", "-addext", "subjectAltName=IP:127.0.0.1,DNS:localhost", "-keyout", key, "-out", cert], { stdio: "ignore" });
  }
  return { key: readFileSync(key), cert: readFileSync(cert) };
}
