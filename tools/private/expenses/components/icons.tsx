import type { ReactNode } from "react";

// The tool's own icons: simple 24-unit strokes in the text's colour.
// Decorative (aria-hidden): every control that shows one also has words.
function Icon({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>;
}

export const Plus = () => <Icon><path d="M12 5v14M5 12h14" /></Icon>;
export const Check = () => <Icon><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>;
export const Close = () => <Icon><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const Camera = () => <Icon><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></Icon>;
export const FileIcon = () => <Icon><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 13h6M9 17h6" /></Icon>;
export const Receipt = () => <Icon><path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z" /><path d="M9 8h6M9 12h6M9 16h3" /></Icon>;
export const Car = () => <Icon><path d="M4 16v-4l2-5h12l2 5v4z" /><path d="M4 12h16M6 16v2M18 16v2" /><circle cx="8" cy="13.5" r=".6" /><circle cx="16" cy="13.5" r=".6" /></Icon>;
export const Send = () => <Icon><path d="M4 12l16-8-6 16-3-7z" /><path d="M11 13l9-9" /></Icon>;
export const Download = () => <Icon><path d="M12 4v11M7 10l5 5 5-5M4 19h16" /></Icon>;
export const Gear = () => <Icon><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></Icon>;
export const Stamp = () => <Icon><path d="M9 4h6l-1 7h-4z" /><path d="M5 14h14v3H5zM5 20h14" /></Icon>;
export const Wallet = () => <Icon><path d="M4 7h14a2 2 0 012 2v9H4z" /><path d="M4 7l11-3v3M16 12.5h4" /></Icon>;
export const Card = () => <Icon><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18M7 15h3" /></Icon>;
export const Home = () => <Icon><path d="M4 11l8-6.5 8 6.5M6 9.5V20h12V9.5" /></Icon>;
export const Back = () => <Icon><path d="M15 5l-7 7 7 7" /></Icon>;
export const Alert = () => <Icon><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17h.01" /></Icon>;
export const Trash = () => <Icon><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" /></Icon>;
export const Pencil = () => <Icon><path d="M4 20l1-4L16 5l3 3L8 19z" /></Icon>;
export const Pin = () => <Icon><path d="M12 21s-6-5.5-6-10a6 6 0 0112 0c0 4.5-6 10-6 10z" /><circle cx="12" cy="11" r="2" /></Icon>;
export const Arrow = () => <Icon><path d="M5 12h14M13 6l6 6-6 6" /></Icon>;
export const Clock = () => <Icon><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></Icon>;
export const Table = () => <Icon><rect x="4" y="5" width="16" height="14" rx="1.5" /><path d="M4 10h16M4 14.5h16M10 5v14" /></Icon>;
export const Zip = () => <Icon><path d="M6 3h12v18H6z" /><path d="M12 3v2M12 7v2M12 11v2M11 15h2v3h-2z" /></Icon>;
export const Calendar = () => <Icon><rect x="4" y="5.5" width="16" height="14.5" rx="1.5" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4M8 14h2M12 14h2M8 17h2" /></Icon>;
