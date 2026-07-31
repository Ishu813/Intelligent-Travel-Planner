import { GoogleGenerativeAI, GoogleGenerativeAIFetchError } from "@google/generative-ai";
const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_ATTEMPTS_PER_MODEL = 5;
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
/** Map deprecated / removed model ids to a current Flash id (see Google AI model docs). */
export function effectiveGeminiModelId(envValue) {
    const raw = (envValue ?? DEFAULT_MODEL).trim();
    if (!raw)
        return DEFAULT_MODEL;
    const lower = raw.toLowerCase();
    if (lower.includes("gemini-1.5-flash"))
        return DEFAULT_MODEL;
    if (lower === "gemini-pro" || lower === "gemini-pro-vision")
        return DEFAULT_MODEL;
    if (lower.includes("gemini-1.5-pro") && !lower.includes("2.5"))
        return DEFAULT_MODEL;
    return raw;
}
function isRetryableGeminiError(err) {
    if (err instanceof GoogleGenerativeAIFetchError) {
        const s = err.status;
        if (s === 429 || s === 503 || s === 500 || s === 408)
            return true;
    }
    const msg = err instanceof Error ? err.message : String(err);
    return (/\[\s*503\b/.test(msg) ||
        /\[\s*429\b/.test(msg) ||
        /\[\s*500\b/.test(msg) ||
        /resource_exhausted|UNAVAILABLE|try again later|high demand|overloaded/i.test(msg));
}
/**
 * Call Gemini with exponential backoff on overload / rate limits.
 * Tries {@link modelId} first; if every attempt fails with a retryable error, optionally tries
 * `GEMINI_MODEL_FALLBACK` (single model id, comma not needed).
 */
export async function generateContentWithRetry(apiKey, modelId, prompt) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const fallbackRaw = process.env.GEMINI_MODEL_FALLBACK?.trim();
    const fallbackId = fallbackRaw ? effectiveGeminiModelId(fallbackRaw) : null;
    const chain = fallbackId && fallbackId !== modelId ? [modelId, fallbackId] : [modelId];
    let lastErr;
    for (const mid of chain) {
        for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_MODEL; attempt++) {
            const model = genAI.getGenerativeModel({ model: mid });
            try {
                return await model.generateContent(prompt);
            }
            catch (e) {
                lastErr = e;
                if (!isRetryableGeminiError(e) || attempt === MAX_ATTEMPTS_PER_MODEL) {
                    if (chain.length > 1 && mid === modelId && isRetryableGeminiError(e)) {
                        break;
                    }
                    throw e;
                }
                const baseMs = Math.min(12_000, 600 * 2 ** (attempt - 1));
                const jitter = Math.floor(Math.random() * 500);
                await sleep(baseMs + jitter);
            }
        }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
