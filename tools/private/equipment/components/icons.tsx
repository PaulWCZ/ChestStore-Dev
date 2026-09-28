import type { ReactNode } from "react";
import type { IconName } from "../lib/model.ts";

// The tool's own icons: simple 24-unit strokes in the text's colour.
// Decorative (aria-hidden): every control that shows one also has words.
function Icon({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>;
}

export const Plus = () => <Icon><path d="M12 5v14M5 12h14" /></Icon>;
export const Check = () => <Icon><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>;
export const Close = () => <Icon><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const Search = () => <Icon><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></Icon>;
export const Back = () => <Icon><path d="M15 5l-7 7 7 7" /></Icon>;
export const Chevron = () => <Icon><path d="M9 5l7 7-7 7" /></Icon>;
export const Dots = () => <Icon><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></Icon>;
export const Gauge = () => <Icon><path d="M4 16a8 8 0 1116 0" /><path d="M12 16l4-5" /><path d="M4 20h16" /></Icon>;
export const Shelves = () => <Icon><path d="M4 3v18M20 3v18M4 9h16M4 15h16" /><rect x="7" y="5" width="4" height="4" /><rect x="13" y="11" width="4" height="4" /></Icon>;
export const People = () => <Icon><circle cx="9" cy="8.5" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0M16 5.5a3.5 3.5 0 010 7M18 14.5a6.5 6.5 0 013.5 5.5" /></Icon>;
export const Person = () => <Icon><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5a7.5 7.5 0 0115 0" /></Icon>;
export const Print = () => <Icon><path d="M7 9V3.5h10V9" /><rect x="3.5" y="9" width="17" height="8" rx="1.5" /><path d="M7 14h10v6.5H7z" /></Icon>;
export const Upload = () => <Icon><path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4" /></Icon>;
export const Download = () => <Icon><path d="M12 4v12M7 11l5 5 5-5M4 20h16" /></Icon>;
export const Give = () => <Icon><path d="M4 12h12M12 7l5 5-5 5" /><path d="M20 5v14" /></Icon>;
export const TakeBack = () => <Icon><path d="M20 12H8M12 7l-5 5 5 5" /><path d="M4 5v14" /></Icon>;
export const Alert = () => <Icon><path d="M12 3.5l9.5 16.5h-19z" /><path d="M12 10v4.5M12 17.5h.01" /></Icon>;
export const Clock = () => <Icon><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Icon>;
export const Photo = () => <Icon><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M8.5 6l1.5-2.5h4L15.5 6" /><circle cx="12" cy="13" r="3.5" /></Icon>;
export const Trash = () => <Icon><path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13" /></Icon>;
export const Pencil = () => <Icon><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></Icon>;
export const Qr = () => <Icon><rect x="4" y="4" width="6" height="6" /><rect x="14" y="4" width="6" height="6" /><rect x="4" y="14" width="6" height="6" /><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" /></Icon>;
export const Sliders = () => <Icon><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></Icon>;
export const Wrench = () => <Icon><path d="M14.5 5.5a4 4 0 00-5.2 5.2L4 16l4 4 5.3-5.3a4 4 0 005.2-5.2l-2.7 2.7-2.6-.7-.7-2.6z" /></Icon>;
export const Seat = () => <Icon><circle cx="12" cy="7.5" r="3" /><path d="M6 20v-3a6 6 0 0112 0v3M3 20h18" /></Icon>;

// The icons a category may wear (lib/model.ts icons).
const shapes: Record<IconName, ReactNode> = {
  laptop: (<><rect x="5" y="5" width="14" height="10" rx="1.2" /><path d="M2.5 18.5h19l-1.5-3.5h-16z" /></>),
  phone: (<><rect x="7" y="2.5" width="10" height="19" rx="2.2" /><path d="M11 18.5h2" /></>),
  screen: (<><rect x="2.5" y="4" width="19" height="12.5" rx="1.5" /><path d="M9 20.5h6M12 16.5v4" /></>),
  tablet: (<><rect x="4.5" y="3" width="15" height="18" rx="2" /><path d="M11 18h2" /></>),
  keyboard: (<><rect x="2.5" y="7" width="19" height="10" rx="1.5" /><path d="M6 10.5h.01M9 10.5h.01M12 10.5h.01M15 10.5h.01M18 10.5h.01M7.5 14h9" /></>),
  headset: (<><path d="M4 15v-3a8 8 0 0116 0v3" /><rect x="3" y="14" width="4.5" height="6" rx="1.5" /><rect x="16.5" y="14" width="4.5" height="6" rx="1.5" /></>),
  licence: (<><path d="M6 3h8.5L19 7.5V21H6z" /><path d="M14 3v5h5" /><circle cx="12" cy="13.5" r="2.2" /><path d="M10.5 15.5l-1 3.5 2.5-1.2 2.5 1.2-1-3.5" /></>),
  key: (<><circle cx="8" cy="15" r="4.5" /><path d="M11.2 11.8L20 3M16.5 6.5l2.5 2.5M14 9l2 2" /></>),
  badge: (<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9.5 4V2.5h5V4" /><circle cx="12" cy="10.5" r="2.5" /><path d="M8 17a4 4 0 018 0" /></>),
  car: (<><path d="M4 16v-4l2-5h12l2 5v4z" /><path d="M4 12h16" /><circle cx="7.5" cy="16.5" r="2" /><circle cx="16.5" cy="16.5" r="2" /></>),
  printer: (<><path d="M7 9V3.5h10V9" /><rect x="3.5" y="9" width="17" height="8" rx="1.5" /><path d="M7 14h10v6.5H7z" /></>),
  camera: (<><rect x="3" y="6.5" width="18" height="13" rx="2" /><path d="M8.5 6.5l1.5-2.5h4l1.5 2.5" /><circle cx="12" cy="13" r="3.5" /></>),
  chair: (<><path d="M7 3.5h10v8H7z" /><path d="M5.5 11.5h13v3h-13zM7 14.5V21M17 14.5V21" /></>),
  tool: (<><path d="M14.5 5.5a4 4 0 00-5.2 5.2L4 16l4 4 5.3-5.3a4 4 0 005.2-5.2l-2.7 2.7-2.6-.7-.7-2.6z" /></>),
  plug: (<><path d="M9 3v4M15 3v4M6.5 7h11v4a5.5 5.5 0 01-11 0zM12 16.5V21" /></>),
  box: (<><path d="M3.5 7.5L12 3.5l8.5 4v9L12 20.5l-8.5-4z" /><path d="M3.5 7.5L12 11.5l8.5-4M12 11.5v9" /></>),
};

export function CategoryIcon({ name }: { name: IconName }) {
  return <Icon>{shapes[name] ?? shapes.box}</Icon>;
}
