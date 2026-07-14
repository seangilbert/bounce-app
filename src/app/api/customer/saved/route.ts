import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/operator/session";
import { toggleSavedItem } from "@/lib/customers/saved";

export const dynamic = "force-dynamic";

const Body = z.object({
  itemId: z.string().uuid(),
  operatorId: z.string().uuid(),
});

/**
 * Toggle an item on the signed-in renter's wishlist.
 *
 * The account comes from the SESSION, never the body — a body-supplied account
 * id would let anyone write to anyone's wishlist. 401 for guests: the storefront
 * shows them a "sign in to save" nudge rather than calling this.
 */
export async function POST(req: NextRequest) {
  // The account id IS the auth user id (customer_accounts.id is 1:1 with
  // auth.users.id — migration 0046), so there's no need to load the account row
  // just to learn its id: that was a wasted ~120ms round-trip on every heart
  // tap. A user with no customer_accounts row can't get past `saved_items`'
  // foreign key anyway, so the write is still the thing that decides.
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to save items." }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const result = await toggleSavedItem(user.id, parsed.data.itemId, parsed.data.operatorId);
  if (!result.ok) return NextResponse.json({ error: "Could not save that item." }, { status: 400 });

  return NextResponse.json({ ok: true, saved: result.saved });
}
