import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

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
  message?: string;
  details?: { error?: string };
}

interface ExpoReceipt {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
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
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "service_not_configured" }, 500);
  }

  let input: { mode?: "send" | "receipts" | "all"; limit?: number } = {};
  try {
    input = await request.json();
  } catch {
    // A chamada agendada pode omitir o corpo; nesse caso executamos o ciclo completo.
  }

  const mode = input.mode ?? "all";
  const limit = clampLimit(input.limit);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let queuedReminders = 0;
  let claimedDeliveries = 0;
  let ticketedDeliveries = 0;
  let failedDeliveries = 0;
  let checkedReceipts = 0;
  let deliveredReceipts = 0;

  if (mode === "send" || mode === "all") {
    const { data: reminderCount, error: reminderError } = await supabase.rpc(
      "queue_due_client_appointment_reminders",
      { target_now: new Date().toISOString() },
    );
    if (reminderError) return jsonResponse({ error: "reminder_queue_failed" }, 500);
    queuedReminders = Number(reminderCount ?? 0);

    const { data, error } = await supabase.rpc("claim_client_push_deliveries", {
      target_limit: limit,
    });
    if (error) return jsonResponse({ error: "delivery_claim_failed" }, 500);

    const deliveries = (data ?? []) as ClaimedDelivery[];
    claimedDeliveries = deliveries.length;

    if (deliveries.length > 0) {
      const response = await fetch(EXPO_SEND_URL, {
        method: "POST",
        headers: expoHeaders(),
        body: JSON.stringify(deliveries.map((delivery) => ({
          to: delivery.expo_push_token,
          sound: "default",
          channelId: "appointments",
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
          supabase.rpc("complete_client_push_delivery", {
            target_delivery_id: delivery.delivery_id,
            target_success: false,
            target_ticket_id: null,
            target_error_code: retryable ? "temporary_delivery_failure" : "invalid_delivery_request",
            target_retryable: retryable,
          })
        )));
        failedDeliveries += deliveries.length;
      } else {
        const result = await response.json() as { data?: ExpoTicket[] };
        const tickets = Array.isArray(result.data) ? result.data : [];

        await Promise.all(deliveries.map(async (delivery, index) => {
          const ticket = tickets[index];
          const success = ticket?.status === "ok" && typeof ticket.id === "string";
          const errorCode = success ? null : ticket?.details?.error ?? "invalid_expo_ticket";
          const { error: completionError } = await supabase.rpc("complete_client_push_delivery", {
            target_delivery_id: delivery.delivery_id,
            target_success: success,
            target_ticket_id: success ? ticket.id : null,
            target_error_code: errorCode,
            target_retryable: isRetryableExpoError(errorCode),
          });
          if (completionError || !success) failedDeliveries += 1;
          else ticketedDeliveries += 1;
        }));
      }
    }
  }

  if (mode === "receipts" || mode === "all") {
    const { data, error } = await supabase.rpc("claim_client_push_receipts", {
      target_limit: limit,
    });
    if (error) return jsonResponse({ error: "receipt_claim_failed" }, 500);

    const receiptsToCheck = (data ?? []) as ClaimedReceipt[];
    checkedReceipts = receiptsToCheck.length;

    if (receiptsToCheck.length > 0) {
      const response = await fetch(EXPO_RECEIPTS_URL, {
        method: "POST",
        headers: expoHeaders(),
        body: JSON.stringify({ ids: receiptsToCheck.map((item) => item.expo_ticket_id) }),
        signal: AbortSignal.timeout(12_000),
      }).catch(() => null);

      if (response?.ok) {
        const result = await response.json() as { data?: Record<string, ExpoReceipt> };
        const receipts = result.data ?? {};
        await Promise.all(receiptsToCheck.map(async (item) => {
          const receipt = receipts[item.expo_ticket_id];
          if (!receipt) return;

          const success = receipt.status === "ok";
          const { error: completionError } = await supabase.rpc("complete_client_push_receipt", {
            target_delivery_id: item.delivery_id,
            target_success: success,
            target_error_code: success ? null : receipt.details?.error ?? "delivery_failed",
          });
          if (!completionError && success) deliveredReceipts += 1;
        }));
      }
    }
  }

  return jsonResponse({
    queuedReminders,
    claimedDeliveries,
    ticketedDeliveries,
    failedDeliveries,
    checkedReceipts,
    deliveredReceipts,
  });
});
