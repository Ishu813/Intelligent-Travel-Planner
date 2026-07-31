/** True when running inside a serverless host (Netlify, Vercel, AWS Lambda). */
export function isServerlessRuntime() {
  return Boolean(
    process.env.NETLIFY ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.VERCEL,
  );
}
