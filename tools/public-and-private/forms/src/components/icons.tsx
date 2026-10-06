import type { ReactNode } from "react";
import type { Kind } from "../shared/model.ts";

// Icons drawn for this tool: 24-unit grid, 1.8 strokes, round ends. They
// take the size of their text (globals.css) and are hidden from screen
// readers — the words beside them say what they mean.
function Icon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>
      {children}
    </svg>
  );
}

export const Plus = () => <Icon><path d="M12 5v14M5 12h14" /></Icon>;
export const Close = () => <Icon><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const Check = () => <Icon><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>;
export const Up = () => <Icon><path d="M6 14l6-6 6 6" /></Icon>;
export const Down = () => <Icon><path d="M6 10l6 6 6-6" /></Icon>;
export const Back = () => <Icon><path d="M15 6l-6 6 6 6" /></Icon>;
export const Next = () => <Icon><path d="M9 6l6 6-6 6" /></Icon>;
export const Arrow = () => <Icon><path d="M5 12h14M13 6l6 6-6 6" /></Icon>;
export const Copy = () => <Icon><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" /></Icon>;
export const Trash = () => <Icon><path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l1 12a2 2 0 0 0 2 2h5a2 2 0 0 0 2-2l1-12M9 7V4.5h6V7" /></Icon>;
export const Eye = () => <Icon><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></Icon>;
export const Link = () => <Icon><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></Icon>;
export const Users = () => <Icon><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><path d="M15.5 5.6a3.2 3.2 0 0 1 0 6.1M17.5 14.3c1.7.6 2.8 2.2 3 4.7" /></Icon>;
export const Globe = () => <Icon><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.4 2.3 3.5 5.2 3.5 8.5s-1.1 6.2-3.5 8.5c-2.4-2.3-3.5-5.2-3.5-8.5S9.6 5.8 12 3.5Z" /></Icon>;
export const Mask = () => <Icon><path d="M3.5 7.5c5.5-2 11.5-2 17 0 0 6-3 10-8.5 10S3.5 13.5 3.5 7.5Z" /><path d="M8 11.5c.8-.7 2-.7 2.8 0M13.2 11.5c.8-.7 2-.7 2.8 0" /></Icon>;
export const Bell = () => <Icon><path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14l1.5-2Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></Icon>;
export const Download = () => <Icon><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" /></Icon>;
export const Search = () => <Icon><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5" /></Icon>;
export const Branch = () => <Icon><circle cx="6" cy="5.5" r="2" /><circle cx="6" cy="18.5" r="2" /><circle cx="18" cy="9" r="2" /><path d="M6 7.5v9M6 13c0-2.5 2-4 5-4h5" /></Icon>;
export const Page = () => <Icon><path d="M7 3.5h7l4 4v13H7Z" /><path d="M14 3.5v4h4" /></Icon>;
export const Settings = () => <Icon><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2.1 1.2M17.7 15.3l2.1 1.2M4.2 16.5l2.1-1.2M17.7 8.7l2.1-1.2" /></Icon>;
export const Chart = () => <Icon><path d="M4 20h16" /><rect x="5.5" y="11" width="3" height="6.5" rx="1" /><rect x="10.5" y="6.5" width="3" height="11" rx="1" /><rect x="15.5" y="13.5" width="3" height="4" rx="1" /></Icon>;
export const Inbox = () => <Icon><path d="M3.5 13.5 6 5.5h12l2.5 8v5h-17Z" /><path d="M3.5 13.5h5l1.5 2.5h4l1.5-2.5h5" /></Icon>;
export const Pencil = () => <Icon><path d="M15.5 4.5l4 4L9 19H5v-4Z" /><path d="M13.5 6.5l4 4" /></Icon>;
export const More = () => <Icon><circle cx="5.5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="18.5" cy="12" r="1" /></Icon>;
export const Shield = () => <Icon><path d="M12 3.5 19 6v5.5c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6Z" /><path d="M9 12l2 2 4-4" /></Icon>;
export const Grip = () => <Icon><circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" /></Icon>;
export const Paperclip = () => <Icon><path d="M19 11.5 12 18.5a4.5 4.5 0 0 1-6.4-6.4l7.4-7.4a3 3 0 0 1 4.3 4.3L9.9 16.3a1.5 1.5 0 0 1-2.1-2.1L14.5 7.5" /></Icon>;
export const Sparkle = () => <Icon><path d="M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5Z" /><path d="M18.5 16.5c.2 1.4.8 2 2 2.2-1.2.2-1.8.8-2 2.2-.2-1.4-.8-2-2-2.2 1.2-.2 1.8-.8 2-2.2Z" /></Icon>;

