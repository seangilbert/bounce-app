import { describe, it, expect, vi, beforeEach } from "vitest";

const { hasCustomerRecords, ensureCustomerAccount, sendEmail, generateLink, captureMessage } =
  vi.hoisted(() => ({
    hasCustomerRecords: vi.fn(),
    ensureCustomerAccount: vi.fn(),
    sendEmail: vi.fn(),
    generateLink: vi.fn(),
    captureMessage: vi.fn(),
  }));

vi.mock("./accounts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./accounts")>()),
  hasCustomerRecords,
  ensureCustomerAccount,
}));
vi.mock("@/lib/email/send", () => ({ sendEmail }));
vi.mock("@sentry/nextjs", () => ({ captureMessage }));
vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { generateLink } } }),
}));

import { requestLoginCode } from "./otp";

const happyPath = () => {
  hasCustomerRecords.mockResolvedValue(true);
  ensureCustomerAccount.mockResolvedValue({ ok: true, userId: "user-1" });
  generateLink.mockResolvedValue({ data: { properties: { email_otp: "11229799" } }, error: null });
  sendEmail.mockResolvedValue({ ok: true });
};

beforeEach(() => vi.clearAllMocks());

describe("requestLoginCode — the happy path", () => {
  it("mints a code and mails it to the address that asked", async () => {
    happyPath();
    expect(await requestLoginCode("jane@example.com")).toBe("sent");

    const [input] = sendEmail.mock.calls[0];
    expect(input.to).toBe("jane@example.com");
    expect(input.html).toContain("11229799");
    expect(input.subject).toContain("11229799");
  });

  it("lowercases the email before doing anything with it", async () => {
    happyPath();
    await requestLoginCode("  Jane@Example.COM  ");
    expect(hasCustomerRecords).toHaveBeenCalledWith("jane@example.com");
    expect(generateLink).toHaveBeenCalledWith({ type: "magiclink", email: "jane@example.com" });
  });

  it("does not assume a 6-digit code — GoTrue's OTP length is a project setting", async () => {
    happyPath();
    // This project actually mints 8. Whatever comes back must be mailed intact.
    generateLink.mockResolvedValue({ data: { properties: { email_otp: "1234567890" } } });
    await requestLoginCode("jane@example.com");
    expect(sendEmail.mock.calls[0][0].html).toContain("1234567890");
  });
});

describe("requestLoginCode — enumeration resistance", () => {
  it("sends nothing, and mints no auth user, for an email that has never rented", async () => {
    hasCustomerRecords.mockResolvedValue(false);

    expect(await requestLoginCode("stranger@example.com")).toBe("no_account");

    expect(sendEmail).not.toHaveBeenCalled();
    expect(ensureCustomerAccount).not.toHaveBeenCalled();
  });

  // The route maps EVERY outcome below to the same 200. These tests pin the
  // outcomes themselves; the route test pins the flattening.
  it("reports a delivery failure to Sentry rather than to the caller", async () => {
    happyPath();
    sendEmail.mockResolvedValue({ ok: false });

    expect(await requestLoginCode("jane@example.com")).toBe("delivery_failed");

    // Loud on our side...
    expect(captureMessage).toHaveBeenCalledOnce();
    expect(captureMessage.mock.calls[0][1].tags.area).toBe("customer-auth");
  });

  it("treats an unconfigured mailer the same way", async () => {
    happyPath();
    // The likeliest prod misconfiguration (no key / unverified RESEND_FROM)
    // fails EVERY send. If that surfaced as an error, it'd be a permanent
    // enumeration oracle: error = "this person rents here", ok = "they don't".
    sendEmail.mockResolvedValue({ ok: false, skipped: true });
    expect(await requestLoginCode("jane@example.com")).toBe("delivery_failed");
    expect(captureMessage).toHaveBeenCalledOnce();
  });

  it("swallows a mint failure the same way, and sends no email", async () => {
    happyPath();
    generateLink.mockResolvedValue({ data: null, error: { message: "boom" } });

    expect(await requestLoginCode("jane@example.com")).toBe("mint_failed");

    expect(sendEmail).not.toHaveBeenCalled();
    expect(captureMessage).toHaveBeenCalledOnce();
  });

  it("swallows an account-creation failure the same way", async () => {
    happyPath();
    ensureCustomerAccount.mockResolvedValue({ ok: false, error: "nope" });

    expect(await requestLoginCode("jane@example.com")).toBe("mint_failed");

    expect(generateLink).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
