import type { Look } from "@argentic/chest-ui/runtime";
import { Mark } from "./mark.tsx";

// The mark beside the tool's name: the company's logo when the Chest gives
// its brand (served by the Chest on this origin), the tool's own otherwise.
export function BrandMark({ look }: { look: Look }) {
  if (look.logo) return <img className="logo" src={look.logo.url} alt={look.logo.alt} />;
  return <Mark />;
}
