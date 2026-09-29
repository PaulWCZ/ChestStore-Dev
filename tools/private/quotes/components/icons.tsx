import type { ReactNode } from "react";

// The tool's own icons: fine 24-unit strokes in the text's colour, like a
// pen line. Decorative (aria-hidden): every control that shows one also has
// words.
function Icon({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>;
}

export const Plus = () => <Icon><path d="M12 5v14M5 12h14" /></Icon>;
export const Check = () => <Icon><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>;
export const Close = () => <Icon><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const Desk = () => <Icon><path d="M4 11l8-6.5 8 6.5M6 9.5V20h12V9.5" /></Icon>;
export const Quote = () => <Icon><path d="M6 3h9l3 3v15H6z" /><path d="M9 9h6M9 12.5h6M9 16h3.5" /></Icon>;
export const Invoice = () => <Icon><path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z" /><path d="M9 8h6M9 12h6M13 16h2" /></Icon>;
export const People = () => <Icon><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5" /><path d="M15.5 5.8a3 3 0 010 5.4M17 14.3c1.8.6 3 2.2 3.5 4.7" /></Icon>;
export const Box = () => <Icon><path d="M4 7.5L12 4l8 3.5v9L12 20l-8-3.5z" /><path d="M4 7.5L12 11l8-3.5M12 11v9" /></Icon>;
export const Download = () => <Icon><path d="M12 4v11M7 10l5 5 5-5M4 19h16" /></Icon>;
export const Gear = () => <Icon><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></Icon>;
export const Send = () => <Icon><path d="M4 12l16-8-6 16-3-7z" /><path d="M11 13l9-9" /></Icon>;
export const Seal = () => <Icon><circle cx="12" cy="11" r="6" /><path d="M9 16.5L8 21l4-2 4 2-1-4.5" /><path d="M9.8 11l1.6 1.6 2.8-3" /></Icon>;
export const Coins = () => <Icon><ellipse cx="10" cy="7" rx="6" ry="2.5" /><path d="M4 7v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V7" /><path d="M8 16.3c.6.1 1.3.2 2 .2 3.3 0 6-1.1 6-2.5M20 11v6c0 1.4-2.7 2.5-6 2.5-1.5 0-2.8-.2-3.9-.6" /></Icon>;
export const Copy = () => <Icon><rect x="8" y="8" width="12" height="12" rx="1.5" /><path d="M16 8V5.5A1.5 1.5 0 0014.5 4h-9A1.5 1.5 0 004 5.5v9A1.5 1.5 0 005.5 16H8" /></Icon>;
export const Trash = () => <Icon><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" /></Icon>;
export const Undo = () => <Icon><path d="M9 5L4 10l5 5" /><path d="M4 10h10a5 5 0 010 10h-3" /></Icon>;
export const Back = () => <Icon><path d="M15 5l-7 7 7 7" /></Icon>;
export const Arrow = () => <Icon><path d="M5 12h14M13 6l6 6-6 6" /></Icon>;
export const Alert = () => <Icon><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17h.01" /></Icon>;
export const Info = () => <Icon><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></Icon>;
export const Search = () => <Icon><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></Icon>;
export const Up = () => <Icon><path d="M6 14l6-6 6 6" /></Icon>;
export const Down = () => <Icon><path d="M6 10l6 6 6-6" /></Icon>;
export const Section = () => <Icon><path d="M5 6h14M5 12h9M5 18h11" /></Icon>;
export const Bell = () => <Icon><path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 004 0" /></Icon>;
export const Mail = () => <Icon><rect x="3.5" y="5.5" width="17" height="13" rx="1.5" /><path d="M4 7l8 6 8-6" /></Icon>;
export const Pen = () => <Icon><path d="M4 20l1-4L16 5l3 3L8 19z" /><path d="M14 7l3 3" /></Icon>;
export const Clock = () => <Icon><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></Icon>;
export const More = () => <Icon><circle cx="6" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="18" cy="12" r="1" /></Icon>;
export const Table = () => <Icon><rect x="4" y="5" width="16" height="14" rx="1.5" /><path d="M4 10h16M4 14.5h16M10 5v14" /></Icon>;
export const Zip = () => <Icon><path d="M6 3h12v18H6z" /><path d="M12 3v2M12 7v2M12 11v2M11 15h2v3h-2z" /></Icon>;
export const Repeat = () => <Icon><path d="M4 11V9a3 3 0 013-3h12M16 3l3 3-3 3" /><path d="M20 13v2a3 3 0 01-3 3H5M8 21l-3-3 3-3" /></Icon>;
export const Upload = () => <Icon><path d="M12 20V9M7 14l5-5 5 5M4 5h16" /></Icon>;

// The empty desk: a blank sheet with a seal, drawn larger.
export function BlankSheet() {
  return (
    <svg className="art" viewBox="0 0 96 96" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" focusable="false">
      <path d="M22 10h38l14 14v62H22z" fill="var(--paper)" />
      <path d="M60 10v14h14" />
      <path d="M31 38h34M31 46h34M31 54h22" strokeDasharray="2 3" />
      <circle cx="64" cy="72" r="9" stroke="var(--accent)" strokeWidth="2" />
      <path d="M60.5 72l2.5 2.5 4.5-5" stroke="var(--accent)" strokeWidth="2" />
    </svg>
  );
}
