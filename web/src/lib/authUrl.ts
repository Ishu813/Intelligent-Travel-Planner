const DEFAULT_AUTH_URL = "http://localhost:3000";

export function getNextAuthUrl() {
  const raw = process.env.NEXTAUTH_URL?.trim();
  if (!raw || raw === "undefined") {
    return DEFAULT_AUTH_URL;
  }

  return raw.replace(/\/+$/, "");
}

export function getNextAuthBasePath() {
  try {
    const path = new URL(getNextAuthUrl()).pathname.replace(/\/$/, "");
    return path || "/api/auth";
  } catch {
    return "/api/auth";
  }
}
