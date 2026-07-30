import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getJsmRetryDelaySeconds,
  getJsmSafeErrorCode,
  JsmClient,
  stripCutSyncCommentMarkers,
  type JsmTicketInput,
} from "../_shared/jsm.ts";
import {
  safeEquals,
  supportJsonResponse,
} from "../_shared/support.ts";
import { getSupabaseSecretKey } from "../_shared/supabase-keys.ts";

interface ClaimedOperation {
  operation_id: string;
  operation_type: "create_ticket" | "add_comment" | "update_ticket" | "reconcile_ticket";
  ticket_id: string;
  message_id: string | null;
  payload: Record<string, unknown>;
}

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

const asIssueKey = (value: unknown) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z][A-Z0-9_]{0,49}-[1-9][0-9]*$/.test(normalized)
    ? normalized
    : null;
};

const clampLimit = (value: unknown, fallback: number, maximum: number) => {
  const parsed = typeof value === "number" ? Math.trunc(value) : fallback;
  return Math.min(Math.max(parsed || fallback, 1), maximum);
};

const normalizeImportedComment = (body: string) => {
  const normalized = body.trim();
  if (normalized.length <= 4000) return normalized;
  const notice = "\n\n[Mensagem truncada pelo limite de 4.000 caracteres do CutSync.]";
  return `${normalized.slice(0, 4000 - notice.length).trimEnd()}${notice}`;
};

const loadTicket = async (admin: SupabaseClient, ticketId: string) => {
  const { data, error } = await admin
    .from("support_tickets")
    .select("*")
    .eq("id", ticketId)
    .maybeSingle();
  if (error || !data) throw new Error("support_ticket_not_found");
  return asObject(data);
};

const loadTeamCode = async (
  admin: SupabaseClient,
  teamId: unknown,
) => {
  if (typeof teamId !== "string") return "SUPORTE_GERAL";
  const { data } = await admin
    .from("support_teams")
    .select("code")
    .eq("id", teamId)
    .maybeSingle();
  return asString(asObject(data).code) ?? "SUPORTE_GERAL";
};

const loadInitialMessage = async (
  admin: SupabaseClient,
  ticketId: string,
) => {
  const { data, error } = await admin
    .from("support_messages")
    .select("body")
    .eq("ticket_id", ticketId)
    .eq("author_kind", "requester")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Error("support_message_not_found");
  return asString(asObject(data).body) ?? "";
};

const completeGenericOperation = async (
  admin: SupabaseClient,
  operationId: string,
) => {
  const { error } = await admin
    .from("support_sync_operations")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      locked_at: null,
      last_error_code: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", operationId)
    .eq("status", "processing");
  if (error) throw error;
};

const processCreateOperation = async (
  admin: SupabaseClient,
  jsm: JsmClient,
  operation: ClaimedOperation,
) => {
  const ticket = await loadTicket(admin, operation.ticket_id);
  const teamCode = await loadTeamCode(admin, ticket.team_id);
  const initialMessage = asString(operation.payload.initial_message)
    ?? await loadInitialMessage(admin, operation.ticket_id);
  const input: JsmTicketInput = {
    ticketId: operation.ticket_id,
    protocol: asString(ticket.protocol) ?? operation.ticket_id,
    subject: asString(ticket.subject) ?? "Solicitação CutSync",
    message: initialMessage,
    requestKind: asString(ticket.request_kind) ?? "incident",
    product: asString(ticket.product) ?? "client",
    category: asString(ticket.category) ?? "other",
    requesterRole: asString(ticket.requester_role) ?? "client",
    teamCode,
    locationLabel: asString(ticket.location_label),
    escalationLevel: asNumber(ticket.escalation_level),
    routingVersion: asNumber(ticket.routing_version, 1),
    impact: asString(ticket.impact) ?? "normal",
    priority: asString(ticket.priority) ?? "normal",
  };
  let createAttempted = false;
  let reference = await jsm.findRequestByTicketId(operation.ticket_id);
  if (!reference) {
    if (operation.payload.creation_unknown === true) {
      throw new Error("support_creation_still_unknown");
    }
    try {
      createAttempted = true;
      reference = await jsm.createRequest(input);
    } catch (error) {
      if (getJsmSafeErrorCode(error) === "support_external_unavailable") {
        throw new Error("support_creation_unknown");
      }
      throw error;
    }
  }
  const { error } = await admin.rpc("complete_support_ticket_creation", {
    target_operation_id: operation.operation_id,
    target_ticket_id: operation.ticket_id,
    target_jsm_issue_id: reference.issueId,
    target_jsm_issue_key: reference.issueKey,
    target_jsm_issue_url: reference.issueUrl,
  });
  if (error) {
    // The issue may already exist while JQL is still eventually consistent.
    // Force lookup-only retries after a successful POST whose local completion
    // could not be persisted.
    if (createAttempted) throw new Error("support_creation_unknown");
    throw error;
  }
};

