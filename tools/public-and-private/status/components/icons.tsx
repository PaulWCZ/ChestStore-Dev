import type { ReactNode } from "react";

// The tool's icons, drawn on a 24-unit grid with 2-unit strokes. Each
// state has its own shape, so a state never rests on colour alone.
function Icon({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true, focusable: "false" })}>
      {children}
    </svg>
  );
}

// Operational: a check in a circle.
export const Operational = ({ label }: { label?: string }) => (
  <Icon {...(label ? { label } : {})}><circle cx="12" cy="12" r="9.5" fill="currentColor" stroke="none" /><path d="m7.8 12.3 2.9 2.9 5.5-5.9" className="glyph" strokeWidth="2.4" /></Icon>
);
// Maintenance: a wrench in a circle.
export const Maintenance = ({ label }: { label?: string }) => (
  <Icon {...(label ? { label } : {})}><circle cx="12" cy="12" r="9.5" fill="currentColor" stroke="none" /><path d="M14.6 8.1a2.6 2.6 0 0 0-3.4 3.3l-3.6 3.6 1.4 1.4 3.6-3.6a2.6 2.6 0 0 0 3.3-3.4l-1.6 1.6-1.3-.3-.3-1.3z" className="glyph glyph-fill" strokeWidth="1" /></Icon>
);
// Degraded: a minus in a rounded square (slower, still up).
export const Degraded = ({ label }: { label?: string }) => (
  <Icon {...(label ? { label } : {})}><rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="currentColor" stroke="none" /><path d="M7.5 12h9" className="glyph" strokeWidth="2.6" /></Icon>
);
// Partial outage: an exclamation in a triangle.
export const Partial = ({ label }: { label?: string }) => (
  <Icon {...(label ? { label } : {})}><path d="M12 2.6 22.2 20.4H1.8z" fill="currentColor" stroke="currentColor" strokeWidth="1.6" /><path d="M12 9v5" className="glyph" strokeWidth="2.4" /><circle cx="12" cy="17.2" r="1.3" className="glyph-fill" stroke="none" /></Icon>
);
// Major outage: a cross in an octagon.
export const Major = ({ label }: { label?: string }) => (
  <Icon {...(label ? { label } : {})}><path d="M8.1 2.5h7.8l5.6 5.6v7.8l-5.6 5.6H8.1l-5.6-5.6V8.1z" fill="currentColor" stroke="none" /><path d="m8.6 8.6 6.8 6.8m0-6.8-6.8 6.8" className="glyph" strokeWidth="2.4" /></Icon>
);
export const NoData = () => (
  <Icon><circle cx="12" cy="12" r="8.5" strokeDasharray="3 3" /></Icon>
);

export const StateIcon = ({ state, label }: { state: string; label?: string }) => {
  const props = label ? { label } : {};
  if (state === "operational") return <Operational {...props} />;
  if (state === "maintenance") return <Maintenance {...props} />;
  if (state === "degraded") return <Degraded {...props} />;
  if (state === "partial") return <Partial {...props} />;
  if (state === "major") return <Major {...props} />;
  return <NoData />;
};

export const Plus = () => <Icon><path d="M12 5v14M5 12h14" /></Icon>;
export const Arrow = () => <Icon><path d="M5 12h14m-6-6 6 6-6 6" /></Icon>;
export const Back = () => <Icon><path d="M19 12H5m6 6-6-6 6-6" /></Icon>;
export const Up = () => <Icon><path d="m6 15 6-6 6 6" /></Icon>;
export const Down = () => <Icon><path d="m6 9 6 6 6-6" /></Icon>;
export const Pencil = () => <Icon><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></Icon>;
export const Trash = () => <Icon><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13" /></Icon>;
export const EyeOff = () => <Icon><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c5 0 9 5 9 7a9.7 9.7 0 0 1-2.7 3.6M6.3 6.3C4.3 7.7 3 10 3 12c0 2 4 7 9 7a9.4 9.4 0 0 0 4.4-1.1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></Icon>;
export const Eye = () => <Icon><path d="M3 12c0-2 4-7 9-7s9 5 9 7-4 7-9 7-9-5-9-7z" /><circle cx="12" cy="12" r="3" /></Icon>;
export const Rss = () => <Icon><path d="M5 5a14 14 0 0 1 14 14M5 11a8 8 0 0 1 8 8" /><circle cx="6" cy="18" r="1.4" fill="currentColor" /></Icon>;
export const Calendar = () => <Icon><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4m8-4v4" /></Icon>;
export const Mail = () => <Icon><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 6.5 8.5-6.5" /></Icon>;
export const External = () => <Icon><path d="M14 4h6v6m0-6-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></Icon>;
export const Clock = () => <Icon><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Icon>;
export const Pulse = () => <Icon><path d="M3 12h4l2.5-6 5 12L17 12h4" /></Icon>;
export const Bell = () => <Icon><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></Icon>;
export const Close = () => <Icon><path d="M6 6l12 12M18 6 6 18" /></Icon>;
export const Info = () => <Icon><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><circle cx="12" cy="8" r="0.8" fill="currentColor" /></Icon>;
// A padlock: for the team only.
export const Lock = () => <Icon><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Icon>;
