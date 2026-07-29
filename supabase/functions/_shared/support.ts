import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export const supportCorsHeaders = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};

export const supportJsonResponse = (
  body: Record<string, unknown>,
  status = 200,
) => new Response(JSON.stringify(body), { status, headers: supportCorsHeaders });

export const safeEquals = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

export interface SupportClients {
  user: User;
  userClient: SupabaseClient;
  adminClient: SupabaseClient;
}

export type SupportAuthenticationResult =
  | { ok: true; clients: SupportClients }
  | { ok: false; response: Response };

export const authenticateSupportRequest = async (
  request: Request,
): Promise<SupportAuthenticationResult> => {
  const authorization = request.headers.get("Authorization") ?? "";
  const accessToken = authorization.replace(/^Bearer\s+/i, "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY")
    ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (
    !accessToken
    || accessToken === authorization
    || !supabaseUrl
    || !publicKey
    || !serviceRoleKey
  ) {
    return {
      ok: false,
      response: supportJsonResponse({ error: "authentication_required" }, 401),
    };
  }

  const userClient = createClient(supabaseUrl, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await userClient.auth.getUser(accessToken);

  if (error || !data.user) {
    return {
      ok: false,
      response: supportJsonResponse({ error: "authentication_required" }, 401),
    };
  }

  return {
    ok: true,
    clients: { user: data.user, userClient, adminClient },
  };
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string => (
  typeof value === "string" && uuidPattern.test(value.trim())
);

export const parseOptionalText = (
  value: unknown,
  maximumLength: number,
): string | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maximumLength
    ? normalized
    : null;
};

export const normalizeMessage = (value: unknown) => (
  typeof value === "string"
    ? value.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim()
    : ""
);

export const normalizeSubject = (value: unknown) => (
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
);

const asPayload = (value: unknown): Record<string, unknown> => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const pickPayload = (
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> => {
  const source = asPayload(value);
  return Object.fromEntries(
    keys
      .filter((key) => source[key] !== undefined)
      .map((key) => [key, source[key]]),
  );
};

export const publicSupportTicketPayload = (value: unknown) => pickPayload(value, [
  "id",
  "protocol",
  "subject",
  "request_kind",
  "category",
  "impact",
  "priority",
  "status",
  "sync_status",
  "appointment_id",
  "created_at",
  "updated_at",
  "last_message_at",
  "resolved_at",
]);

export const publicSupportMessagePayload = (value: unknown) => pickPayload(value, [
  "id",
  "ticket_id",
  "author_kind",
  "author_display_name",
  "body",
  "created_at",
]);

export const safeSupportErrorCode = (value: unknown) => {
  const raw = value instanceof Error
    ? value.message
    : value && typeof value === "object" && "message" in value
    ? String((value as { message?: unknown }).message ?? "")
    : String(value ?? "");
  const knownCodes = [
    "support_disabled",
    "support_new_tickets_disabled",
    "support_rate_limited",
    "support_ticket_not_found",
    "support_ticket_closed",
    "support_invalid_request",
    "support_sync_not_configured",
    "support_external_rate_limited",
    "support_external_rejected",
    "support_external_unavailable",
  ];
  if (
    raw.includes("invalid_support_request_kind")
    || raw.includes("invalid_support_request_kind_impact")
    || raw.includes("invalid_support_category")
    || raw.includes("invalid_support_impact")
  ) {
    return "support_invalid_request";
  }
  return knownCodes.find((code) => raw.includes(code)) ?? "support_operation_failed";
};
