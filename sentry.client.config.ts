// Sentry — browser runtime. Only NEXT_PUBLIC_* vars reach the client bundle.
// Dormant until NEXT_PUBLIC_SENTRY_DSN is set: no DSN → no-op, nothing shipped
// to the browser beyond the (tree-shaken) SDK guarded by `enabled`.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  // No Session Replay for now — keeps the client bundle lean; enable later if wanted.
});
