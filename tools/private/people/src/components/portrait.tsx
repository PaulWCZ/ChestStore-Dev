import { initials } from "@argentic/chest-ui/components/logic";
import { tint } from "../shared/tint.ts";

// A person's portrait where the face is the point — the directory's
// cards, the welcome cards, a profile, the org chart: their photo as the
// Chest serves it (or their initials), round, set in an arch of their
// team's colour like a portrait on a gallery wall. Everywhere else the
// kit's Avatar. Decorative: the name is always written beside it. The size
// is a class (s-56 … s-168: src/styles.css sets --s from it, no style
// attribute), so a page may change it for small screens.
export type PortraitSize = 56 | 72 | 96 | 104 | 112 | 168;
export function Portrait({ name, photo, size = 96, team }: { name: string; photo: string | null; size?: PortraitSize; team?: string }) {
  const face = photo
    ? <img className="portrait" src={photo} alt="" loading="lazy" decoding="async" />
    : <span className="portrait">{initials(name)}</span>;
  return <span className={`arch s-${size} cat-${tint(team || name)}`} aria-hidden="true">{face}</span>;
}
