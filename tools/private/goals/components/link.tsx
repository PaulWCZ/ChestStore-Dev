"use client";
// Next.js's Link as a client reference: a server page may then pass it to
// the kit's link props (Filters, Tabs, Segmented…) — `next/link` imported
// in a server component is a plain function, which React refuses to send.
export { default as Link } from "next/link";