const processCommentOperation = async (
  admin: SupabaseClient,
  jsm: JsmClient,
  operation: ClaimedOperation,
) => {
  if (!operation.message_id) throw new Error("support_message_not_found");
  const ticket = await loadTicket(admin, operation.ticket_id);
  const issueKey = asString(ticket.jsm_issue_key);
  if (!issueKey) throw new Error("support_ticket_not_synced");

  const { data: messageData, error: messageError } = await admin
    .from("support_messages")
    .select("body")
    .eq("id", operation.message_id)
    .eq("ticket_id", operation.ticket_id)
    .maybeSingle();
  const body = asString(asObject(messageData).body);
  if (messageError || !body) throw new Error("support_message_not_found");

  const commentId = await jsm.findPublicCommentByMessageId(
    issueKey,
    operation.message_id,
  ) ?? await jsm.addPublicComment(issueKey, operation.message_id, body);
  const { error } = await admin.rpc("complete_support_message_sync", {
    target_operation_id: operation.operation_id,
    target_message_id: operation.message_id,
    target_jsm_comment_id: commentId,
  });
  if (error) throw error;
};

const processUpdateOperation = async (
  admin: SupabaseClient,
  jsm: JsmClient,
  operation: ClaimedOperation,
) => {
  const ticket = await loadTicket(admin, operation.ticket_id);
  const issueKey = asString(ticket.jsm_issue_key);
  if (!issueKey) throw new Error("support_ticket_not_synced");
  const teamCode = await loadTeamCode(admin, ticket.team_id);
  await jsm.updateRoutingFields(issueKey, {
    escalationLevel: asNumber(ticket.escalation_level),
    teamCode,
    priority: asString(ticket.priority) ?? "normal",
  });
  await completeGenericOperation(admin, operation.operation_id);
};

const failOperation = async (
  admin: SupabaseClient,
  operationId: string,
  error: unknown,
  operationType?: ClaimedOperation["operation_type"],
) => {
  const rawCode = error instanceof Error ? error.message : "";
  const preservedCode = [
    "support_ticket_not_synced",
    "support_creation_unknown",
    "support_creation_still_unknown",
  ].includes(rawCode);
  const errorCode = preservedCode
    ? rawCode
    : getJsmSafeErrorCode(error);
  const retryDelay = preservedCode
    ? 60
    : getJsmRetryDelaySeconds(error)
      ?? (operationType === "create_ticket"
          && errorCode === "support_external_unavailable"
        ? 300
        : null);
  await admin.rpc("fail_support_sync_operation", {
    target_operation_id: operationId,
    target_error_code: errorCode,
    target_retry_after_seconds: retryDelay,
  });
};

