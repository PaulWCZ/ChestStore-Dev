import { BrandMark } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";

// The company's logo on the instrument panel. The panel is the page's
// inverse (dark in a light look, light in a dark one), so the logo's
// variants swap: its dark-ground variant in light mode, its usual one in
// dark mode. The kit's BrandMark picks them for the page's own ground
// (reported: it has no option for an inverse ground). Without a logo (not
// brand mode), the tool's own mark.
export function PanelLogo({ logo, children }: { logo: { readonly url: string; readonly alt: string; readonly dark?: string | null } | null | undefined; children: ReactNode }) {
  if (!logo || !logo.dark) return <BrandMark logo={logo ?? null}>{children}</BrandMark>;
  return (
    <picture className="ck-logo">
      <source srcSet={logo.url} media="(prefers-color-scheme: dark)" />
      <img src={logo.dark} alt={logo.alt} />
    </picture>
  );
}
