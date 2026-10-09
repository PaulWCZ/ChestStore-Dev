import { format } from "../components/format.ts";

// A failed check in words: "unexpected answer (HTTP 503)". Browser-safe.
type Words = { errorTimeout: string; errorDns: string; errorTls: string; errorRefused: string; errorStatus: string; errorSlow: string };

export function checkError(t: Words, error: string | null, status: number | null, ms: number): string {
  if (error === "timeout") return t.errorTimeout;
  if (error === "dns") return t.errorDns;
  if (error === "tls") return t.errorTls;
  if (error === "refused") return t.errorRefused;
  if (error === "slow") return format(t.errorSlow, { ms });
  return format(t.errorStatus, { status: status ?? "—" });
}
