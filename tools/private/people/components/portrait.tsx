import { initials } from "@argentic/chest-ui/components/logic";
import type { CSSProperties } from "react";
import { tint } from "../lib/tint.ts";

// A person's portrait where the face is the point — the directory's
// cards, the welcome cards, a profile, the org chart: their photo as the
// Chest serves it (or their initials), round, set in an arch of their
// team's colour like a portrait on a gallery wall. Everywhere else the
// kit's Avatar. Decorative: the name is always written beside it. The size
// is a CSS variable (--s), so a page may change it for small screens.
export function Portrait({ name, photo, size = 96, team }: { name: string; photo: string | null; size?: number; team?: string }) {
  const face = photo
    ? <img className="portrait" src={photo} alt="" loading="lazy" decoding="async" />
    : <span className="portrait">{initials(name)}</span>;
  return <span className={`arch cat-${tint(team || name)}`} style={{ "--s": `${size}px` } as CSSProperties} aria-hidden="true">{face}</span>;
}
