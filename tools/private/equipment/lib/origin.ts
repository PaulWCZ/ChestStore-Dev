import { chest } from "@argentic/chest-sdk/chest";

// The address of the tool's team host, for links that leave the page (the
// QR code of a label): the Chest's own (chest.teamUrl, a proposal of the
// SDK working copy), otherwise the host the request came to.
export function teamOrigin(headers: Headers): string {
  const given = chest.teamUrl;
  if (given) return given;
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0]!.trim().toLowerCase();
  if (!/^[a-z0-9.-]{1,253}(:[0-9]{1,5})?$/u.test(host)) return "";
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/u.test(host);
  const proto = headers.get("x-forwarded-proto") === "http" || local ? "http" : "https";
  return `${proto}://${host}`;
}
