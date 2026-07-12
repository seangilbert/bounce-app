import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Required on Next 14 for src/instrumentation.ts (Sentry init) to run.
  experimental: { instrumentationHook: true },
};

export default withSentryConfig(nextConfig, {
  // These are only used at build time to upload source maps. All optional —
  // without SENTRY_AUTH_TOKEN, source-map upload is skipped and the build still
  // succeeds. Runtime error capture works from the DSN alone (see sentry.*.config.ts).
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Only attempt source-map upload once an auth token exists — keeps the build
  // clean and offline-safe until Sentry is actually provisioned.
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  silent: !process.env.CI,
  disableLogger: true,
});
