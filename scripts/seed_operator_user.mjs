// Create an operator login and link it to the Bounce USA operator.
// Run AFTER applying supabase/migrations/0008_operator_members.sql:
//   node --env-file=.env.local scripts/seed_operator_user.mjs
//
// Override creds via env: OPERATOR_EMAIL=... OPERATOR_PASSWORD=... node ...
import { createClient } from "@supabase/supabase-js";

const EMAIL = process.env.OPERATOR_EMAIL ?? "owner@bounceusa.com";
const PASSWORD = process.env.OPERATOR_PASSWORD ?? "bounce-usa-demo";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// The operator to link to (single-operator today).
const { data: op, error: opErr } = await admin
  .from("operators")
  .select("id, name")
  .order("created_at", { ascending: true })
  .limit(1)
  .single();
if (opErr) throw opErr;

// Create the auth user (email pre-confirmed so password login works without
// email delivery). If it already exists, look it up instead.
let userId;
const created = await admin.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
});
if (created.error) {
  if (!/already been registered|already exists/i.test(created.error.message)) throw created.error;
  const { data: list, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email?.toLowerCase() === EMAIL.toLowerCase());
  if (!existing) throw new Error(`User ${EMAIL} reported as existing but not found.`);
  userId = existing.id;
  // Reset the password so the printed creds are valid.
  await admin.auth.admin.updateUserById(userId, { password: PASSWORD });
  console.log(`User ${EMAIL} already existed — password reset.`);
} else {
  userId = created.data.user.id;
  console.log(`Created user ${EMAIL}.`);
}

// Link the user to the operator (idempotent).
const { error: memErr } = await admin
  .from("operator_members")
  .upsert(
    { operator_id: op.id, user_id: userId, role: "owner" },
    { onConflict: "operator_id,user_id" },
  );
if (memErr) throw memErr;

console.log(`Linked to operator "${op.name}" (${op.id}) as owner.`);
console.log(`\n  Login:  ${EMAIL}\n  Pass:   ${PASSWORD}\n`);
