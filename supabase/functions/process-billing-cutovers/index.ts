import {
  createServiceClient,
  createStripe,
  json,
  requireJobSecret,
  sanitizeErrorCode,
} from "../_shared/billing.ts";

type CutoverRequest = {
  id: string;
  cutover_at: string;
  establishment_ids: string[];
  status: "scheduled" | "reconciling";
};

const liveStripeStatuses = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "incomplete",
]);

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    requireJobSecret(request);
    const client = createServiceClient();
    const stripe = createStripe();
    const { data, error } = await client
      .from("billing_cutover_requests")
      .select("id, cutover_at, establishment_ids, status")
      .in("status", ["scheduled", "reconciling"])
      .order("cutover_at")
      .limit(25);
    if (error) throw error;

    let cancellationScheduled = 0;
    let applied = 0;
    let pending = 0;
    let failed = 0;

    for (const raw of data ?? []) {
      const cutover = raw as CutoverRequest;
      try {
        const { data: accounts, error: accountsError } = await client
          .from("billing_accounts")
          .select("id")
          .in("establishment_id", cutover.establishment_ids);
        if (accountsError) throw accountsError;
        const accountIds = (accounts ?? []).map((account) => account.id);
        const { data: subscriptions, error: subscriptionsError } = accountIds.length
          ? await client
            .from("billing_subscriptions")
            .select("id, external_subscription_id, cancel_at_period_end")
            .in("billing_account_id", accountIds)
            .eq("provider", "stripe")
            .not("external_subscription_id", "is", null)
          : { data: [], error: null };
        if (subscriptionsError) throw subscriptionsError;

        let remoteStillLive = false;
        for (const subscription of subscriptions ?? []) {
          const externalId = subscription.external_subscription_id as string;
          let remote = await stripe.subscriptions.retrieve(externalId);
          if (
            liveStripeStatuses.has(remote.status) &&
            !remote.cancel_at_period_end
          ) {
            remote = await stripe.subscriptions.update(
              externalId,
              { cancel_at_period_end: true },
              { idempotencyKey: `billing-cutover-${cutover.id}-${externalId}` },
            );
            const { error: updateError } = await client
              .from("billing_subscriptions")
              .update({
                cancel_at_period_end: true,
                updated_at: new Date().toISOString(),
              })
              .eq("id", subscription.id);
            if (updateError) throw updateError;
            cancellationScheduled += 1;
          }
          if (
            liveStripeStatuses.has(remote.status) &&
            (
              !(remote as unknown as { current_period_end?: number }).current_period_end ||
              (remote as unknown as { current_period_end: number }).current_period_end * 1000 > Date.now()
            )
          ) {
            remoteStillLive = true;
          }
        }

        const { error: reconcilingError } = await client
          .from("billing_cutover_requests")
          .update({
            status: "reconciling",
            failure_code: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", cutover.id)
          .in("status", ["scheduled", "reconciling"]);
        if (reconcilingError) throw reconcilingError;

        if (new Date(cutover.cutover_at) <= new Date() && !remoteStillLive) {
          const { error: finalizeError } = await client.rpc(
            "finalize_organization_billing_cutover",
            { target_cutover_request_id: cutover.id },
          );
          if (finalizeError) throw finalizeError;
          applied += 1;
        } else {
          pending += 1;
        }
      } catch (cutoverError) {
        failed += 1;
        await client
          .from("billing_cutover_requests")
          .update({
            status: "reconciling",
            failure_code: sanitizeErrorCode(cutoverError),
            updated_at: new Date().toISOString(),
          })
          .eq("id", cutover.id);
      }
    }

    return json({
      inspected: data?.length ?? 0,
      cancellation_scheduled: cancellationScheduled,
      applied,
      pending,
      failed,
    });
  } catch (error) {
    const code = sanitizeErrorCode(error);
    return json({ error: code }, code === "unauthorized" ? 401 : 500);
  }
});
