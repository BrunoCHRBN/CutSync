import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseSecretKey } from "../_shared/supabase-keys.ts";

const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const MAX_BATCH_SIZE = 100;

interface ClaimedDelivery {
  delivery_id: string;
  expo_push_token: string;
  notification_title: string;
  notification_body: string;
  notification_payload: Record<string, unknown>;
}

interface ClaimedReceipt {
  delivery_id: string;
  expo_ticket_id: string;
}

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  details?: { error?: string };
}

interface ExpoReceipt {
  status: "ok" | "error";
  details?: { error?: string };
}

interface DispatchResult {
  claimed: number;
  ticketed: number;
  failed: number;
  error: boolean;
}

interface ReceiptResult {
  checked: number;
  delivered: number;
  error: boolean;
}

const jsonResponse = (body: Record<string, unknown>, status = 200) => (
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
);

const safeEquals = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

const expoHeaders = () => {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/json",
  };
  const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
};

const clampLimit = (value: unknown) => {
  const parsed = typeof value === "number" ? Math.trunc(value) : MAX_BATCH_SIZE;
  return Math.min(Math.max(parsed || MAX_BATCH_SIZE, 1), MAX_BATCH_SIZE);
};

const isRetryableExpoError = (errorCode: string | null) => (
  errorCode === "MessageRateExceeded"
);

const dispatchDeliveries = async (
  supabase: SupabaseClient,
  limit: number,
  claimFunction: string,
  completionFunction: string,
  channelId: "appointments" | "support",
): Promise<DispatchResult> => {
  const { data, error } = await supabase.rpc(claimFunction, {
    target_limit: limit,
  });
  if (error) return { claimed: 0, ticketed: 0, failed: 0, error: true };

  const deliveries = (data ?? []) as ClaimedDelivery[];
  if (deliveries.length === 0) {
    return { claimed: 0, ticketed: 0, failed: 0, error: false };
  }

  const response = await fetch(EXPO_SEND_URL, {
    method: "POST",
    headers: expoHeaders(),
    body: JSON.stringify(deliveries.map((delivery) => ({
      to: delivery.expo_push_token,
      sound: "default",
      channelId,
      title: delivery.notification_title,
      body: delivery.notification_body,
      data: delivery.notification_payload,
      priority: "high",
    }))),
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null);

  if (!response?.ok) {
    const retryable = response === null || response.status === 429 || response.status >= 500;
    await Promise.all(deliveries.map((delivery) => (
      supabase.rpc(completionFunction, {
        target_delivery_id: delivery.delivery_id,
        target_success: false,
        target_ticket_id: null,
        target_error_code: retryable
          ? "temporary_delivery_failure"
          : "invalid_delivery_request",
        target_retryable: retryable,
      })
    )));
    return {
      claimed: deliveries.length,
      ticketed: 0,
      failed: deliveries.length,
      error: false,
    };
  }

  const result = await response.json() as { data?: ExpoTicket[] };
  const tickets = Array.isArray(result.data) ? result.data : [];
  let ticketed = 0;
  let failed = 0;
  await Promise.all(deliveries.map(async (delivery, index) => {
    const ticket = tickets[index];
    const success = ticket?.status === "ok" && typeof ticket.id === "string";
    const errorCode = success ? null : ticket?.details?.error ?? "invalid_expo_ticket";
    const completion = await supabase.rpc(completionFunction, {
      target_delivery_id: delivery.delivery_id,
      target_success: success,
      target_ticket_id: success ? ticket.id : null,
      target_error_code: errorCode,
      target_retryable: isRetryableExpoError(errorCode),
    });
    if (completion.error || !success) failed += 1;
    else ticketed += 1;
  }));
  return { claimed: deliveries.length, ticketed, failed, error: false };
};

const checkReceipts = async (
  supabase: SupabaseClient,
  limit: number,
  claimFunction: string,
  completionFunction: string,
): Promise<ReceiptResult> => {
  const { data, error } = await supabase.rpc(claimFunction, {
    target_limit: limit,
  });
  if (error) return { checked: 0, delivered: 0, error: true };

  const pending = (data ?? []) as ClaimedReceipt[];
  if (pending.length === 0) return { checked: 0, delivered: 0, error: false };

  const response = await fetch(EXPO_RECEIPTS_URL, {
    method: "POST",
    headers: expoHeaders(),
    body: JSON.stringify({ ids: pending.map((item) => item.expo_ticket_id) }),
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null);
  if (!response?.ok) {
    return { checked: pending.length, delivered: 0, error: false };
  }

  const result = await response.json() as { data?: Record<string, ExpoReceipt> };
  const receipts = result.data ?? {};
  let delivered = 0;
  await Promise.all(pending.map(async (item) => {
    const receipt = receipts[item.expo_ticket_id];
    if (!receipt) return;
    const success = receipt.status === "ok";
    const completion = await supabase.rpc(completionFunction, {
      target_delivery_id: item.delivery_id,
      target_success: success,
      target_error_code: success
        ? null
        : receipt.details?.error ?? "delivery_failed",
    });
    if (!completion.error && success) delivered += 1;
  }));
  return { checked: pending.length, delivered, error: false };
};

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
  const limit = clampLimit(input.limit);
  const supabase = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let queuedReminders = 0;
  let appointmentDispatch: DispatchResult = {
    claimed: 0,
    ticketed: 0,
    failed: 0,
    error: false,
  };
  let supportDispatch: DispatchResult = {
    claimed: 0,
    ticketed: 0,
    failed: 0,
    error: false,
  };
  let appointmentReceipts: ReceiptResult = {
    checked: 0,
    delivered: 0,
    error: false,
  };
  let supportReceipts: ReceiptResult = {
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
      dispatchDeliveries(
        supabase,
        limit,
        "claim_client_push_deliveries",
        "complete_client_push_delivery",
        "appointments",
      ),
      dispatchDeliveries(
        supabase,
        limit,
        "claim_support_push_deliveries",
        "complete_support_push_delivery",
        "support",
      ),
    ]);
    if (appointmentDispatch.error || supportDispatch.error) {
      return jsonResponse({ error: "delivery_claim_failed" }, 500);
    }
  }

  if (mode === "receipts" || mode === "all") {
    [appointmentReceipts, supportReceipts] = await Promise.all([
      checkReceipts(
        supabase,
        limit,
        "claim_client_push_receipts",
        "complete_client_push_receipt",
      ),
      checkReceipts(
        supabase,
        limit,
        "claim_support_push_receipts",
        "complete_support_push_receipt",
      ),
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
