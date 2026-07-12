// Sentry — server runtime (Node). Loaded via src/instrumentation.ts.
// Dormant until a DSN is set: with no DSN, `enabled` is false and every
// Sentry call is a no-op, so this ships safely before the Sentry project exists.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  // Vercel sets VERCEL_ENV (production/preview/development); fall back to NODE_ENV.
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  // Sample a slice of transactions for perf without heavy volume/cost.
  tracesSampleRate: 0.1,
});
