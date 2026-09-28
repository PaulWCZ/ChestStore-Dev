import type { CSSProperties } from "react";
import { initials } from "../lib/initials.ts";
import { tint } from "../lib/tint.ts";

// A person's portrait: their photo as the Chest serves it (or their
// initials), round; with `arch`, set in an arch of their team's colour, like
// a portrait on a gallery wall. Decorative: the name is always written
// beside it. The size is a CSS variable (--s), so a page may change it for
// small screens.
export function Portrait({ name, photo, size = 96, team, arch = false }: { name: string; photo: string | null; size?: number; team?: string; arch?: boolean }) {
  const style = { width: "var(--s)", height: "var(--s)", fontSize: "calc(var(--s) * 0.34)" };
  const face = photo
    ? <img className="portrait" src={photo} alt="" style={style} loading="lazy" decoding="async" />
    : <span className="portrait" aria-hidden="true" style={style}>{initials(name)}</span>;
  const size_ = { "--s": `${size}px` } as CSSProperties;
  if (!arch) return <span className="face" style={size_}>{face}</span>;
  return <span className={`arch tint-${tint(team || name)}`} style={size_} aria-hidden="true">{face}</span>;
}