export const Picture = () => <Icon><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.8" /><path d="M4 17.5l5-4.5 3.5 3 3-2.5 4.5 4" /></Icon>;
export const Languages = () => <Icon><path d="M4 5.5h9M8.5 3.5v2M11 5.5c-.8 3.8-3.4 6.8-6.5 8.5M6.5 9c1 1.9 2.8 3.6 4.8 4.6" /><path d="M13 20.5l4-9 4 9M14.4 17.5h5.2" /></Icon>;
export const Restore = () => <Icon><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9" /><path d="M4.5 4.5V9H9" /></Icon>;
export const Zip = () => <Icon><path d="M6 3.5h8l4 4v13H6Z" /><path d="M10 3.5v2M12 5.5v2M10 7.5v2M12 9.5v2M10 11.5v2" /><rect x="9.5" y="14" width="3" height="3.5" rx="1" /></Icon>;

export function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="star-icon">
      <path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8Z" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

// One icon per kind of question: what the builder's type menu and cards show.
const kindPaths: Record<Kind, ReactNode> = {
  short: (<path d="M4 9.5h16M4 14.5h9" />),
  long: (<><path d="M4 6.5h16M4 11h16M4 15.5h16M4 20h9" /></>),
  email: (<><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="M4.5 7l7.5 6 7.5-6" /></>),
  phone: (<path d="M8 3.5h3l1.5 4-2 1.5a10 10 0 0 0 4.5 4.5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A15.5 15.5 0 0 1 4 5.5a2 2 0 0 1 2-2Z" />),
  number: (<path d="M9 4 7 20M17 4l-2 16M4.5 9h16M3.5 15h16" />),
  choice: (<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" fill="currentColor" /></>),
  choices: (<><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M8 12.5l3 3 5-6" /></>),
  dropdown: (<><rect x="3.5" y="6" width="17" height="12" rx="3" /><path d="M13.5 11l2 2 2-2" /></>),
  picture: (<><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.8" /><path d="M4 17.5l5-4.5 3.5 3 3-2.5 4.5 4" /></>),
  matrix: (<><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M3.5 9.5h17M3.5 14.5h17M10 4.5v15" /><circle cx="14" cy="12" r="1" fill="currentColor" /><circle cx="17" cy="17" r="1" fill="currentColor" /></>),
  ranking: (<><path d="M9 6.5h11M9 12h8M9 17.5h5" /><path d="M4 5l1.5-1v5M3.8 13.2c.4-.9 2.4-1 2.4.3 0 1-2.4 2-2.4 3h2.5" /></>),
  yesno: (<><path d="M4 12.5l3.5 3.5L14 9" /><path d="M16 9l5 5M21 9l-5 5" /></>),
  rating: (<path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8Z" />),
  scale: (<><path d="M3.5 17h17" /><path d="M5 17v-3M9 17v-5M13 17v-7M17 17V8" /><path d="M20 17V6" /></>),
  date: (<><rect x="4" y="5.5" width="16" height="14.5" rx="2.5" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></>),
  file: (<path d="M19 11.5 12 18.5a4.5 4.5 0 0 1-6.4-6.4l7.4-7.4a3 3 0 0 1 4.3 4.3L9.9 16.3a1.5 1.5 0 0 1-2.1-2.1L14.5 7.5" />),
  statement: (<><path d="M6 5.5h12M12 5.5V19" /><path d="M9 19h6" /></>),
};
export function KindIcon({ kind }: { kind: Kind }) {
  return <Icon className={"kind-icon kind-" + kind}>{kindPaths[kind]}</Icon>;
}
