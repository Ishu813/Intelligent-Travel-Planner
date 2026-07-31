const FALLBACK_API_URL = "http://localhost:3001";

/** Planner endpoints are served by Next.js at /api/planner (no separate port needed). */
export function getPlannerApiBaseUrl() {
  return "/api";
}

export function getApiBaseUrl() {
  const raw =
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.API_URL ??
    FALLBACK_API_URL;

  const trimmed = raw.trim();
  if (!trimmed || trimmed === "undefined") {
    return FALLBACK_API_URL;
  }

  return trimmed.replace(/\/+$/, "");
}