const reconcileTicket = async (
  admin: SupabaseClient,
  jsm: JsmClient,
  row: Record<string, unknown>,
) => {
  const ticketId = asString(row.ticket_id ?? row.id);
  const issueKey = asString(row.jsm_issue_key);
  if (!ticketId || !issueKey) return false;

  const [snapshot, comments] = await Promise.all([
    jsm.getIssueSnapshot(issueKey),
    jsm.listPublicComments(issueKey),
  ]);
  let importFailures = 0;
  for (const comment of comments) {
    if (jsm.isCutSyncRequesterComment(comment)) continue;
    const publicBody = normalizeImportedComment(
      stripCutSyncCommentMarkers(comment.body),
    );
    if (!publicBody) continue;
    const imported = await admin.rpc("import_support_public_message", {
      target_ticket_id: ticketId,
      target_jsm_comment_id: comment.id,
      message_body: publicBody,
      target_author_jira_account_id: comment.authorAccountId,
      target_author_name: comment.authorDisplayName,
      target_created_at: comment.createdAt,
    });
    // Keep importing later comments even if one row fails. A final failure
    // still makes the worker unhealthy and causes a retry; already imported
    // comments are idempotent by their JSM comment id.
    if (imported.error) importFailures += 1;
  }

  // Import replies first: the importer moves the ticket to waiting_user and
  // enqueues one reply notification. Applying the same Jira status afterwards
  // is then idempotent and does not generate a duplicate waiting-user push.
  const { error } = await admin.rpc("apply_support_reconciliation", {
    target_ticket_id: ticketId,
    target_status: snapshot.status,
    target_assignee_jira_account_id: snapshot.assigneeAccountId,
    target_assignee_name: snapshot.assigneeDisplayName,
    target_jsm_updated_at: snapshot.updatedAt,
    target_first_response_due_at: snapshot.firstResponseDueAt,
    target_first_responded_at: snapshot.firstRespondedAt,
    target_sla_breached: snapshot.slaBreached,
  });
  if (error) throw error;

  if (importFailures > 0) throw new Error("support_comment_import_failed");
  return true;
};

