"use client";

// Next.js's Link as a client reference: a server component may hand it to
// the kit's Tabs and Menu (a function imported there could not cross to a
// client component; ui/README.md, "Client components").
export { default as Link } from "next/link";
