import type { ReactNode } from "react";

// The tool's own icons: precise 24-unit strokes, square ends, in the text's
// colour. Decorative (aria-hidden): every control that shows one also has
// words.
function Icon({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" focusable="false">{children}</svg>;
}

export const Play = () => <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor" /></svg>;
export const Stop = () => <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" /></svg>;
export const Grid = () => <Icon><path d="M3.5 4.5h17v15h-17zM3.5 9.5h17M3.5 14.5h17M9 4.5v15" /></Icon>;
export const Bars = () => <Icon><path d="M4 20h16M6.5 16.5v-5M11 16.5V6M15.5 16.5v-8M20 16.5v-3" /></Icon>;
export const Folder = () => <Icon><path d="M3.5 6.5h6l2 2h9v10h-17z" /></Icon>;
export const Gear = () => <Icon><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><path d="M13 4.5v5h4v-5zM7 14.5v5h4v-5z" /></Icon>;
export const Plus = () => <Icon><path d="M12 5v14M5 12h14" /></Icon>;
export const Close = () => <Icon><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const Back = () => <Icon><path d="M14.5 5.5L8 12l6.5 6.5" /></Icon>;
export const Next = () => <Icon><path d="M9.5 5.5L16 12l-6.5 6.5" /></Icon>;
export const Lock = () => <Icon><path d="M5.5 10.5h13v9h-13zM8.5 10.5V7.5a3.5 3.5 0 017 0v3" /></Icon>;
export const Trash = () => <Icon><path d="M4.5 6.5h15M9.5 6.5v-2h5v2M6.5 6.5l1 13h9l1-13M10.5 10v6M13.5 10v6" /></Icon>;
export const Pencil = () => <Icon><path d="M4.5 19.5l1-4.5 10-10 3.5 3.5-10 10z" /><path d="M13.5 7l3.5 3.5" /></Icon>;
export const Copy = () => <Icon><path d="M8.5 8.5h11v11h-11z" /><path d="M15.5 8.5v-4h-11v11h4" /></Icon>;
export const Download = () => <Icon><path d="M12 4v11M7 10.5l5 5 5-5M4.5 19.5h15" /></Icon>;
export const Upload = () => <Icon><path d="M12 16V5M7 9.5l5-5 5 5M4.5 19.5h15" /></Icon>;
export const Check = () => <Icon><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>;
export const Coin = () => <Icon><circle cx="12" cy="12" r="8" /><path d="M14.5 9.2a2.8 2.8 0 00-2.5-1.2c-1.5 0-2.7.8-2.7 2 0 2.7 5.6 1.3 5.6 4 0 1.2-1.3 2-2.9 2a3 3 0 01-2.6-1.3M12 6.5v1.5M12 16v1.5" /></Icon>;
export const Stopwatch = () => <Icon><circle cx="12" cy="13.5" r="7" /><path d="M10 3.5h4M12 3.5v3M12 13.5V9.5M18 7.5l1.5-1.5" /></Icon>;
