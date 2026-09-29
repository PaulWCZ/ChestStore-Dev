"use client";
// Next.js's Link as a client reference: a server component may then pass it
// to the kit's link props (Segmented, Tabs, Menu…); `next/link` imported in
// a server component is a plain function, which React refuses to send.
export { default as Link } from "next/link";
