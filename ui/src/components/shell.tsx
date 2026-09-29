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
import { isCurrent, type CurrentRule } from "./lists.js";
import { en, type Language, type ShellWords } from "./words.js";

// A link component: plain <a> by default, or the framework's own. It
// returns a ReactNode (0.2.1; ReactElement before), so Next.js's `Link` —
// a forwardRef component — fits as it is: `link={Link}`, no wrapper, no cast.
export type LinkProps = { href: string; className?: string; "aria-current"?: "page" | "true"; hrefLang?: string; lang?: string; children: ReactNode };
export type LinkComponent = (props: LinkProps) => ReactNode;
const PlainLink: LinkComponent = props => <a {...props} />;

export type NavItem = {
  readonly href: string;
  readonly label: string;
  readonly icon?: ReactNode;
  // A true count (things waiting for this person), never a decoration.
  readonly count?: number;
  // Current only on this exact path (default: also on its sub-pages).
  readonly exact?: boolean;
  // "exact" or "prefix"; default "prefix", but "exact" for "/chest" (0.2.1).
  readonly match?: "exact" | "prefix";
  // Other path prefixes where this section is current too, e.g. a
  // "Bookings" tab on ["/chest/new", "/chest/b"] (0.2.1).
  readonly also?: readonly string[];
  // A class of the tool's own on this section's link (0.2.2).
  readonly className?: string;
};

const ruleOf = ({ exact, match, also }: { exact?: boolean | undefined; match?: "exact" | "prefix" | undefined; also?: readonly string[] | undefined }): CurrentRule => ({ ...(exact !== undefined ? { exact } : {}), ...(match ? { match } : {}), ...(also ? { also } : {}) });

// NavLink: a link that says when it is the page shown (aria-current).
// `match` and `also` as for a NavItem.
export function NavLink({ href, path, exact, match, also, className, link, children }: { href: string; path: string; exact?: boolean; match?: "exact" | "prefix"; also?: readonly string[]; className?: string; link?: LinkComponent; children: ReactNode }): ReactElement {
  const A = link ?? PlainLink;
  return <A href={href} {...(className ? { className } : {})} {...(isCurrent(path, href, ruleOf({ exact, match, also })) ? { "aria-current": "page" as const } : {})}>{children}</A>;
}

