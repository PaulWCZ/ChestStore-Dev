"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

// On a phone: the folder shown, as a title that opens the list of folders,
// views and pages (a native menu: the phone's own, large and familiar).
export function FolderMenu({ label, options }: { label: string; options: { href: string; label: string; match?: string; view?: boolean }[] }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const here = options.find(o => {
    const [p = "", q = ""] = o.href.split("?");
    if (o.view) return path === "/chest" && q === params.toString();
    if (o.match) return path === "/chest" && !params.get("q") && !params.get("tag") && !params.get("priority") && (params.get("folder") ?? "unassigned") === o.match;
    return path === p || path.startsWith(p + "/");
  });
  return (
    <label className="folder-menu">
      <span className="visually-hidden">{label}</span>
      <select className="select" value={here?.href ?? ""} onChange={e => e.target.value && router.push(e.target.value)}>
        {!here && <option value="">{label}</option>}
        {options.map((o, i) => <option key={i} value={o.href}>{o.label}</option>)}
      </select>
    </label>
  );
}

// On a phone, the round "New ticket" button — on the inbox only, where it
// covers nothing one needs (never over a ticket's answer box).
export function Fab({ label, children }: { label: string; children: React.ReactNode }) {
  const path = usePathname();
  if (path !== "/chest") return null;
  return <a className="fab" href="/chest/new" aria-label={label}>{children}</a>;
}
