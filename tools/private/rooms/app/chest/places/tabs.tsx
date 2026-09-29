"use client";

import { Tabs } from "@argentic/chest-ui/components";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Places' three pages as tabs (links: the address keeps the page).
export function PlacesTabs({ label, words }: { label: string; words: { places: string; rules: string; export: string } }) {
  const path = usePathname();
  const current = path.startsWith("/chest/places/rules") ? "rules" : path.startsWith("/chest/places/export") ? "export" : "places";
  return (
    <Tabs label={label} current={current} link={Link}
      items={[
        { id: "places", label: words.places, href: "/chest/places" },
        { id: "rules", label: words.rules, href: "/chest/places/rules" },
        { id: "export", label: words.export, href: "/chest/places/export" },
      ]} />
  );
}
