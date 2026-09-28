import { randomBytes } from "node:crypto";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { connect } from "node:net";

// The outbound network of the tool, as the laboratory proves it: fixed
// targets only (tests/lab/service/lab-egress-linux.py and the names the
// proof writes in the VM's /etc/hosts), never an address a visitor gives.
// Each call goes through the Chest's proxy the way an ordinary Node tool
// does — fetch and node:http(s) read HTTP_PROXY/HTTPS_PROXY under
// NODE_USE_ENV_PROXY=1 — but for `direct`, which tries the network itself.
export const egressTargets = ["allowed", "allowed-tls", "undeclared", "loopback", "metadata", "private", "direct"] as const;
export type EgressTarget = (typeof egressTargets)[number];

// outcome: ok (an answer came through), refused (the Chest's proxy said
// no: its reason), untrusted (the tunnel opened, then the tool refused the
// site's certificate), failed (anything else: its code).
export type EgressResult = { target: EgressTarget; outcome: "ok" | "refused" | "untrusted" | "failed"; status?: number; reason?: string; code?: string; body?: string; proxy: string | null; token: string };

const lab = "egress.test";
const plain: Partial<Record<EgressTarget, string>> = { undeclared: "undeclared." + lab, loopback: "loopback.forbidden." + lab, metadata: "metadata.forbidden." + lab, private: "private.forbidden." + lab };
const deadline = 15000;
// The laboratory's target, reached without the proxy for `direct`.
const directAddress = "198.51.100.2";
const untrusted = new Set(["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "UNABLE_TO_GET_ISSUER_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT", "CERT_UNTRUSTED"]);

function reasonOf(response: IncomingMessage): string | undefined {
  const header = response.headers["chest-egress"];
  return typeof header === "string" ? /^refused; reason=([a-z-]{1,20})$/u.exec(header)?.[1] : undefined;
}
function codeOf(error: unknown): string {
  const code = (error as { code?: unknown; cause?: { code?: unknown } }).code ?? (error as { cause?: { code?: unknown } }).cause?.code;
  return typeof code === "string" && /^[A-Z0-9_]{1,64}$/u.test(code) ? code : "unknown";
}

// get asks a URL with node:http(s) and its default agent: through the proxy.
function get(url: string, secure: boolean): Promise<{ status: number; reason: string | undefined; body: string }> {
  return new Promise((resolve, reject) => {
    const req = (secure ? httpsRequest : httpRequest)(url, { timeout: deadline }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => { if (body.length < 64) body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, reason: reasonOf(res), body: body.slice(0, 64) }));
    });
    req.on("timeout", () => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    req.on("error", reject);
    req.end();
  });
}

// direct opens a connection to the laboratory's target without any proxy:
// the container has no network, so it fails.
function direct(): Promise<string> {
  return new Promise((resolve) => {
    const socket = connect({ host: directAddress, port: 80, timeout: deadline });
    socket.on("connect", () => { socket.destroy(); resolve("connected"); });
    socket.on("timeout", () => { socket.destroy(); resolve("ETIMEDOUT"); });
    socket.on("error", (error) => resolve(codeOf(error)));
  });
}

export async function egress(target: EgressTarget): Promise<EgressResult> {
  // A token in each query: the Chest's log must never hold it.
  const token = randomBytes(12).toString("hex");
  const result: EgressResult = { target, outcome: "failed", proxy: process.env["HTTP_PROXY"] ?? null, token };
  try {
    if (target === "direct") {
      const code = await direct();
      return code === "connected" ? { ...result, outcome: "ok" } : { ...result, code };
    }
    if (target === "allowed") {
      // fetch, as most tools reach an API.
      const response = await fetch("http://allowed." + lab + "/?token=" + token, { signal: AbortSignal.timeout(deadline), redirect: "manual" });
      const body = (await response.text()).slice(0, 64);
      return { ...result, outcome: response.ok ? "ok" : "failed", status: response.status, body };
    }
    if (target === "allowed-tls") {
      const answer = await get("https://allowed." + lab + "/?token=" + token, true);
      return { ...result, outcome: "ok", status: answer.status };
    }
    const answer = await get("http://" + plain[target] + "/?token=" + token, false);
    return { ...result, outcome: answer.reason ? "refused" : answer.status === 200 ? "ok" : "failed", status: answer.status, ...(answer.reason ? { reason: answer.reason } : {}) };
  } catch (error) {
    const code = codeOf(error);
    return { ...result, outcome: untrusted.has(code) ? "untrusted" : "failed", code };
  }
}
