/**
 * Central placeholders for the legal documents. Fill these in once (with your
 * finalized entity + counsel's guidance) and both the Terms of Service and
 * Privacy Policy update everywhere. Values in [BRACKETS] are intentional
 * placeholders — the docs are drafts and MUST be reviewed by a lawyer before you
 * rely on them.
 */
export const LEGAL = {
  /** The product / brand name shown to users. */
  product: "Bounce",
  /** The legal entity that operates the platform. */
  company: "[COMPANY LEGAL NAME]",
  /** Public website / app host. */
  website: "bounce-app.vercel.app",
  /** Governing-law jurisdiction (e.g. "the State of Delaware, USA"). */
  governingLaw: "[STATE / JURISDICTION]",
  /** Where legal + privacy inquiries are sent. */
  contactEmail: "[legal@yourdomain.com]",
  /** Mailing address for formal notices. */
  mailingAddress: "[COMPANY MAILING ADDRESS]",
  /** Effective / last-updated date shown at the top of each document. */
  effectiveDate: "[EFFECTIVE DATE]",
} as const;
