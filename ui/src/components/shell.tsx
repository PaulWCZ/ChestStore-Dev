"use client";

// The frame of a tool's pages, and the one navigation rule of the store
// (reports/05-critique/_store.md §2.1–2.2):
// - the sections are labelled tabs, never icons alone, never hidden behind
//   a menu or a hamburger: in the header on a wide screen, in a row of
//   their own under it on a phone (five at most; icons above the words);
// - each page's main action sits at the top of the page: at the right of
//   its title on a wide screen, a full-width button under it on a phone
//   (PageHeader);
// - the member chip ("Camille · Manager") at the right of the header;
// - a person whose role gives nothing sees NoAccess, not an error.
//
// Links: plain <a> by default; a Next.js tool passes its <Link> and the
// current path (usePathname) through a small client component of its own.
import { useEffect, useRef, type ReactElement, type ReactNode } from "react";
import { Avatar } from "./avatar.js";
import { isCurrent } from "./lists.js";
import { en, type ShellWords } from "./words.js";

export type LinkComponent = (props: { href: string; className?: string; "aria-current"?: "page" | "true"; hrefLang?: string; lang?: string; children: ReactNode }) => ReactElement;
const PlainLink: LinkComponent = props => <a {...props} />;

export type NavItem = {
  readonly href: string;
  readonly label: string;
  readonly icon?: ReactNode;
  // A true count (things waiting for this person), never a decoration.
  readonly count?: number;
  // Current only on this exact path (default: also on its sub-pages).
  readonly exact?: boolean;
};

// NavLink: a link that says when it is the page shown (aria-current).
export function NavLink({ href, path, exact = false, className, link, children }: { href: string; path: string; exact?: boolean; className?: string; link?: LinkComponent; children: ReactNode }): ReactElement {
  const A = link ?? PlainLink;
  return <A href={href} {...(className ? { className } : {})} {...(isCurrent(path, href, exact) ? { "aria-current": "page" as const } : {})}>{children}</A>;
}

