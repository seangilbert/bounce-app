import { createHash, randomBytes } from "crypto";
import { createAdminClient } from "@/utils/supabase/admin";
import { getOperatorById } from "@/lib/inventory/repo";
import type { Operator } from "@/lib/inventory/types";

export type ApiKeyType = "publishable" | "secret";

export interface ApiKeyRecord {
  id: string;
  operatorId: string;
  type: ApiKeyType;
  name: string | null;
  prefix: string;
  last4: string | null;
  allowedOrigins: string[];
  testMode: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface ApiKeyRow {
  id: string;
  operator_id: string;
  type: ApiKeyType;
  name: string | null;
  prefix: string;
  last4: string | null;
  allowed_origins: string[] | null;
  test_mode: boolean;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

function rowToKey(r: ApiKeyRow): ApiKeyRecord {
  return {
    id: r.id,
    operatorId: r.operator_id,
    type: r.type,
    name: r.name,
    prefix: r.prefix,
    last4: r.last4,
    allowedOrigins: r.allowed_origins ?? [],
    testMode: r.test_mode,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
    revokedAt: r.revoked_at,
  };
}

function hashKey(fullKey: string): string {
  return createHash("sha256").update(fullKey).digest("hex");
}

export function keyPrefix(type: ApiKeyType, testMode: boolean): string {
  return `${type === "secret" ? "sk" : "pk"}_${testMode ? "test" : "live"}`;
}

/** Normalize allowed origins to `scheme://host[:port]`, deduped, capped. */
export function normalizeOrigins(raw: string[] | undefined): string[] {
  const out = new Set<string>();
  for (const v of raw ?? []) {
    const s = v.trim();
    if (!s) continue;
    try {
      out.add(new URL(s).origin);
    } catch {
      // Not a full URL — skip (the UI validates, this is defense-in-depth).
    }
  }
  return [...out].slice(0, 20);
}

export interface GeneratedKey {
  fullKey: string;
  prefix: string;
  last4: string;
  hash: string;
}

/** Mint a new random key. The full key is returned once and never stored. */
export function generateApiKey(type: ApiKeyType, testMode: boolean): GeneratedKey {
  const prefix = keyPrefix(type, testMode);
  const random = randomBytes(24).toString("base64url"); // ~32 url-safe chars
  const fullKey = `${prefix}_${random}`;
  return { fullKey, prefix, last4: random.slice(-4), hash: hashKey(fullKey) };
}

export interface CreateApiKeyInput {
  type: ApiKeyType;
  name?: string | null;
  allowedOrigins?: string[];
  testMode?: boolean;
}

/** Create a key for an operator; returns the record + the plaintext key (once). */
export async function createApiKey(
  operatorId: string,
  input: CreateApiKeyInput,
): Promise<{ record: ApiKeyRecord; fullKey: string }> {
  const gen = generateApiKey(input.type, input.testMode ?? false);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("api_keys")
    .insert({
      operator_id: operatorId,
      type: input.type,
      name: input.name?.trim() || null,
      prefix: gen.prefix,
      last4: gen.last4,
      key_hash: gen.hash,
      allowed_origins: normalizeOrigins(input.allowedOrigins),
      test_mode: input.testMode ?? false,
    })
    .select()
    .single();
  if (error) throw new Error(`createApiKey failed: ${error.message}`);
  return { record: rowToKey(data as ApiKeyRow), fullKey: gen.fullKey };
}

/** Active (non-revoked) keys for an operator, newest first. */
export async function listApiKeys(operatorId: string): Promise<ApiKeyRecord[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("api_keys")
    .select()
    .eq("operator_id", operatorId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listApiKeys failed: ${error.message}`);
  return (data as ApiKeyRow[]).map(rowToKey);
}

export async function revokeApiKey(operatorId: string, id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("operator_id", operatorId);
  if (error) throw new Error(`revokeApiKey failed: ${error.message}`);
}

export async function updateApiKeyOrigins(
  operatorId: string,
  id: string,
  origins: string[],
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("api_keys")
    .update({ allowed_origins: normalizeOrigins(origins) })
    .eq("id", id)
    .eq("operator_id", operatorId);
  if (error) throw new Error(`updateApiKeyOrigins failed: ${error.message}`);
}

export interface ResolvedKey {
  operator: Operator;
  key: ApiKeyRecord;
}

/**
 * Resolve the operator + key record for a plaintext key, or null if the key is
 * unknown/revoked or its operator no longer exists. Best-effort bumps
 * `last_used_at`. The operator is derived FROM the key — never from the request
 * body — so a key can only ever act on its own tenant.
 */
export async function resolveOperatorByKey(fullKey: string | null): Promise<ResolvedKey | null> {
  if (!fullKey) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("api_keys")
    .select()
    .eq("key_hash", hashKey(fullKey))
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) return null;
  const row = data as ApiKeyRow;
  const operator = await getOperatorById(row.operator_id);
  if (!operator) return null;
  // Fire-and-forget usage stamp; never block the request on it.
  void admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
  return { operator, key: rowToKey(row) };
}

/** Whether a browser Origin is permitted for a (publishable) key. */
export function originAllowed(key: ApiKeyRecord, origin: string | null): boolean {
  if (!origin) return false;
  return key.allowedOrigins.includes(origin);
}
