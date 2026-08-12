import { describe, it, expect, vi, beforeEach } from "vitest";

const { runReminderSweep } = vi.hoisted(() => ({ runReminderSweep: vi.fn() }));
vi.mock("@/lib/reminders/sweep", () => ({ runReminderSweep }));

import { GET } from "./route";

const SECRET = "test-cron-secret";

function run(auth?: string) {
  return GET(
    new Request("https://x/api/cron/reminders", {
      headers: auth ? { authorization: auth } : {},
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("CRON_SECRET", SECRET);
  runReminderSweep.mockResolvedValue({ balanceSent: 2, contractSent: 1, skipped: 5, failed: 0 });
});

describe("GET /api/cron/reminders", () => {
  it("fails closed (503) when CRON_SECRET is unset — never silently open", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await run(`Bearer ${SECRET}`);
    expect(res.status).toBe(503);
    expect(runReminderSweep).not.toHaveBeenCalled();
  });

  it("401 on missing or wrong bearer", async () => {
    expect((await run()).status).toBe(401);
    expect((await run("Bearer nope")).status).toBe(401);
    expect((await run(SECRET)).status).toBe(401); // missing "Bearer " prefix
    expect(runReminderSweep).not.toHaveBeenCalled();
  });

  it("runs the sweep and returns its counts on a valid bearer", async () => {
    const res = await run(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ balanceSent: 2, contractSent: 1, skipped: 5, failed: 0 });
    expect(runReminderSweep).toHaveBeenCalledTimes(1);
  });

  it("500 when the sweep throws", async () => {
    runReminderSweep.mockRejectedValue(new Error("db down"));
    const res = await run(`Bearer ${SECRET}`);
    expect(res.status).toBe(500);
  });
});
