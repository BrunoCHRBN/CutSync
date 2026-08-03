import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import {
  checkExpoPushReceipts,
  clampExpoPushBatchLimit,
  dispatchExpoPushDeliveries,
  type ExpoDispatchResult,
  type ExpoReceiptResult,
  jsonResponse,
  safeEquals,
} from "../_shared/expo-push.ts";
import { getSupabaseSecretKey } from "../_shared/supabase-keys.ts";
import {
  sanitizeClientAppointmentPushPayload,
  sanitizeClientSupportPushPayload,
} from "./client-push-payload.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const dispatchSecret = Deno.env.get("NOTIFICATION_DISPATCH_SECRET");
  const suppliedSecret = request.headers.get("x-cutsync-dispatch-secret") ?? "";
  if (!dispatchSecret || !safeEquals(dispatchSecret, suppliedSecret)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  let secretKey: string;
  try {
    secretKey = getSupabaseSecretKey();
  } catch {
    return jsonResponse({ error: "service_not_configured" }, 500);
  }
  if (!supabaseUrl) {
    return jsonResponse({ error: "service_not_configured" }, 500);
  }

  let input: { mode?: "send" | "receipts" | "all"; limit?: number } = {};
  try {
    input = await request.json();
  } catch {
    // Scheduled calls may omit a body.
  }

  const mode = input.mode ?? "all";
  if (mode !== "send" && mode !== "receipts" && mode !== "all") {
    return jsonResponse({ error: "invalid_mode" }, 400);
  }
  const limit = clampExpoPushBatchLimit(input.limit);
  const supabase = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let queuedReminders = 0;
  let appointmentDispatch: ExpoDispatchResult = {
    claimed: 0,
    ticketed: 0,
    failed: 0,
    error: false,
  };
  let supportDispatch: ExpoDispatchResult = {
    claimed: 0,
    ticketed: 0,
    failed: 0,
    error: false,
  };
  let appointmentReceipts: ExpoReceiptResult = {
    checked: 0,
    delivered: 0,
    error: false,
  };
  let supportReceipts: ExpoReceiptResult = {
    checked: 0,
    delivered: 0,
    error: false,
  };

  if (mode === "send" || mode === "all") {
    const { data: reminderCount, error: reminderError } = await supabase.rpc(
      "queue_due_client_appointment_reminders",
      { target_now: new Date().toISOString() },
    );
    if (reminderError) return jsonResponse({ error: "reminder_queue_failed" }, 500);
    queuedReminders = Number(reminderCount ?? 0);

    [appointmentDispatch, supportDispatch] = await Promise.all([
      dispatchExpoPushDeliveries({
        supabase,
        limit,
        claimFunction: "claim_client_push_deliveries",
        completionFunction: "complete_client_push_delivery",
        channelId: "appointments",
        sanitizePayload: sanitizeClientAppointmentPushPayload,
      }),
      dispatchExpoPushDeliveries({
        supabase,
        limit,
        claimFunction: "claim_support_push_deliveries",
        completionFunction: "complete_support_push_delivery",
        channelId: "support",
        sanitizePayload: sanitizeClientSupportPushPayload,
      }),
    ]);
    if (appointmentDispatch.error || supportDispatch.error) {
      return jsonResponse({ error: "delivery_claim_failed" }, 500);
    }
  }

  if (mode === "receipts" || mode === "all") {
    [appointmentReceipts, supportReceipts] = await Promise.all([
      checkExpoPushReceipts({
        supabase,
        limit,
        claimFunction: "claim_client_push_receipts",
        completionFunction: "complete_client_push_receipt",
      }),
      checkExpoPushReceipts({
        supabase,
        limit,
        claimFunction: "claim_support_push_receipts",
        completionFunction: "complete_support_push_receipt",
      }),
    ]);
    if (appointmentReceipts.error || supportReceipts.error) {
      return jsonResponse({ error: "receipt_claim_failed" }, 500);
    }
  }

  return jsonResponse({
    queuedReminders,
    claimedDeliveries: appointmentDispatch.claimed + supportDispatch.claimed,
    ticketedDeliveries: appointmentDispatch.ticketed + supportDispatch.ticketed,
    failedDeliveries: appointmentDispatch.failed + supportDispatch.failed,
    checkedReceipts: appointmentReceipts.checked + supportReceipts.checked,
    deliveredReceipts: appointmentReceipts.delivered + supportReceipts.delivered,
    appointment: {
      claimedDeliveries: appointmentDispatch.claimed,
      ticketedDeliveries: appointmentDispatch.ticketed,
      failedDeliveries: appointmentDispatch.failed,
      checkedReceipts: appointmentReceipts.checked,
      deliveredReceipts: appointmentReceipts.delivered,
    },
    support: {
      claimedDeliveries: supportDispatch.claimed,
      ticketedDeliveries: supportDispatch.ticketed,
      failedDeliveries: supportDispatch.failed,
      checkedReceipts: supportReceipts.checked,
      deliveredReceipts: supportReceipts.delivered,
    },
  });
});