// Nav: the tool's sections as labelled tabs.
export function Nav({ items, path, label, link }: { items: readonly NavItem[]; path: string; label: string; link?: LinkComponent }): ReactElement {
  return (
    <nav className={`ck-nav ck-nav-${Math.min(items.length, 5)}`} aria-label={label}>
      <ul>
        {items.map(i => (
          <li key={i.href}>
            <NavLink href={i.href} path={path} exact={i.exact ?? false} className="ck-nav-link" {...(link ? { link } : {})}>
              {i.icon ? <span className="ck-nav-icon" aria-hidden="true">{i.icon}</span> : null}
              <span className="ck-nav-label">{i.label}</span>
              {i.count ? <span className="ck-count">{i.count}</span> : null}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// MemberChip: who is signed in, and as what.
export function MemberChip({ name, role, photo }: { name: string; role?: string | null; photo?: string | null }): ReactElement {
  return (
    <span className="ck-member">
      <span className="ck-member-text"><span className="ck-member-name">{name}</span>{role ? <span className="ck-member-role">{role}</span> : null}</span>
      <Avatar name={name} photo={photo ?? null} size="m" />
    </span>
  );
}

export type AppShellProps = {
  // The tool's mark and name (a link to its home), or the company's logo.
  readonly brand: ReactNode;
  readonly nav?: readonly NavItem[];
  readonly path?: string;
  readonly member?: { readonly name: string; readonly role?: string | null; readonly photo?: string | null } | null;
  // Things at the right of the header before the member (a search box on
  // a wide screen, a bell count).
  readonly tools?: ReactNode;
  readonly labels?: Pick<ShellWords, "skip" | "nav">;
  readonly link?: LinkComponent;
  readonly width?: "narrow" | "normal" | "wide" | "full";
  readonly children?: ReactNode;
};

export function AppShell({ brand, nav = [], path = "", member, tools, labels = en.shell, link, width = "normal", children }: AppShellProps): ReactElement {
  return (
    <div className="ck-shell">
      <a className="ck-skip" href="#main">{labels.skip}</a>
      <header className="ck-bar">
        <div className="ck-bar-inner">
          <div className="ck-brand">{brand}</div>
          {nav.length > 0 && <div className="ck-bar-nav"><Nav items={nav} path={path} label={labels.nav} {...(link ? { link } : {})} /></div>}
          <div className="ck-bar-end">
            {tools}
            {member ? <MemberChip name={member.name} role={member.role ?? null} photo={member.photo ?? null} /> : null}
          </div>
        </div>
      </header>
      <main id="main" className={`ck-main ck-main-${width}`} tabIndex={-1}>{children}</main>
    </div>
  );
}

// PageHeader: the page's title, a line under it, and its main action.
export function PageHeader({ title, intro, action, secondary, headingLevel = 1 }: { title: ReactNode; intro?: ReactNode; action?: ReactNode; secondary?: ReactNode; headingLevel?: 1 | 2 }): ReactElement {
  const H = headingLevel === 1 ? "h1" : "h2";
  return (
    <div className="ck-page-head">
      <div className="ck-page-title">
        <H>{title}</H>
        {intro ? <p className="ck-page-intro">{intro}</p> : null}
      </div>
      {(action || secondary) && <div className="ck-page-actions">{secondary}{action}</div>}
    </div>
  );
}

// NoAccess: the member reached the tool, but their role gives nothing.
export function NoAccess({ labels = en.shell, title, body, action }: { labels?: Pick<ShellWords, "noAccessTitle" | "noAccessBody">; title?: ReactNode; body?: ReactNode; action?: ReactNode }): ReactElement {
  return (
    <div className="ck-empty ck-no-access">
      <h1 className="ck-empty-title">{title ?? labels.noAccessTitle}</h1>
      <p className="ck-empty-body">{body ?? labels.noAccessBody}</p>
      {action ? <div className="ck-empty-actions">{action}</div> : null}
    </div>
  );
}

export type Language = { readonly code: string; readonly name: string };

// LanguageSwitch: the public part's visible switch (the members' part
// follows member.locale and has none). Each language is named in itself,
// never translated. Links to `href(code)` — by default /lang/<code>?back=…,
// a route of the tool that remembers the choice in a cookie.
export function LanguageSwitch({ languages, current, label, back = "/", href, link }: { languages: readonly Language[]; current: string; label: string; back?: string; href?: (code: string) => string; link?: LinkComponent }): ReactElement {
  const A = link ?? PlainLink;
  const to = href ?? ((code: string) => `/lang/${code}?back=${encodeURIComponent(back)}`);
  return (
    <nav className="ck-languages" aria-label={label}>
      {languages.map(l => (
        <A key={l.code} href={to(l.code)} hrefLang={l.code} lang={l.code} className="ck-language" {...(l.code === current ? { "aria-current": "true" as const } : {})}>{l.name}</A>
      ))}
    </nav>
  );
}

// The languages the store's tools speak today, each named in itself.
export const storeLanguages: readonly Language[] = [
  { code: "en", name: "English" },
  { code: "fr", name: "Français" },
];

// BrandMark: the company's logo when the Chest gives its brand (with its
// dark variant on dark pages), the tool's own mark otherwise.
export function BrandMark({ logo, children }: { logo?: { readonly url: string; readonly alt: string; readonly dark?: string | null } | null; children?: ReactNode }): ReactElement {
  if (!logo) return <>{children}</>;
  return (
    <picture className="ck-logo">
      {logo.dark ? <source srcSet={logo.dark} media="(prefers-color-scheme: dark)" /> : null}
      <img src={logo.url} alt={logo.alt} />
    </picture>
  );
}

// useAutoRefresh: the Chest has no WebSocket, so a page others change reads
// itself again every few seconds while it is visible, and at once when it
// becomes visible again. `refresh` is the tool's (Next.js: router.refresh).
export function useAutoRefresh(refresh: () => void, seconds = 20): void {
  // The latest function, without restarting the timer at each render.
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    const refresh = () => latest.current();
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      clearInterval(timer);
      if (document.visibilityState === "visible") timer = setInterval(refresh, seconds * 1000);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
      start();
    };
    start();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [seconds]);
}

// AutoRefresh: the same as a component (render it in a client component
// that has the refresh function).
export function AutoRefresh({ refresh, seconds = 20 }: { refresh: () => void; seconds?: number }): null {
  useAutoRefresh(refresh, seconds);
  return null;
}
