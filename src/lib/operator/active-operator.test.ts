import { describe, it, expect } from "vitest";
import { pickActiveMembership, type Membership } from "./active-operator";

// pickActiveMembership only reads operator.id, so minimal stubs suffice.
const m = (id: string, role: "admin" | "employee" = "admin"): Membership =>
  ({ operator: { id } as Membership["operator"], role });

describe("pickActiveMembership", () => {
  it("returns null when the user belongs to no operators", () => {
    expect(pickActiveMembership([], "anything")).toBeNull();
  });

  it("returns the only membership regardless of the active id", () => {
    const list = [m("a")];
    expect(pickActiveMembership(list, null)?.operator.id).toBe("a");
    expect(pickActiveMembership(list, "a")?.operator.id).toBe("a");
    expect(pickActiveMembership(list, "zzz")?.operator.id).toBe("a");
  });

  it("defaults to the earliest (first) membership with no active id", () => {
    expect(pickActiveMembership([m("a"), m("b"), m("c")], null)?.operator.id).toBe("a");
    expect(pickActiveMembership([m("a"), m("b")], undefined)?.operator.id).toBe("a");
  });

  it("honors the active id when the user is a member of it", () => {
    expect(pickActiveMembership([m("a"), m("b"), m("c")], "b")?.operator.id).toBe("b");
    expect(pickActiveMembership([m("a"), m("b"), m("c")], "c")?.operator.id).toBe("c");
  });

  it("falls back to the earliest when the active id isn't one of the memberships (stale/forged cookie)", () => {
    expect(pickActiveMembership([m("a"), m("b")], "not-a-member")?.operator.id).toBe("a");
  });

  it("preserves the role of the chosen operator", () => {
    const chosen = pickActiveMembership([m("a", "admin"), m("b", "employee")], "b");
    expect(chosen).toMatchObject({ operator: { id: "b" }, role: "employee" });
  });
});
