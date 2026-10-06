import { call, navigate } from "@argentic/chest-app/client";
import { Menu } from "@argentic/chest-ui/components";
import { useState, useTransition } from "react";
import { Dots, Download, Gear, Lock, Pen, Plus, Upload } from "../components/icons.tsx";
import { NewPageDialog, type NewPageWords, type PageTarget } from "../components/new-page.tsx";
import { NewSpaceDialog, type NewSpaceWords } from "../components/new-space.tsx";

// The buttons of a page that open a dialog: "New page" (a space, a page, an
// empty wiki's first page, "My pages") and "New space". The icon is named,
// not passed (an island's props are data).
type Icon = "plus" | "pen" | "lock";
const iconOf = (name: Icon) => (name === "pen" ? <Pen /> : name === "lock" ? <Lock /> : <Plus />);

export function NewPageButton({ target, label, icon, className = "button", t }: { target: PageTarget; label: string; icon: Icon; className?: string; t: NewPageWords }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{iconOf(icon)}{label}</button>
      <NewPageDialog target={open ? target : null} onClose={() => setOpen(false)} t={t} />
    </>
  );
}

export function NewSpaceButton({ label, className = "button", t }: { label: string; className?: string; t: NewSpaceWords }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}><Plus />{label}</button>
      <NewSpaceDialog open={open} onClose={() => setOpen(false)} t={t} />
    </>
  );
}

// The one-click start of an empty wiki: an example handbook, in the
// editor's language, opened at its first page.
export function ExampleButton({ label, hint }: { label: string; hint: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="example">
      <button type="button" className="button big" disabled={pending} onClick={() => start(async () => {
        const result = await call("addExample", {}, { refresh: false, quiet: true });
        if (!result.ok) return setError(result.message);
        await navigate(`/chest/pages/${result.value.pageId}?example=1`);
      })}>{label}</button>
      <p className="muted">{hint}</p>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

// A "More" menu of links (a space's settings, import, export): the kit's
// Menu, which opens in the browser. Its items are data, their icons named.
export type LinkItem = { label: string; icon: "gear" | "upload" | "download"; href: string; download?: boolean };
const menuIcon = (name: LinkItem["icon"]) => (name === "gear" ? <Gear /> : name === "upload" ? <Upload /> : <Download />);
export function LinkMenu({ label, items }: { label: string; items: LinkItem[] }) {
  return <Menu label={label} icon={<Dots />} showLabel size="m" items={items.map(i => ({ label: i.label, icon: menuIcon(i.icon), href: i.href, ...(i.download ? { download: true } : {}) }))} />;
}
