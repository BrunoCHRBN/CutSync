import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};

const respond = (body: Record<string, unknown>, status = 200) => (
  new Response(JSON.stringify(body), { status, headers: corsHeaders })
);

const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const encoded = token.split(".")[1];
    if (!encoded) return null;
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const safeErrorCode = (value: unknown) => {
  const raw = value instanceof Error ? value.message : String(value ?? "execution_failed");
  if (raw.includes("auth")) return "auth_deletion_failed";
  if (raw.includes("anonym")) return "profile_anonymization_failed";
  if (raw.includes("complete")) return "completion_failed";
  return "execution_failed";
};

const isMissingAuthIdentity = (error: { status?: number; message?: string } | null) => (
  error?.status === 404 || /not found|does not exist/i.test(error?.message ?? "")
);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return respond({ error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !publicKey || !serviceRoleKey) {
    return respond({ error: "service_not_configured" }, 500);
  }

  const authorization = request.headers.get("Authorization") ?? "";
  const accessToken = authorization.replace(/^Bearer\s+/i, "");
  if (!accessToken || accessToken === authorization) {
    return respond({ error: "authentication_required" }, 401);
  }

  const userClient = createClient(supabaseUrl, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return respond({ error: "authentication_required" }, 401);
  }

  const claims = decodeJwtPayload(accessToken);
  if (claims?.aal !== "aal2") {
    return respond({ error: "governance_aal2_required" }, 403);
  }

  const { data: governanceUser, error: governanceError } = await userClient
    .from("governance_users")
    .select("role")
    .eq("profile_id", userData.user.id)
    .maybeSingle();
  if (
    governanceError ||
    (governanceUser?.role !== "SaaS_Editor" && governanceUser?.role !== "SaaS_Owner")
  ) {
    return respond({ error: "forbidden" }, 403);
  }

  let input: { requestId?: string; reason?: string };
  try {
    input = await request.json();
  } catch {
    return respond({ error: "invalid_request" }, 400);
  }

  const requestId = input.requestId?.trim() ?? "";
  const reason = input.reason?.trim() ?? "";
  if (!requestIdPattern.test(requestId) || reason.length < 10 || reason.length > 500) {
    return respond({ error: "invalid_request" }, 400);
  }

  let targetProfileId: string | null = null;
  try {
    const { data: beginRows, error: beginError } = await userClient.rpc(
      "begin_client_account_deletion_execution",
      { target_request_id: requestId, execution_reason: reason },
    );
    if (beginError) throw new Error(`begin:${beginError.code ?? "failed"}`);

    const execution = Array.isArray(beginRows) ? beginRows[0] : null;
    if (!execution) throw new Error("begin:empty");
    if (execution.status === "executed") {
      return respond({ requestId, status: "executed", idempotent: true });
    }

    targetProfileId = execution.target_profile_id;
    const { error: anonymizationError } = await adminClient.rpc(
      "anonymize_client_account_deletion",
      { target_request_id: requestId },
    );
    if (anonymizationError) {
      throw new Error(`anonymization:${anonymizationError.code ?? "failed"}`);
    }

    const { error: deletionError } = await adminClient.auth.admin.deleteUser(targetProfileId);
    if (deletionError && !isMissingAuthIdentity(deletionError)) {
      throw new Error(`auth:${deletionError.status ?? "failed"}`);
    }

    const { data: completion, error: completionError } = await adminClient.rpc(
      "complete_client_account_deletion",
      { target_request_id: requestId },
    );
    if (completionError) {
      throw new Error(`complete:${completionError.code ?? "failed"}`);
    }

    return respond({
      requestId,
      status: "executed",
      idempotent: Boolean(completion?.idempotent),
    });
  } catch (error) {
    const errorCode = safeErrorCode(error);
    await adminClient.rpc("fail_client_account_deletion", {
      target_request_id: requestId,
      target_error_code: errorCode,
    });
    return respond({ error: errorCode, retryable: true }, 500);
  } finally {
    targetProfileId = null;
  }
});
