import { useEffect, useRef } from "react";

// Sends the form it sits in as soon as one of its choices changes (the
// report's filters): no "Show" button to find for a select or a chip. Text
// and date fields still wait for the button or Enter.
export function AutoSubmit() {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = marker.current?.closest("form");
    if (!form) return;
    const onChange = (e: Event) => {
      const target = e.target as HTMLInputElement | HTMLSelectElement;
      if (target.tagName === "SELECT" || (target as HTMLInputElement).type === "radio") form.requestSubmit();
    };
    form.addEventListener("change", onChange);
    return () => form.removeEventListener("change", onChange);
  }, []);
  return <span ref={marker} hidden />;
}
