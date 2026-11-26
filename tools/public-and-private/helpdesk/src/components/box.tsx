import type { ReactNode } from "react";

// A box of the settings page: a titled section with its icon.
export function Box({ title, icon, children, id }: { title: string; icon: ReactNode; children: ReactNode; id?: string }) {
  return <section className="box" id={id}><h2 className="row">{icon}{title}</h2>{children}</section>;
}
