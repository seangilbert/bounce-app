// Next.js instrumentation hook — runs once per server runtime at startup.
// Loads the matching Sentry init for the active runtime. Both are dormant
// until a DSN is configured.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// Captures errors thrown in nested React Server Components / route handlers
// (App Router) and forwards them to Sentry. No-op without a DSN.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
