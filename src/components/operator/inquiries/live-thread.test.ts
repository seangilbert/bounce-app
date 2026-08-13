import { describe, it, expect } from "vitest";
import { liveToThreadMsg, mergeThread, pruneOverlay, type LiveMessageRow } from "./live-thread";
import type { InquiryDetail, ThreadMsg } from "@/lib/operator/inquiries";

const row = (over: Partial<LiveMessageRow> = {}): LiveMessageRow => ({
  id: "m1",
  inquiry_id: "inq-1",
  sender: "customer",
  body: "hello",
  channel: "website",
  direction: "inbound",
  created_at: "2026-08-13T00:00:00Z",
  ...over,
});

const msg = (id: string, body = "x"): ThreadMsg => ({
  id,
  sender: "customer",
  body,
  time: "1:00 PM",
  channel: null,
  direction: null,
});

const detailsWith = (inquiryId: string, ids: string[]): Record<string, InquiryDetail> =>
  ({ [inquiryId]: { thread: ids.map((i) => msg(i)) } }) as unknown as Record<string, InquiryDetail>;

describe("liveToThreadMsg", () => {
  it("maps the payload with a client-side time label", () => {
    expect(liveToThreadMsg(row())).toEqual({
      id: "m1",
      sender: "customer",
      body: "hello",
      time: "Just now",
      channel: "website",
      direction: "inbound",
    });
  });
});

describe("mergeThread", () => {
  it("appends overlay entries after the server thread, deduped by id", () => {
    const server = [msg("a"), msg("b")];
    const merged = mergeThread(server, [msg("b", "dupe"), msg("c", "fresh")]);
    expect(merged.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(merged[1]!.body).toBe("x"); // the server copy wins on dupes
  });

  it("returns the server array untouched when the overlay adds nothing", () => {
    const server = [msg("a")];
    expect(mergeThread(server, [])).toBe(server);
    expect(mergeThread(server, [msg("a")])).toBe(server);
  });
});

describe("pruneOverlay", () => {
  it("drops entries the reconciled server props now include", () => {
    const overlay = new Map([["inq-1", [msg("a"), msg("b")]]]);
    const next = pruneOverlay(overlay, detailsWith("inq-1", ["a"]));
    expect(next.get("inq-1")!.map((m) => m.id)).toEqual(["b"]);
  });

  it("removes fully-reconciled inquiries from the map", () => {
    const overlay = new Map([["inq-1", [msg("a")]]]);
    const next = pruneOverlay(overlay, detailsWith("inq-1", ["a"]));
    expect(next.has("inq-1")).toBe(false);
  });

  it("preserves map identity when nothing changed (no re-render loop)", () => {
    const overlay = new Map([["inq-1", [msg("z")]]]);
    expect(pruneOverlay(overlay, detailsWith("inq-1", ["a"]))).toBe(overlay);
  });
});
