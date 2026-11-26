import { EmptyState } from "@argentic/chest-ui/components";
import type { ComponentProps } from "react";
import { Contours } from "./contours.tsx";

// An empty place of the map: the kit's empty state (what the place is for,
// the first action only for who may act), over the trail map's contour
// lines — Goals' own touch, decoration only.
export function MapEmpty(props: ComponentProps<typeof EmptyState>) {
  return (
    <div className="map-empty">
      <Contours variant="small" />
      <EmptyState {...props} />
    </div>
  );
}
