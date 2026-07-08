import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: op } = await sb.from("operators").select("id, slug, deposit_percent").eq("slug","demo-1").single();
const { data: it } = await sb.from("items").select("id, name, base_price").eq("operator_id", op.id).limit(1).single();
const total = it.base_price; // 1 day, 1 unit
const { data: b } = await sb.from("bookings").insert({
  operator_id: op.id, status: "quoted", start_date: "2027-05-01", end_date: "2027-05-01",
  customer_name: "Test Payer", customer_email: "payer@example.com",
  subtotal: total, delivery_fee: 0, tax_amount: 0, total, currency: "usd",
}).select("id").single();
await sb.from("booking_items").insert({ booking_id: b.id, item_id: it.id, quantity: 1, unit_price: it.base_price, line_total: total });
console.log("PAY_BOOKING_ID", b.id);
console.log("item:", it.name, "total:", total, "deposit%:", op.deposit_percent);