// Nav: the tool's sections as labelled tabs.
export function Nav({ items, path, label, link }: { items: readonly NavItem[]; path: string; label: string; link?: LinkComponent }): ReactElement {
  return (
    <nav className={`ck-nav ck-nav-${Math.min(items.length, 5)}`} aria-label={label}>
      <ul>
        {items.map(i => (
          <li key={i.href}>
            <NavLink href={i.href} path={path} {...ruleOf(i)} className={i.className ? `ck-nav-link ${i.className}` : "ck-nav-link"} {...(link ? { link } : {})}>
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
  // Where `tools` show (0.2.2): "all" (default), "wide" (hidden under
  // 760 px, where the sections take their row), "phone" (only there). For
  // one tool of several, the classes ck-wide-only and ck-phone-only.
  readonly toolsOn?: "all" | "wide" | "phone";
  readonly labels?: Pick<ShellWords, "skip" | "nav">;
  readonly link?: LinkComponent;
  // The page's width; "full" takes the header's content to the edges too (0.2.2).
  readonly width?: "narrow" | "normal" | "wide" | "full";
  readonly className?: string;
  readonly children?: ReactNode;
};

export function AppShell({ brand, nav = [], path = "", member, tools, toolsOn = "all", labels = en.shell, link, width = "normal", className, children }: AppShellProps): ReactElement {
  const toolsClass = toolsOn === "wide" ? " ck-wide-only" : toolsOn === "phone" ? " ck-phone-only" : "";
  return (
    <div className={`ck-shell ck-shell-${width}${className ? " " + className : ""}`}>
      <a className="ck-skip" href="#main">{labels.skip}</a>
      <header className="ck-bar">
        <div className="ck-bar-inner">
          <div className="ck-brand">{brand}</div>
          {nav.length > 0 && <div className="ck-bar-nav"><Nav items={nav} path={path} label={labels.nav} {...(link ? { link } : {})} /></div>}
          <div className="ck-bar-end">
            {tools ? (toolsClass ? <div className={`ck-bar-tools${toolsClass}`}>{tools}</div> : tools) : null}
            {member ? <MemberChip name={member.name} role={member.role ?? null} photo={member.photo ?? null} /> : null}
          </div>
        </div>
      </header>
      <main id="main" className={`ck-main ck-main-${width}`} tabIndex={-1}>{children}</main>
    </div>
  );
}

// PageHeader: the page's title, a line under it, and its main action.
// `size`: "l" (default, --text-2xl) for a section's page, "m" (--text-xl)
// for a denser page — a form, a record, a tool whose pages are many (0.2.1).
// `intro`: a sentence is a <p>; anything else (a line with a badge, two
// paragraphs) a <div> of the same look (0.2.2).
export function PageHeader({ title, intro, action, secondary, headingLevel = 1, size = "l", className }: { title: ReactNode; intro?: ReactNode; action?: ReactNode; secondary?: ReactNode; headingLevel?: 1 | 2; size?: "l" | "m"; className?: string }): ReactElement {
  const H = headingLevel === 1 ? "h1" : "h2";
  const plain = typeof intro === "string" || typeof intro === "number";
  return (
    <div className={`${size === "m" ? "ck-page-head ck-page-head-m" : "ck-page-head"}${className ? " " + className : ""}`}>
      <div className="ck-page-title">
        <H>{title}</H>
        {intro ? (plain ? <p className="ck-page-intro">{intro}</p> : <div className="ck-page-intro">{intro}</div>) : null}
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


// LanguageSwitch: the public part's visible switch (the members' part
// follows member.locale and has none). Each language is named in itself,
// never translated. Links to `href(code)` — by default /lang/<code>?back=…,
// a route of the tool that remembers the choice in a cookie. `href` may be
// a pattern with {code} ("/p/{code}/pricing"): plain data, so a server
// component passes it (a function it cannot) (0.2.2).
export function LanguageSwitch({ languages, current, label, back = "/", href, link, className }: { languages: readonly Language[]; current: string; label: string; back?: string; href?: string | ((code: string) => string); link?: LinkComponent; className?: string }): ReactElement {
  const A = link ?? PlainLink;
  const to = typeof href === "function" ? href : typeof href === "string" ? (code: string) => href.replaceAll("{code}", encodeURIComponent(code)) : (code: string) => `/lang/${code}?back=${encodeURIComponent(back)}`;
  return (
    <nav className={`ck-languages${className ? " " + className : ""}`} aria-label={label}>
      {languages.map(l => (
        <A key={l.code} href={to(l.code)} hrefLang={l.code} lang={l.code} className="ck-language" {...(l.code === current ? { "aria-current": "true" as const } : {})}>{l.name}</A>
      ))}
    </nav>
  );
}

// BrandMark: the company's logo when the Chest gives its brand (with its
// dark variant on dark pages), the tool's own mark otherwise.
// `ground` says what the logo sits on (0.2.1): "page" (default) follows the
// page's mode; "inverse" is the other mode's ground — a dark header in a
// light look, a light one in a dark look (the inverse pair, --ink ground);
// "dark" or "light" a ground that stays so in both modes.
export type LogoGround = "page" | "inverse" | "dark" | "light";
export function BrandMark({ logo, ground = "page", children }: { logo?: { readonly url: string; readonly alt: string; readonly dark?: string | null } | null; ground?: LogoGround; children?: ReactNode }): ReactElement {
  if (!logo) return <>{children}</>;
  const onDark = logo.dark ?? logo.url;
  const dark = "(prefers-color-scheme: dark)";
  // [the image shown by default (a light page), the one on a dark page]
  const [light, darkPage] = ground === "inverse" ? [onDark, logo.url] : ground === "dark" ? [onDark, onDark] : ground === "light" ? [logo.url, logo.url] : [logo.url, onDark];
  return (
    <picture className="ck-logo">
      {darkPage !== light ? <source srcSet={darkPage} media={dark} /> : null}
      <img src={light} alt={logo.alt} />
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
