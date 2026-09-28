// The address people reach the wiki at (the Chest's team host), for the
// links an export writes back to it. The Chest's front sets the forwarded
// host; only a plain host name (and port) is taken from it.
export function origin(request: Request): string {
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? new URL(request.url).host;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "http" ? "http" : "https";
  return /^[a-z0-9.-]+(:[0-9]{1,5})?$/iu.test(host) ? `${proto}://${host}` : "";
}
