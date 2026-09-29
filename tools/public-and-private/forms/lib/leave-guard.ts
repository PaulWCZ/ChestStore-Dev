// Safe in the browser: no SDK here.
// A page with changes not saved yet says how to save them; the tool's tabs
// and links wait for that before they leave (components/guarded-link.tsx), so
// switching tab never throws an edit away. One page holds it at a time.
type Flush = () => Promise<boolean>;
let held: Flush | null = null;

export function holdLeaving(flush: Flush): () => void {
  held = flush;
  return () => {
    if (held === flush) held = null;
  };
}

// beforeLeaving saves what waits; false when it could not be saved (the
// page stays, and says why).
export async function beforeLeaving(): Promise<boolean> {
  return held ? held() : true;
}
