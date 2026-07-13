import { describe, it, expect } from "vitest";
import { safeNext } from "./redirect";

describe("safeNext (post-login open-redirect guard)", () => {
  it("keeps in-portal paths", () => {
    expect(safeNext("/my")).toBe("/my");
    expect(safeNext("/my/bookings/abc-123")).toBe("/my/bookings/abc-123");
  });

  it("falls back to /my when absent", () => {
    expect(safeNext(undefined)).toBe("/my");
    expect(safeNext(null)).toBe("/my");
    expect(safeNext("")).toBe("/my");
  });

  it("rejects absolute URLs to other hosts", () => {
    expect(safeNext("https://evil.example/my")).toBe("/my");
    expect(safeNext("http://evil.example")).toBe("/my");
  });

  it("rejects protocol-relative URLs, which a naive startsWith('/') check lets through", () => {
    expect(safeNext("//evil.example")).toBe("/my");
    expect(safeNext("//evil.example/my")).toBe("/my");
  });

  it("rejects a path that merely starts with the letters 'my'", () => {
    expect(safeNext("/myevil")).toBe("/my");
    expect(safeNext("/my-other-place")).toBe("/my");
  });

  it("refuses to bounce a renter into the operator app", () => {
    expect(safeNext("/dashboard")).toBe("/my");
    expect(safeNext("/settings")).toBe("/my");
  });
});
