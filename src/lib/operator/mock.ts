/**
 * Small static config for the few dashboard bits without a data source yet:
 * the assistant's "active since" / average reply time, and the weekly deltas
 * (no historical series to compute them from). Everything else on the operator
 * app is now live data.
 */

export const aiSummary = {
  since: "6 AM",
  avgReplyMin: 2,
};

export const weekStats = {
  change: "+18%",
  repliedPct: 100,
};

export type StopType = "DELIVER" | "PICK UP";
export type StopStatusTone = "ok" | "warn" | "muted";

export interface Stop {
  time: string;
  meridiem: string;
  type: StopType;
  item: string;
  customer: string;
  address: string;
  status: { label: string; tone: StopStatusTone };
}
