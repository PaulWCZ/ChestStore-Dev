import { useEffect, useState } from "react";
import { minutesNow } from "../shared/model.ts";

// The minute of the day in the office's zone, kept current in the browser
// (every 20 s): what depends on the clock — "I'm here" from ten minutes
// before a meeting, the line of now, what is past — follows it, whatever
// the page's version (which moves by the quarter hour). Starts from the
// server's minute (initial), so the first render matches the page.
export function useMinutes(zone: string, initial: number): number {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    const tick = () => setNow(minutesNow(zone));
    tick();
    const timer = setInterval(tick, 20_000);
    return () => clearInterval(timer);
  }, [zone]);
  return now;
}
