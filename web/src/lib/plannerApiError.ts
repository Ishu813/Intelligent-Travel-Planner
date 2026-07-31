export function parsePlannerApiError(raw: string, status: number): string {
  try {
    const body = JSON.parse(raw) as { error?: string; errorMessage?: string };
    if (body.error) return body.error;
    if (body.errorMessage) {
      if (
        body.errorMessage.toLowerCase().includes("unknown error") ||
        status === 502 ||
        status === 504
      ) {
        return (
          "Plan generation timed out on the server. AI requests often take 20–30 seconds, " +
          "but Netlify serverless functions are limited to 10 seconds (26s max on Pro). " +
          "Ensure GEMINI_API_KEY is set in Netlify env vars, redeploy, and ask Netlify support " +
          "to raise your function timeout — or deploy the API on a host with longer limits."
        );
      }
      return body.errorMessage;
    }
  } catch {
    /* use fallback below */
  }

  if (status === 502 || status === 504) {
    return (
      "Plan generation timed out on the server. Try fewer days, or deploy with a longer function timeout."
    );
  }

  return raw.trim() || `Server error ${status}`;
}
