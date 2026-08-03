import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import {
  checkExpoPushReceipts,
  clampExpoPushBatchLimit,
  dispatchExpoPushDeliveries,
  jsonResponse,
  safeEquals,
} from "../_shared/expo-push.ts";
import { getSupabaseSecretKey } from "../_shared/supabase-keys.ts";
import {
  getBusinessPushChannelId,
  sanitizeBusinessPushPayload,
} from "./business-push-payload.ts";
type DispatchMode = "send" | "receipts" | "all";

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

  let input: { mode?: DispatchMode; limit?: number } = {};
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
  let dispatch = {
    claimed: 0,
    ticketed: 0,
    failed: 0,
    error: false,
  };
  let receipts = {
    checked: 0,
    delivered: 0,
    error: false,
  };

  if (mode === "send" || mode === "all") {
    dispatch = await dispatchExpoPushDeliveries({
      supabase,
      limit,
      claimFunction: "claim_business_push_deliveries",
      completionFunction: "complete_business_push_delivery",
      channelId: getBusinessPushChannelId,
      sanitizePayload: sanitizeBusinessPushPayload,
    });
    if (dispatch.error) {
      return jsonResponse({ error: "delivery_claim_failed" }, 500);
    }
  }

  if (mode === "receipts" || mode === "all") {
    receipts = await checkExpoPushReceipts({
      supabase,
      limit,
      claimFunction: "claim_business_push_receipts",
      completionFunction: "complete_business_push_receipt",
    });
    if (receipts.error) {
      return jsonResponse({ error: "receipt_claim_failed" }, 500);
    }
  }

  return jsonResponse({
    claimedDeliveries: dispatch.claimed,
    ticketedDeliveries: dispatch.ticketed,
    failedDeliveries: dispatch.failed,
    checkedReceipts: receipts.checked,
    deliveredReceipts: receipts.delivered,
  });
});
