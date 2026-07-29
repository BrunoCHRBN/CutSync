import "@supabase/functions-js/edge-runtime.d.ts";
import {
  authenticateSupportRequest,
  isUuid,
  publicSupportTicketPayload,
  supportCorsHeaders,
  supportJsonResponse,
} from "../_shared/support.ts";

const asObject = (value: unknown): Record<string, unknown> => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: supportCorsHeaders });
  }
  if (request.method !== "POST") {
    return supportJsonResponse({ error: "method_not_allowed" }, 405);
  }

  const authentication = await authenticateSupportRequest(request);
  if (!authentication.ok) return authentication.response;
  const { user, adminClient } = authentication.clients;

  let input: Record<string, unknown>;
  try {
    input = asObject(await request.json());
  } catch {
    return supportJsonResponse({ error: "support_invalid_request" }, 400);
  }

  if (!isUuid(input.ticketId)) {
    return supportJsonResponse({ error: "support_invalid_request" }, 400);
  }

  const { data, error } = await adminClient.rpc(
    "queue_support_ticket_sync_internal",
    {
      actor_profile_id: user.id,
      target_ticket_id: input.ticketId,
    },
  );
  if (error) {
    const status = error.message.includes("support_ticket_not_found") ? 404
      : error.message.includes("support_rate_limited") ? 429
      : 500;
    return supportJsonResponse({
      error: status === 404
        ? "support_ticket_not_found"
        : status === 429
        ? "support_rate_limited"
        : "support_operation_failed",
    }, status);
  }

  const result = asObject(data);
  return supportJsonResponse({
    queued: true,
    ticket: publicSupportTicketPayload(result.ticket ?? result),
  }, 202);
});
