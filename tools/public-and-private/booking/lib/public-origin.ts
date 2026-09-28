// The public host's address, from a request on either host. The team host
// is <tool>-chest.<chest>, the public one <tool>.<chest> (reference:
// Chest addresses). The Chest does not give it to the tool yet (see the
// SDK report): we derive it, and remember the last one seen for emails
// written outside a request (received mail).
export function publicOrigin(headers: Headers, tool = process.env["CHEST_TOOL"] ?? ""): string | null {
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0]!.trim().toLowerCase();
  if (!/^[a-z0-9.-]{1,253}(:[0-9]{1,5})?$/u.test(host)) return null;
  const proto = headers.get("x-forwarded-proto") === "http" ? "http" : "https";
  const team = tool + "-chest.";
  return `${proto}://${host.startsWith(team) ? tool + "." + host.slice(team.length) : host}`;
}

// visitorKey is what the form's counters know of a visitor: the first
// address of X-Forwarded-For (set by the Chest's front), else nothing.
export function visitorKey(headers: Headers): string {
  return (headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim().slice(0, 64) || "unknown";
}
