import {
  createServiceClient,
  json,
  sanitizeErrorCode,
} from "../_shared/billing.ts";

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const raw = await request.text();
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const reference = String(payload.ref ?? payload.referencia ?? "");
    const providerId = String(payload.id ?? payload.id_nfse ?? "");
    const externalEventId = providerId
      ? `${providerId}:${String(payload.status ?? payload.status_nfse ?? "notification")}`
      : await sha256(raw);
    const client = createServiceClient();
    const { error } = await client.from("fiscal_events").insert({
      external_event_id: externalEventId,
      external_reference: reference || null,
      payload,
    });
    if (error && error.code !== "23505") throw error;
    // The notification never changes fiscal state directly. The worker fetches
    // the authoritative document from Focus NFe first.
    return json({ received: true });
  } catch (error) {
    return json({ error: sanitizeErrorCode(error) }, 400);
  }
});
