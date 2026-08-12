import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  inboundEmailEnabled,
  inboundReplyAddress,
  parseEmailAddress,
  parseInboundAddress,
  findInquiryIdInRecipients,
  isAutoResponder,
  extractReplyText,
} from "./inbound";

const INQ = "39672a4c-7279-4060-80e1-42e32bca967e";
const DOMAIN = "inbox.movables.ai";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("RESEND_INBOUND_DOMAIN", DOMAIN);
  vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_dGVzdA==");
});

describe("inboundEmailEnabled / inboundReplyAddress", () => {
  it("builds reply+<id>@domain when both env vars are set", () => {
    expect(inboundEmailEnabled()).toBe(true);
    expect(inboundReplyAddress(INQ)).toBe(`reply+${INQ}@${DOMAIN}`);
  });

  it("is dark when either env var is missing", () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "");
    expect(inboundEmailEnabled()).toBe(false);
    expect(inboundReplyAddress(INQ)).toBeNull();
  });
});

describe("parseEmailAddress", () => {
  it("parses bare and display-name forms, lowercasing the address", () => {
    expect(parseEmailAddress("Jane@Example.COM")).toEqual({ email: "jane@example.com", name: null });
    expect(parseEmailAddress('"Jane Doe" <Jane@Example.com>')).toEqual({
      email: "jane@example.com",
      name: "Jane Doe",
    });
    expect(parseEmailAddress("Jane Doe <jane@example.com>")).toEqual({
      email: "jane@example.com",
      name: "Jane Doe",
    });
  });

  it("returns null for non-addresses", () => {
    expect(parseEmailAddress("not an email")).toBeNull();
    expect(parseEmailAddress("")).toBeNull();
  });
});

describe("parseInboundAddress", () => {
  it("extracts the inquiry uuid, case-insensitively, incl. display-name form", () => {
    expect(parseInboundAddress(`reply+${INQ}@${DOMAIN}`)).toBe(INQ);
    expect(parseInboundAddress(`Movables <REPLY+${INQ}@INBOX.MOVABLES.AI>`)).toBe(INQ);
  });

  it("rejects wrong domain, root-domain lookalike, missing plus, non-uuid", () => {
    expect(parseInboundAddress(`reply+${INQ}@movables.ai`)).toBeNull();
    expect(parseInboundAddress(`reply+${INQ}@evil-inbox.movables.ai.attacker.com`)).toBeNull();
    expect(parseInboundAddress(`reply@${DOMAIN}`)).toBeNull();
    expect(parseInboundAddress(`reply+not-a-uuid@${DOMAIN}`)).toBeNull();
    expect(parseInboundAddress(`other+${INQ}@${DOMAIN}`)).toBeNull();
  });

  it("is inert when the domain env is unset", () => {
    vi.stubEnv("RESEND_INBOUND_DOMAIN", "");
    expect(parseInboundAddress(`reply+${INQ}@${DOMAIN}`)).toBeNull();
  });
});

describe("findInquiryIdInRecipients", () => {
  it("returns the first parseable id in the given priority order", () => {
    const other = "11111111-2222-4333-8444-555555555555";
    expect(
      findInquiryIdInRecipients([
        "customer@example.com",
        `reply+${other}@${DOMAIN}`,
        `reply+${INQ}@${DOMAIN}`,
      ]),
    ).toBe(other);
  });

  it("null when no recipient matches", () => {
    expect(findInquiryIdInRecipients(["a@b.com", "c@d.com"])).toBeNull();
  });
});

describe("isAutoResponder", () => {
  const from = "jane@example.com";
  it("flags Auto-Submitted unless it's 'no'", () => {
    expect(isAutoResponder({ "Auto-Submitted": "auto-replied" }, from)).toBe(true);
    expect(isAutoResponder({ "auto-submitted": "no" }, from)).toBe(false);
  });
  it("flags X-Auto-Response-Suppress with any value (case-insensitive keys)", () => {
    expect(isAutoResponder({ "X-Auto-Response-Suppress": "All" }, from)).toBe(true);
  });
  it("flags bulk/auto_reply/junk precedence", () => {
    expect(isAutoResponder({ Precedence: "bulk" }, from)).toBe(true);
    expect(isAutoResponder({ precedence: "auto_reply" }, from)).toBe(true);
    expect(isAutoResponder({ precedence: "first-class" }, from)).toBe(false);
  });
  it("flags daemon/no-reply senders", () => {
    expect(isAutoResponder({}, "MAILER-DAEMON@mx.example.com")).toBe(true);
    expect(isAutoResponder({}, "noreply@shop.example.com")).toBe(true);
    expect(isAutoResponder({}, "no-reply@shop.example.com")).toBe(true);
  });
  it("flags our own outbound sender (self-loop guard)", () => {
    vi.stubEnv("RESEND_FROM", "Movables <notifications@movables.ai>");
    expect(isAutoResponder({}, "notifications@movables.ai")).toBe(true);
  });
  it("passes a plain human sender", () => {
    expect(isAutoResponder({}, "Jane <jane@example.com>")).toBe(false);
  });
});

describe("extractReplyText", () => {
  it("cuts a Gmail quoted chain", () => {
    const text = `Sounds great, let's book it!\n\nOn Mon, Aug 10, 2026 at 3:12 PM Bounce USA <notifications@movables.ai> wrote:\n> Happy to help!\n> The castle is available.`;
    expect(extractReplyText(text, null)).toBe("Sounds great, let's book it!");
  });

  it("cuts an Outlook original-message block and underscore divider", () => {
    expect(extractReplyText("Yes please.\n\n-----Original Message-----\nFrom: x", null)).toBe("Yes please.");
    expect(extractReplyText("Yes please.\n\n________________\nFrom: x@y.com", null)).toBe("Yes please.");
  });

  it("cuts a From:-header block", () => {
    expect(extractReplyText("Works for us.\n\nFrom: Bounce USA <n@movables.ai>\nSent: Monday", null)).toBe(
      "Works for us.",
    );
  });

  it("drops a trailing '>' quote block and a '-- ' signature", () => {
    expect(extractReplyText("Confirmed!\n\n> earlier message\n> more quote\n", null)).toBe("Confirmed!");
    expect(extractReplyText("Confirmed!\n\n-- \nJane Doe\n555-1234", null)).toBe("Confirmed!");
  });

  it("falls back to the full text when the marker is at the very top", () => {
    const text = "On Mon, Aug 10, 2026 Bounce USA wrote:\n> hi";
    expect(extractReplyText(text, null)).toBe(text.trim());
  });

  it("derives text from html when the text part is missing", () => {
    const html = "<div>Let&#39;s do <b>Saturday</b>.<br>Thanks &amp; talk soon</div><style>.x{}</style>";
    expect(extractReplyText(null, html)).toBe("Let's do Saturday.\nThanks & talk soon");
  });

  it("returns empty for truly empty input", () => {
    expect(extractReplyText(null, null)).toBe("");
    expect(extractReplyText("   ", "")).toBe("");
  });
});
