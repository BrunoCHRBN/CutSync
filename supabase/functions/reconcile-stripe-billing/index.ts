import {
  createServiceClient,
  createStripe,
  json,
  requireJobSecret,
  sanitizeErrorCode,
} from "../_shared/billing.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    requireJobSecret(request);
    const client = createServiceClient();
    const stripe = createStripe();
    const { data: subscriptions, error } = await client
      .from("billing_subscriptions")
      .select("external_subscription_id")
      .eq("provider", "stripe")
      .not("external_subscription_id", "is", null)
      .limit(100);
    if (error) throw error;

    let queued = 0;
    for (const row of subscriptions ?? []) {
      const subscription = await stripe.subscriptions.retrieve(row.external_subscription_id);
      const version = subscription.current_period_end ?? Math.floor(Date.now() / 1000);
      const { error: enqueueError } = await client.from("billing_events").insert({
        provider: "stripe",
        external_event_id: `reconcile-subscription-${subscription.id}-${version}`,
        event_type: "customer.subscription.updated",
        provider_created_at: new Date().toISOString(),
        payload: {
          id: `reconcile-subscription-${subscription.id}-${version}`,
          type: "customer.subscription.updated",
          created: Math.floor(Date.now() / 1000),
          data: { object: subscription },
        },
      });
      if (!enqueueError) queued += 1;
      else if (enqueueError.code !== "23505") throw enqueueError;

      const invoices = await stripe.invoices.list({
        subscription: subscription.id,
        status: "paid",
        limit: 3,
      });
      for (const invoice of invoices.data) {
        const paidAt = invoice.status_transitions?.paid_at ?? invoice.created;
        const { error: invoiceError } = await client.from("billing_events").insert({
          provider: "stripe",
          external_event_id: `reconcile-invoice-${invoice.id}-${paidAt}`,
          event_type: "invoice.paid",
          provider_created_at: new Date(paidAt * 1000).toISOString(),
          payload: {
            id: `reconcile-invoice-${invoice.id}-${paidAt}`,
            type: "invoice.paid",
            created: paidAt,
            data: { object: invoice },
          },
        });
        if (!invoiceError) queued += 1;
        else if (invoiceError.code !== "23505") throw invoiceError;
      }
    }
    return json({ inspected: subscriptions?.length ?? 0, queued });
  } catch (error) {
    const code = sanitizeErrorCode(error);
    return json({ error: code }, code === "unauthorized" ? 401 : 500);
  }
});
