import "@supabase/functions-js/edge-runtime.d.ts";
import {
  getJsmRetryDelaySeconds,
  getJsmSafeErrorCode,
  JsmClient,
  type JsmTicketInput,
} from "../_shared/jsm.ts";
import {
  authenticateSupportRequest,
  isUuid,
  normalizeMessage,
  normalizeSubject,
  parseOptionalText,
  publicSupportTicketPayload,
  safeSupportErrorCode,
  supportCorsHeaders,
  supportJsonResponse,
} from "../_shared/support.ts";

const categories = new Set([
  "access_identity",
  "booking",
  "marketplace",
  "security_privacy",
  "other",
]);
const incidentImpacts = new Set(["normal", "high", "critical"]);

const asObject = (value: unknown): Record<string, unknown> => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const asString = (value: unknown) => (
  typeof value === "string" && value.trim() ? value.trim() : null
);

const asNumber = (value: unknown, fallback = 0) => (
  typeof value === "number" && Number.isFinite(value) ? value : fallback
);

const statusForDatabaseError = (code: string) => {
  if (code === "support_disabled" || code === "support_new_tickets_disabled") return 503;
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

  let rawInput: Record<string, unknown>;
  try {
    rawInput = asObject(await request.json());
  } catch {
    return supportJsonResponse({ error: "support_invalid_request" }, 400);
  }

  const category = asString(rawInput.category);
  const requestKind = asString(rawInput.requestKind);
  const impact = asString(rawInput.impact);
  const subject = normalizeSubject(rawInput.subject);
  const message = normalizeMessage(rawInput.message);
  const appointmentId = parseOptionalText(rawInput.appointmentId, 128);
  const idempotencyKey = asString(rawInput.idempotencyKey);

  if (requestKind !== "incident") {
    return supportJsonResponse({ error: "support_incident_required" }, 400);
  }

  if (
    !category
    || !categories.has(category)
    || !impact
    || !incidentImpacts.has(impact)
    || subject.length < 5
    || subject.length > 120
    || message.length < 20
    || message.length > 4_000
    || !isUuid(idempotencyKey)
    || (rawInput.appointmentId !== null
      && rawInput.appointmentId !== undefined
      && !appointmentId)
  ) {
    return supportJsonResponse({ error: "support_invalid_request" }, 400);
  }

  const { data, error } = await adminClient.rpc("create_support_ticket_internal_v2", {
    actor_profile_id: user.id,
    target_request_kind: requestKind,
    target_category: category,
    target_impact: impact,
    target_subject: subject,
    initial_message: message,
    target_appointment_id: appointmentId,
    target_idempotency_key: idempotencyKey,
  });

  if (error) {
    const code = safeSupportErrorCode(error);
    return supportJsonResponse({ error: code }, statusForDatabaseError(code));
  }

  const result = asObject(data);
  const ticket = asObject(result.ticket ?? result);
  const operation = asObject(result.operation);
  const ticketId = asString(ticket.id ?? result.ticket_id);
  const operationId = asString(operation.id ?? result.operation_id);
  const protocol = asString(ticket.protocol);
  const requesterTicket = publicSupportTicketPayload(ticket);

  if (!ticketId || !operationId || !protocol) {
    return supportJsonResponse({ error: "support_operation_failed" }, 500);
  }

  const initialMessageResult = await adminClient
    .from("support_messages")
    .select("body")
    .eq("ticket_id", ticketId)
    .eq("author_kind", "requester")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const persistedInitialMessage = asString(
    asObject(initialMessageResult.data).body,
  );
  if (initialMessageResult.error || !persistedInitialMessage) {
    return supportJsonResponse({ error: "support_operation_failed" }, 500);
  }

  const capabilitiesResult = await userClient.rpc("get_support_capabilities");
  const capabilities = asObject(capabilitiesResult.data);
  if (capabilitiesResult.error || capabilities.sync_enabled !== true) {
    return supportJsonResponse({
      ticket: requesterTicket,
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
    const synced = ticket.sync_status === "synced";
    const failed = ticket.sync_status === "failed";
    return supportJsonResponse({
      ticket: failed
        ? { ...requesterTicket, status: "sync_failed", sync_status: "failed" }
        : requesterTicket,
      status: failed ? "sync_failed" : synced ? "synced" : "queued",
      queued: !synced && !failed,
    }, synced || failed ? 200 : 202);
  }

  const ticketInput: JsmTicketInput = {
    ticketId,
    protocol,
    subject: asString(ticket.subject) ?? subject,
    message: persistedInitialMessage,
    requestKind: asString(ticket.request_kind) ?? requestKind,
    product: asString(ticket.product) ?? "client",
    category: asString(ticket.category) ?? category,
    requesterRole: asString(ticket.requester_role) ?? "client",
    teamCode: asString(ticket.team_code) ?? "SUPORTE_GERAL",
    locationLabel: asString(ticket.location_label),
    escalationLevel: asNumber(ticket.escalation_level),
    routingVersion: asNumber(ticket.routing_version, 1),
    impact: asString(ticket.impact) ?? impact,
    priority: asString(ticket.priority) ?? impact,
  };

  let createAttempted = false;
  try {
    const jsm = new JsmClient();
    let reference = await jsm.findRequestByTicketId(ticketId);
    if (!reference) {
      createAttempted = true;
      reference = await jsm.createRequest(ticketInput);
    }
    const completion = await adminClient.rpc("complete_support_ticket_creation", {
      target_operation_id: operationId,
      target_ticket_id: ticketId,
      target_jsm_issue_id: reference.issueId,
      target_jsm_issue_key: reference.issueKey,
      target_jsm_issue_url: reference.issueUrl,
    });
    if (completion.error) throw completion.error;

    return supportJsonResponse({
      ticket: {
        ...requesterTicket,
        id: ticketId,
        protocol,
        status: "open",
        sync_status: "synced",
      },
      status: "synced",
      queued: false,
    }, 201);
  } catch (syncError) {
    const safeErrorCode = getJsmSafeErrorCode(syncError);
    const errorCode = createAttempted
        && safeErrorCode === "support_external_unavailable"
      ? "support_creation_unknown"
      : safeErrorCode;
    const retryDelay = getJsmRetryDelaySeconds(syncError)
      ?? (errorCode === "support_creation_unknown"
          || errorCode === "support_external_unavailable"
        ? 300
        : null);
    const failure = await adminClient.rpc("fail_support_sync_operation", {
      target_operation_id: operationId,
      target_error_code: errorCode,
      target_retry_after_seconds: retryDelay,
    });
    if (failure.error) {
      return supportJsonResponse({ error: "support_operation_failed" }, 500);
    }
    const failedPermanently = asString(asObject(failure.data).status)
      === "dead_letter";
    return supportJsonResponse({
      ticket: failedPermanently
        ? { ...requesterTicket, status: "sync_failed", sync_status: "failed" }
        : requesterTicket,
      status: failedPermanently ? "sync_failed" : "queued",
      queued: !failedPermanently,
    }, failedPermanently ? 201 : 202);
  }
});
