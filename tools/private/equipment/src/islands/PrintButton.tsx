import { Print } from "../components/icons.tsx";

// Print the page (the browser's own window: "Save as PDF" keeps it as a
// file). Only the paper is printed (the shell and this bar are not).
export function PrintButton({ label }: { label: string }) {
  return <button type="button" className="button" onClick={() => window.print()}><Print />{label}</button>;
}