const reconcileIssueKey = async (
  admin: SupabaseClient,
  jsm: JsmClient,
  issueKey: string,
) => {
  const { data, error } = await admin
    .from("support_tickets")
    .select("id, jsm_issue_key")
    .eq("jsm_issue_key", issueKey)
    .is("content_purged_at", null)
    .maybeSingle();
  if (error) throw new Error("support_reconciliation_lookup_failed");
  if (!data) return false;

  return reconcileTicket(admin, jsm, {
    ticket_id: data.id,
    jsm_issue_key: data.jsm_issue_key,
  });
};

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return supportJsonResponse({ error: "method_not_allowed" }, 405);
  }

  let input: Record<string, unknown> = {};
  try {
    input = asObject(await request.json());
  } catch {
    // Scheduled calls may omit a body.
  }
  const hasIssueKey = Object.hasOwn(input, "issueKey");
  const issueKey = asIssueKey(input.issueKey);
  if (hasIssueKey && !issueKey) {
    return supportJsonResponse({ error: "support_invalid_issue_key" }, 400);
  }

  const expectedSecret = issueKey
    ? Deno.env.get("SUPPORT_JSM_WEBHOOK_SECRET") ?? ""
    : Deno.env.get("SUPPORT_JOB_SECRET") ?? "";
  const suppliedSecret = issueKey
    ? request.headers.get("x-cutsync-support-event-secret") ?? ""
    : request.headers.get("x-cutsync-support-secret") ?? "";
  if (!expectedSecret || !safeEquals(expectedSecret, suppliedSecret)) {
    return supportJsonResponse({ error: "unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  let secretKey: string;
  try {
    secretKey = getSupabaseSecretKey();
  } catch {
    return supportJsonResponse({ error: "service_not_configured" }, 500);
  }
  if (!supabaseUrl) {
    return supportJsonResponse({ error: "service_not_configured" }, 500);
  }

  const operationLimit = clampLimit(input.operationLimit, 25, 100);
  const ticketLimit = clampLimit(input.ticketLimit, 50, 100);
  const admin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const capabilitiesResult = await admin.rpc("get_support_capabilities");
  const capabilities = asObject(capabilitiesResult.data);
  if (capabilitiesResult.error) {
    return supportJsonResponse({ error: "support_capabilities_failed" }, 500);
  }
  if (capabilities.sync_enabled !== true) {
    const purgeResult = await admin.rpc("purge_expired_support_content");
    if (purgeResult.error) {
      return supportJsonResponse({
        error: "support_content_purge_failed",
        healthy: false,
        paused: true,
      }, 500);
    }
    return supportJsonResponse({
      healthy: true,
      paused: true,
      purgedTickets: Number(purgeResult.data ?? 0),
    });
  }

  if (issueKey) {
    let jsm: JsmClient;
    try {
      jsm = new JsmClient();
    } catch {
      return supportJsonResponse({
        error: "support_sync_not_configured",
        mode: "event",
      }, 503);
    }

    try {
      const reconciled = await reconcileIssueKey(admin, jsm, issueKey);
      return supportJsonResponse({
        healthy: true,
        mode: "event",
        issueKey,
        reconciled,
        ignored: !reconciled,
      });
    } catch (error) {
      const errorCode = error instanceof Error
        && error.message === "support_reconciliation_lookup_failed"
        ? error.message
        : getJsmSafeErrorCode(error);
      const retryAfterSeconds = getJsmRetryDelaySeconds(error);
      return supportJsonResponse({
        error: errorCode,
        healthy: false,
        mode: "event",
        issueKey,
        retryAfterSeconds,
      }, errorCode === "support_external_rate_limited" ? 429 : 502);
    }
  }

  const { data: claimedData, error: claimError } = await admin.rpc(
    "claim_support_sync_operations",
    { target_limit: operationLimit },
  );
  if (claimError) {
    return supportJsonResponse({ error: "support_operation_claim_failed" }, 500);
  }

  const claimed = (Array.isArray(claimedData) ? claimedData : []).map((raw) => {
    const row = asObject(raw);
    return {
      operation_id: asString(row.operation_id) ?? "",
      operation_type: asString(row.operation_type) as ClaimedOperation["operation_type"],
      ticket_id: asString(row.ticket_id) ?? "",
      message_id: asString(row.message_id),
      payload: asObject(row.payload),
    };
  }).filter((operation) => (
    operation.operation_id
    && operation.ticket_id
    && ["create_ticket", "add_comment", "update_ticket", "reconcile_ticket"]
      .includes(operation.operation_type)
  ));

  let completedOperations = 0;
  let failedOperations = 0;
  let reconciledTickets = 0;
  let reconciliationFailures = 0;
  let jsm: JsmClient;
  try {
    jsm = new JsmClient();
  } catch (error) {
    await Promise.all(claimed.map((operation) => (
      failOperation(admin, operation.operation_id, error)
    )));
    return supportJsonResponse({
      error: "support_sync_not_configured",
      claimedOperations: claimed.length,
    }, 503);
  }

  for (const operation of claimed) {
    try {
      if (operation.operation_type === "create_ticket") {
        await processCreateOperation(admin, jsm, operation);
      } else if (operation.operation_type === "add_comment") {
        await processCommentOperation(admin, jsm, operation);
      } else if (operation.operation_type === "reconcile_ticket") {
        const ticket = await loadTicket(admin, operation.ticket_id);
        const reconciled = await reconcileTicket(admin, jsm, {
          ticket_id: operation.ticket_id,
          jsm_issue_key: ticket.jsm_issue_key,
        });
        if (!reconciled) throw new Error("support_ticket_not_synced");
        await completeGenericOperation(admin, operation.operation_id);
      } else {
        await processUpdateOperation(admin, jsm, operation);
      }
      completedOperations += 1;
    } catch (error) {
      await failOperation(admin, operation.operation_id, error, operation.operation_type);
      failedOperations += 1;
    }
  }

  const { data: ticketData, error: ticketError } = await admin.rpc(
    "list_support_tickets_for_reconciliation",
    { target_limit: ticketLimit },
  );
  if (!ticketError) {
    for (const rawTicket of Array.isArray(ticketData) ? ticketData : []) {
      try {
        if (await reconcileTicket(admin, jsm, asObject(rawTicket))) {
          reconciledTickets += 1;
        }
      } catch {
        reconciliationFailures += 1;
      }
    }
  }

  const purgeResult = await admin.rpc("purge_expired_support_content");
  if (ticketError || purgeResult.error) {
    return supportJsonResponse({
      error: ticketError
        ? "support_reconciliation_list_failed"
        : "support_content_purge_failed",
      healthy: false,
      claimedOperations: claimed.length,
      completedOperations,
      failedOperations,
      reconciledTickets,
      reconciliationFailures,
    }, 500);
  }

  return supportJsonResponse({
    healthy: failedOperations === 0 && reconciliationFailures === 0,
    claimedOperations: claimed.length,
    completedOperations,
    failedOperations,
    reconciledTickets,
    reconciliationFailures,
    purgedTickets: Number(purgeResult.data ?? 0),
  });
});
