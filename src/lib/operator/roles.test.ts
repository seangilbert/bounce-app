import { describe, it, expect } from "vitest";
import { roleLabel, isMemberRole, MEMBER_ROLES } from "./roles";

describe("roleLabel", () => {
  it("labels each role", () => {
    expect(roleLabel("admin")).toBe("Admin");
    expect(roleLabel("employee")).toBe("Employee");
  });
});

describe("isMemberRole", () => {
  it("accepts the known roles", () => {
    for (const r of MEMBER_ROLES) expect(isMemberRole(r)).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isMemberRole("owner")).toBe(false);
    expect(isMemberRole("")).toBe(false);
    expect(isMemberRole(null)).toBe(false);
    expect(isMemberRole(undefined)).toBe(false);
  });
});
