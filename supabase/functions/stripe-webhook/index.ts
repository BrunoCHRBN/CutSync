import Stripe from "npm:stripe@18.5.0";
import {
  createServiceClient,
  createStripe,
  getRequiredEnv,
  json,
  sanitizeErrorCode,
} from "../_shared/billing.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const signature = request.headers.get("stripe-signature");
  if (!signature) return json({ error: "missing_signature" }, 400);

  try {
    const rawBody = await request.text();
    const stripe = createStripe();
    const event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      getRequiredEnv("STRIPE_WEBHOOK_SECRET"),
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
    const client = createServiceClient();
    const { error } = await client.from("billing_events").insert({
      provider: "stripe",
      external_event_id: event.id,
      event_type: event.type,
      provider_created_at: new Date(event.created * 1000).toISOString(),
      payload: event,
    });
    if (error && error.code !== "23505") throw error;
    return json({ received: true });
  } catch (error) {
    const code = sanitizeErrorCode(error);
    return json({ error: code }, code.includes("signature") ? 400 : 500);
  }
});
