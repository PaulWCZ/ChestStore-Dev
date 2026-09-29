import { apiRoute } from "../../../../../lib/api.ts";

// Statuspage-compatible public API (lib/api.ts).
const route = apiRoute("active");
export const GET = route.GET;
export const OPTIONS = route.OPTIONS;
export const dynamic = "force-dynamic";
