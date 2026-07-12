// Sentry — edge runtime (middleware, edge routes). Loaded via src/instrumentation.ts.
// Dormant until a DSN is set (see sentry.server.config.ts).
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
