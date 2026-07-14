import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseMock, type QueuedResponse } from "@/test/supabase-mock";

const { adminMock } = vi.hoisted(() => ({ adminMock: vi.fn() }));
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: adminMock }));

import { listSavedItemIds, listSavedItemIdsBySlug, toggleSavedItem } from "./saved";

const ACCOUNT = "acct-1";
const ITEM = "item-1";
const OPERATOR = "op-1";

const mockDb = (rows: QueuedResponse[]) => {
  const db = makeSupabaseMock(rows);
  adminMock.mockReturnValue(db);
  return db;
};

beforeEach(() => adminMock.mockReset());

describe("listSavedItemIds", () => {
  it("returns this account's saved items for this operator only", async () => {
    const db = mockDb([{ data: [{ item_id: "a" }, { item_id: "b" }] }]);

    expect(await listSavedItemIds(ACCOUNT, OPERATOR)).toEqual(["a", "b"]);

    expect(db.builder.eq).toHaveBeenCalledWith("account_id", ACCOUNT);
    // The wishlist is account-wide, but a storefront must only ever show ITS
    // items — otherwise one operator's catalog page would reveal that the
    // customer shops with a competitor.
    expect(db.builder.eq).toHaveBeenCalledWith("items.operator_id", OPERATOR);
  });

  it("is empty for an account that has saved nothing", async () => {
    mockDb([{ data: [] }]);
    expect(await listSavedItemIds(ACCOUNT, OPERATOR)).toEqual([]);
  });
});

describe("listSavedItemIdsBySlug", () => {
  it("scopes by account and operator slug in a single query", async () => {
    // Keyed off the slug so it can run in PARALLEL with the operator lookup
    // rather than waiting on it — each round-trip costs ~120ms.
    const db = mockDb([{ data: [{ item_id: "a" }] }]);

    expect(await listSavedItemIdsBySlug(ACCOUNT, "bounce-usa")).toEqual(["a"]);

    expect(db.from).toHaveBeenCalledTimes(1);
    expect(db.builder.eq).toHaveBeenCalledWith("account_id", ACCOUNT);
    expect(db.builder.eq).toHaveBeenCalledWith("items.operators.slug", "bounce-usa");
  });

  it("is empty for a signed-in user who isn't a customer at all", async () => {
    // An operator browsing a storefront: their auth id matches no
    // customer_accounts row, so the join simply finds nothing.
    mockDb([{ data: [] }]);
    expect(await listSavedItemIdsBySlug("some-operator-user", "bounce-usa")).toEqual([]);
  });
});

describe("toggleSavedItem", () => {
  it("saves an item that isn't saved yet", async () => {
    const db = mockDb([
      { data: { id: ITEM } }, // item belongs to the operator
      { data: null }, // not currently saved
      { data: null }, // insert
    ]);

    expect(await toggleSavedItem(ACCOUNT, ITEM, OPERATOR)).toEqual({ ok: true, saved: true });
    expect(db.builder.insert).toHaveBeenCalledWith({ account_id: ACCOUNT, item_id: ITEM });
  });

  it("un-saves an item that is already saved", async () => {
    const db = mockDb([
      { data: { id: ITEM } },
      { data: { id: "saved-row-1" } }, // already saved
      { data: null }, // delete
    ]);

    expect(await toggleSavedItem(ACCOUNT, ITEM, OPERATOR)).toEqual({ ok: true, saved: false });
    expect(db.builder.delete).toHaveBeenCalled();
  });

  it("refuses an item that doesn't belong to the operator the caller claims", async () => {
    // Otherwise a crafted request could bolt an arbitrary item onto the
    // wishlist from a storefront that doesn't own it.
    const db = mockDb([{ data: null }]); // the operator-scoped item lookup misses

    expect(await toggleSavedItem(ACCOUNT, "someone-elses-item", OPERATOR)).toEqual({ ok: false });
    expect(db.builder.insert).not.toHaveBeenCalled();
    expect(db.builder.delete).not.toHaveBeenCalled();
  });

  it("treats a double-tap race as saved, not as an error", async () => {
    mockDb([
      { data: { id: ITEM } },
      { data: null }, // looked unsaved...
      { data: null, error: { code: "23505" } }, // ...but the unique index says otherwise
    ]);
    // The unique constraint firing means "already saved" — which is the state
    // the caller was asking for anyway.
    expect(await toggleSavedItem(ACCOUNT, ITEM, OPERATOR)).toEqual({ ok: true, saved: true });
  });

  it("reports a real insert failure", async () => {
    mockDb([
      { data: { id: ITEM } },
      { data: null },
      { data: null, error: { code: "08006" } }, // connection failure, not a dup
    ]);
    expect(await toggleSavedItem(ACCOUNT, ITEM, OPERATOR)).toEqual({ ok: false });
  });
});
