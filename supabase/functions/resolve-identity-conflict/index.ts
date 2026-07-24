import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const headers = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};
const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });
const decodeAal = (token: string) => {
  try {
    const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")))?.aal;
  } catch {
    return null;
  }
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return respond({ error: "method_not_allowed" }, 405);
  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  const url = Deno.env.get("SUPABASE_URL");
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!token || token === authorization || !url || !publicKey || !serviceKey) {
    return respond({ error: "authentication_required" }, 401);
  }
  const userClient = createClient(url, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error } = await userClient.auth.getUser(token);
  if (error || !userData.user) return respond({ error: "authentication_required" }, 401);
  if (decodeAal(token) !== "aal2") return respond({ error: "aal2_required" }, 403);

  const input = await request.json().catch(() => ({}));
  const conflictId = String(input.conflictId ?? "");
  const action = String(input.action ?? "");
  const reason = String(input.reason ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(conflictId) ||
    !["link", "reject", "request_evidence"].includes(action) ||
    reason.length < 10 || reason.length > 500) {
    return respond({ error: "invalid_resolution" }, 400);
  }
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const result = await admin.rpc("resolve_identity_migration_conflict", {
    actor_profile_id: userData.user.id,
    target_conflict_id: conflictId,
    target_action: action,
    target_reason: reason,
  });
  if (result.error) {
    const code = result.error.message.includes("forbidden") ? "forbidden" : "resolution_failed";
    return respond({ error: code }, code === "forbidden" ? 403 : 400);
  }
  return respond({ status: result.data });
});
