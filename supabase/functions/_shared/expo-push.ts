import type { SupabaseClient } from "@supabase/supabase-js";

const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

export const MAX_EXPO_PUSH_BATCH_SIZE = 100;
export const MAX_OPAQUE_PUSH_RESOURCE_ID_LENGTH = 160;

const FORBIDDEN_OPAQUE_RESOURCE_ID_CHARACTERS = /[\/\\%?#\u0000-\u001f\u007f]/u;

export const normalizeOpaquePushResourceId = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > MAX_OPAQUE_PUSH_RESOURCE_ID_LENGTH) return null;
  if (value !== value.trim() || value === "." || value === "..") return null;
  if (FORBIDDEN_OPAQUE_RESOURCE_ID_CHARACTERS.test(value)) return null;
  return value;
};

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

export interface ExpoDispatchResult {
  claimed: number;
  ticketed: number;
  failed: number;
  error: boolean;
}

export interface ExpoReceiptResult {
  checked: number;
  delivered: number;
  error: boolean;
}

type PayloadSanitizer = (
  payload: Record<string, unknown>,
) => Record<string, unknown> | null;

interface DispatchDeliveriesOptions {
  supabase: SupabaseClient;
  limit: number;
  claimFunction: string;
  completionFunction: string;
  channelId: string | ((payload: Record<string, unknown>) => string);
  sanitizePayload?: PayloadSanitizer;
}

interface CheckReceiptsOptions {
  supabase: SupabaseClient;
  limit: number;
  claimFunction: string;
  completionFunction: string;
}

export const jsonResponse = (
  body: Record<string, unknown>,
  status = 200,
) => Response.json(body, {
  status,
  headers: { "Cache-Control": "no-store" },
});

export const safeEquals = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

export const clampExpoPushBatchLimit = (value: unknown) => {
  const parsed = typeof value === "number"
    ? Math.trunc(value)
    : MAX_EXPO_PUSH_BATCH_SIZE;
  return Math.min(
    Math.max(parsed || MAX_EXPO_PUSH_BATCH_SIZE, 1),
    MAX_EXPO_PUSH_BATCH_SIZE,
  );
};

export const pickStringPayload = (
  payload: Record<string, unknown>,
  allowedKeys: readonly string[],
) => Object.fromEntries(
  allowedKeys.flatMap((key) => (
    typeof payload[key] === "string" && payload[key].trim()
      ? [[key, payload[key].trim()]]
      : []
  )),
) as Record<string, string>;

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

const isRetryableExpoError = (errorCode: string | null) => (
  errorCode === "MessageRateExceeded"
);

const completeInvalidPayload = (
  supabase: SupabaseClient,
  completionFunction: string,
  deliveryId: string,
) => supabase.rpc(completionFunction, {
  target_delivery_id: deliveryId,
  target_success: false,
  target_ticket_id: null,
  target_error_code: "invalid_delivery_payload",
  target_retryable: false,
});

export const dispatchExpoPushDeliveries = async ({
  supabase,
  limit,
  claimFunction,
  completionFunction,
  channelId,
  sanitizePayload,
}: DispatchDeliveriesOptions): Promise<ExpoDispatchResult> => {
  const { data, error } = await supabase.rpc(claimFunction, {
    target_limit: limit,
  });
  if (error) return { claimed: 0, ticketed: 0, failed: 0, error: true };

  const deliveries = (data ?? []) as ClaimedDelivery[];
  if (deliveries.length === 0) {
    return { claimed: 0, ticketed: 0, failed: 0, error: false };
  }

  const sendable: Array<{
    delivery: ClaimedDelivery;
    payload: Record<string, unknown>;
  }> = [];
  const invalid: ClaimedDelivery[] = [];
  deliveries.forEach((delivery) => {
    const payload = sanitizePayload
      ? sanitizePayload(delivery.notification_payload)
      : delivery.notification_payload;
    if (payload) sendable.push({ delivery, payload });
    else invalid.push(delivery);
  });

  await Promise.all(invalid.map((delivery) => completeInvalidPayload(
    supabase,
    completionFunction,
    delivery.delivery_id,
  )));

  if (sendable.length === 0) {
    return {
      claimed: deliveries.length,
      ticketed: 0,
      failed: invalid.length,
      error: false,
    };
  }

  const response = await fetch(EXPO_SEND_URL, {
    method: "POST",
    headers: expoHeaders(),
    body: JSON.stringify(sendable.map(({ delivery, payload }) => ({
      to: delivery.expo_push_token,
      sound: "default",
      channelId: typeof channelId === "function" ? channelId(payload) : channelId,
      title: delivery.notification_title,
      body: delivery.notification_body,
      data: payload,
      priority: "high",
    }))),
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null);

  if (!response?.ok) {
    const retryable = response === null
      || response.status === 429
      || response.status >= 500;
    await Promise.all(sendable.map(({ delivery }) => (
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
  let failed = invalid.length;
  await Promise.all(sendable.map(async ({ delivery }, index) => {
    const ticket = tickets[index];
    const success = ticket?.status === "ok" && typeof ticket.id === "string";
    const errorCode = success
      ? null
      : ticket?.details?.error ?? "invalid_expo_ticket";
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

export const checkExpoPushReceipts = async ({
  supabase,
  limit,
  claimFunction,
  completionFunction,
}: CheckReceiptsOptions): Promise<ExpoReceiptResult> => {
  const { data, error } = await supabase.rpc(claimFunction, {
    target_limit: limit,
  });
  if (error) return { checked: 0, delivered: 0, error: true };

  const pending = (data ?? []) as ClaimedReceipt[];
  if (pending.length === 0) {
    return { checked: 0, delivered: 0, error: false };
  }

  const response = await fetch(EXPO_RECEIPTS_URL, {
    method: "POST",
    headers: expoHeaders(),
    body: JSON.stringify({ ids: pending.map((item) => item.expo_ticket_id) }),
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null);
  if (!response?.ok) {
    return { checked: pending.length, delivered: 0, error: false };
  }

  const result = await response.json() as {
    data?: Record<string, ExpoReceipt>;
  };
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
