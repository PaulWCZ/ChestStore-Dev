"use client";

// Next.js's Link, re-exported from a client module: a server page may then
// hand it to the kit's components (`<Tabs link={Link}>`) — imported there
// directly it is a plain function, which React refuses to send to a client
// component (ui/README.md, "Components").
export { default as Link } from "next/link";
