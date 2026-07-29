import "@supabase/functions-js/edge-runtime.d.ts";
import {
  getJsmRetryDelaySeconds,
  getJsmSafeErrorCode,
  JsmClient,
} from "../_shared/jsm.ts";
import {
  authenticateSupportRequest,
  isUuid,
  normalizeMessage,
  publicSupportMessagePayload,
  safeSupportErrorCode,
  supportCorsHeaders,
  supportJsonResponse,
} from "../_shared/support.ts";

const asObject = (value: unknown): Record<string, unknown> => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const asString = (value: unknown) => (
  typeof value === "string" && value.trim() ? value.trim() : null
);

const statusForDatabaseError = (code: string) => {
  if (code === "support_ticket_not_found") return 404;
  if (code === "support_ticket_closed" || code === "support_disabled") return 409;
  if (code === "support_rate_limited") return 429;
  if (code === "support_invalid_request") return 400;
  return 500;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: supportCorsHeaders });
  }
  if (request.method !== "POST") {
    return supportJsonResponse({ error: "method_not_allowed" }, 405);
  }

  const authentication = await authenticateSupportRequest(request);
  if (!authentication.ok) return authentication.response;
  const { user, userClient, adminClient } = authentication.clients;

  let input: Record<string, unknown>;
  try {
    input = asObject(await request.json());
  } catch {
    return supportJsonResponse({ error: "support_invalid_request" }, 400);
  }

  const ticketId = asString(input.ticketId);
  const message = normalizeMessage(input.message);
  const idempotencyKey = asString(input.idempotencyKey);
  if (
    !isUuid(ticketId)
    || !isUuid(idempotencyKey)
    || message.length < 1
    || message.length > 4_000
  ) {
    return supportJsonResponse({ error: "support_invalid_request" }, 400);
  }

  const { data, error } = await adminClient.rpc("add_support_message_internal", {
    actor_profile_id: user.id,
    target_ticket_id: ticketId,
    message_body: message,
    target_idempotency_key: idempotencyKey,
  });
  if (error) {
    const code = safeSupportErrorCode(error);
    return supportJsonResponse({ error: code }, statusForDatabaseError(code));
  }

  const result = asObject(data);
  const ticket = asObject(result.ticket);
  const supportMessage = asObject(result.message);
  const operation = asObject(result.operation);
  const messageId = asString(supportMessage.id ?? result.message_id);
  const operationId = asString(operation.id ?? result.operation_id);
  const issueKey = asString(ticket.jsm_issue_key);
  const persistedMessage = asString(supportMessage.body);
  const requesterMessage = publicSupportMessagePayload(supportMessage);

  if (!messageId || !operationId || !persistedMessage) {
    return supportJsonResponse({ error: "support_operation_failed" }, 500);
  }

  const capabilitiesResult = await userClient.rpc("get_support_capabilities");
  const capabilities = asObject(capabilitiesResult.data);
  if (capabilitiesResult.error || capabilities.sync_enabled !== true) {
    return supportJsonResponse({
      message: requesterMessage,
      status: "queued",
      queued: true,
    }, 202);
  }

  if (!issueKey) {
    return supportJsonResponse({
      message: requesterMessage,
      status: "queued",
      queued: true,
    }, 202);
  }

  const claim = await adminClient.rpc("claim_support_sync_operation", {
    target_operation_id: operationId,
  });
  if (claim.error) {
    return supportJsonResponse({ error: "support_operation_failed" }, 500);
  }
  if (claim.data !== true) {
    const synced = supportMessage.sync_status === "synced";
    const failed = supportMessage.sync_status === "failed";
    return supportJsonResponse({
      message: requesterMessage,
      status: failed ? "sync_failed" : synced ? "synced" : "queued",
      queued: !synced && !failed,
    }, synced || failed ? 200 : 202);
  }

  try {
    const jsm = new JsmClient();
    const commentId = await jsm.findPublicCommentByMessageId(issueKey, messageId)
      ?? await jsm.addPublicComment(issueKey, messageId, persistedMessage);
    const completion = await adminClient.rpc("complete_support_message_sync", {
      target_operation_id: operationId,
      target_message_id: messageId,
      target_jsm_comment_id: commentId,
    });
    if (completion.error) throw completion.error;

    return supportJsonResponse({
      message: {
        ...requesterMessage,
        id: messageId,
      },
      status: "synced",
      queued: false,
    }, 201);
  } catch (syncError) {
    const failure = await adminClient.rpc("fail_support_sync_operation", {
      target_operation_id: operationId,
      target_error_code: getJsmSafeErrorCode(syncError),
      target_retry_after_seconds: getJsmRetryDelaySeconds(syncError),
    });
    if (failure.error) {
      return supportJsonResponse({ error: "support_operation_failed" }, 500);
    }
    const failedPermanently = asString(asObject(failure.data).status)
      === "dead_letter";
    return supportJsonResponse({
      message: requesterMessage,
      status: failedPermanently ? "sync_failed" : "queued",
      queued: !failedPermanently,
    }, failedPermanently ? 200 : 202);
  }
});
