import { describe, it, expect, vi, beforeEach } from "vitest";

const { getCustomerAccountById, upsertCustomer } = vi.hoisted(() => ({
  getCustomerAccountById: vi.fn(),
  upsertCustomer: vi.fn(),
}));
vi.mock("./accounts", () => ({ getCustomerAccountById }));
vi.mock("./repo", () => ({ upsertCustomer }));

import { ensureLeadCustomer } from "./leads";

const ACCOUNT = "acct-1";
const OPERATOR = "op-1";

beforeEach(() => vi.clearAllMocks());

describe("ensureLeadCustomer", () => {
  it("records the saver in the operator's CRM, sourced as a save", async () => {
    getCustomerAccountById.mockResolvedValue({
      id: ACCOUNT,
      email: "jane@example.com",
      name: "Jane",
    });
    upsertCustomer.mockResolvedValue("cust-1");

    await ensureLeadCustomer(ACCOUNT, OPERATOR);

    expect(upsertCustomer).toHaveBeenCalledWith(
      OPERATOR,
      { email: "jane@example.com", name: "Jane" },
      { source: "saved", accountId: ACCOUNT },
    );
  });

  it("records nothing for a signed-in user who isn't a renter", async () => {
    // An operator user browsing a storefront. They can still save; they just
    // aren't anybody's lead.
    getCustomerAccountById.mockResolvedValue(null);

    await ensureLeadCustomer("some-operator-user", OPERATOR);

    expect(upsertCustomer).not.toHaveBeenCalled();
  });

  it("never throws — a CRM hiccup must not fail the save the customer can see", async () => {
    getCustomerAccountById.mockResolvedValue({ id: ACCOUNT, email: "jane@example.com", name: null });
    upsertCustomer.mockRejectedValue(new Error("db down"));

    await expect(ensureLeadCustomer(ACCOUNT, OPERATOR)).resolves.toBeUndefined();
  });
});
