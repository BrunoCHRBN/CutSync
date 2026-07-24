import {
  createServiceClient,
  json,
  requireJobSecret,
  sanitizeErrorCode,
  toIso,
} from "../_shared/billing.ts";

type StripeObject = Record<string, any>;

const accountForObject = async (client: ReturnType<typeof createServiceClient>, object: StripeObject) => {
  const metadataAccount = object.metadata?.billing_account_id
    ?? object.subscription_details?.metadata?.billing_account_id;
  if (metadataAccount) return String(metadataAccount);
  const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
  if (!customerId) return null;
  const { data } = await client
    .from("billing_subscriptions")
    .select("billing_account_id")
    .eq("provider", "stripe")
    .eq("external_customer_id", customerId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.billing_account_id ?? null;
};

const subscriptionId = (object: StripeObject) => {
  if (object.object === "subscription") return object.id as string;
  if (typeof object.subscription === "string") return object.subscription;
  return object.subscription?.id ?? object.parent?.subscription_details?.subscription ?? null;
};

const mapSubscriptionStatus = (status: string, cancelAtPeriodEnd: boolean) => {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (status === "canceled" && cancelAtPeriodEnd) return "cancelled";
  if (status === "canceled" || status === "incomplete_expired") return "expired";
  return "checkout_pending";
};

const upsertSubscription = async (
  client: ReturnType<typeof createServiceClient>,
  accountId: string,
  object: StripeObject,
  eventCreatedAt: string,
  allowActivation = false,
) => {
  const externalId = subscriptionId(object);
  if (!externalId) return null;
  const { data: current } = await client
    .from("billing_subscriptions")
    .select("id, status, provider_event_created_at, grace_ends_at")
    .eq("provider", "stripe")
    .eq("external_subscription_id", externalId)
    .maybeSingle();
  if (
    current?.provider_event_created_at &&
    new Date(current.provider_event_created_at) > new Date(eventCreatedAt)
  ) {
    if (allowActivation && ["checkout_pending", "past_due"].includes(current.status)) {
      await client.from("billing_subscriptions").update({
        status: "active",
        grace_started_at: null,
        grace_ends_at: null,
        updated_at: new Date().toISOString(),
      }).eq("id", current.id);
    }
    return current.id;
  }

  let mappedStatus = mapSubscriptionStatus(object.status, Boolean(object.cancel_at_period_end));
  if (
    mappedStatus === "active" &&
    !allowActivation &&
    !["active", "cancelled"].includes(current?.status ?? "")
  ) {
    mappedStatus = "checkout_pending";
  }
  const values = {
    billing_account_id: accountId,
    provider: "stripe",
    external_customer_id: typeof object.customer === "string" ? object.customer : object.customer?.id,
    external_subscription_id: externalId,
    status: mappedStatus,
    provider_event_created_at: eventCreatedAt,
    current_period_starts_at: toIso(object.current_period_start),
    current_period_ends_at: toIso(object.current_period_end),
    cancel_at_period_end: Boolean(object.cancel_at_period_end),
    grace_started_at: mappedStatus === "active" ? null : undefined,
    grace_ends_at: mappedStatus === "active" ? null : undefined,
    cancelled_at: toIso(object.canceled_at),
    ended_at: toIso(object.ended_at),
    updated_at: new Date().toISOString(),
  };
  let data: { id: string } | null = null;
  let error: { message: string } | null = null;
  if (!current) {
    const { data: placeholder } = await client.from("billing_subscriptions")
      .select("id")
      .eq("billing_account_id", accountId)
      .eq("provider", "stripe")
      .is("external_subscription_id", null)
      .in("status", ["checkout_pending", "past_due"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (placeholder) {
      const result = await client.from("billing_subscriptions")
        .update(values).eq("id", placeholder.id).select("id").single();
      data = result.data;
      error = result.error;
    }
  }
  if (!data && !error) {
    const result = await client.from("billing_subscriptions")
      .upsert(values, { onConflict: "provider,external_subscription_id" })
      .select("id").single();
    data = result.data;
    error = result.error;
  }
  if (error) throw error;
  return data!.id as string;
};

const processEvent = async (
  client: ReturnType<typeof createServiceClient>,
  event: StripeObject,
  providerCreatedAt: string,
) => {
  const supportedEvents = new Set([
    "invoice.paid",
    "invoice.payment_failed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "charge.refunded",
  ]);
  if (!supportedEvents.has(event.type)) return;
  const object = event.data?.object as StripeObject;
  if (!object) throw new Error("invalid_event_payload");
  const accountId = await accountForObject(client, object);
  if (!accountId) throw new Error("billing_account_not_resolved");

  if (event.type === "invoice.paid") {
    const subscription = await upsertSubscription(
      client,
      accountId,
      {
        ...object,
        object: "subscription",
        id: subscriptionId(object),
        status: "active",
        current_period_start: object.period_start,
        current_period_end: object.period_end,
      },
      providerCreatedAt,
      true,
    );
    const { data: currentInvoice } = await client.from("billing_invoices")
      .select("id, provider_event_created_at")
      .eq("provider", "stripe")
      .eq("external_invoice_id", object.id)
      .maybeSingle();
    if (
      currentInvoice?.provider_event_created_at &&
      new Date(currentInvoice.provider_event_created_at) > new Date(providerCreatedAt)
    ) return;
    const { data: invoice, error } = await client.from("billing_invoices").upsert({
      billing_account_id: accountId,
      billing_subscription_id: subscription,
      provider: "stripe",
      external_invoice_id: object.id,
      number: object.number,
      currency: String(object.currency ?? "brl").toUpperCase(),
      subtotal_cents: object.subtotal ?? 0,
      total_cents: object.total ?? 0,
      paid_cents: object.amount_paid ?? object.total ?? 0,
      refunded_cents: 0,
      status: "paid",
      paid_at: toIso(object.status_transitions?.paid_at) ?? providerCreatedAt,
      hosted_invoice_url: object.hosted_invoice_url,
      invoice_pdf_url: object.invoice_pdf,
      provider_event_created_at: providerCreatedAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: "provider,external_invoice_id" }).select("id").single();
    if (error) throw error;
    await client.from("billing_accounts").update({
      trial_ends_at: new Date().toISOString(),
      transition_ends_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", accountId);
    await client.from("fiscal_documents").upsert({
      billing_invoice_id: invoice.id,
      external_reference: String(invoice.id).replaceAll("-", ""),
      status: "pending",
    }, { onConflict: "billing_invoice_id", ignoreDuplicates: true });
    return;
  }

  if (event.type === "invoice.payment_failed") {
    const externalId = subscriptionId(object);
    if (!externalId) throw new Error("subscription_not_resolved");
    const { data: current } = await client
      .from("billing_subscriptions")
      .select("id, grace_ends_at, provider_event_created_at")
      .eq("provider", "stripe")
      .eq("external_subscription_id", externalId)
      .maybeSingle();
    if (
      current?.provider_event_created_at &&
      new Date(current.provider_event_created_at) > new Date(providerCreatedAt)
    ) return;
    const failedAt = new Date(providerCreatedAt);
    await client.from("billing_subscriptions").update({
      status: "past_due",
      grace_started_at: current?.grace_ends_at ? undefined : failedAt.toISOString(),
      grace_ends_at: current?.grace_ends_at
        ?? new Date(failedAt.getTime() + 7 * 86_400_000).toISOString(),
      provider_event_created_at: providerCreatedAt,
      updated_at: new Date().toISOString(),
    }).eq("id", current?.id);
    return;
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated"
  ) {
    await upsertSubscription(client, accountId, object, providerCreatedAt);
    return;
  }

  if (event.type === "customer.subscription.deleted") {
    const id = await upsertSubscription(client, accountId, object, providerCreatedAt);
    const periodEnd = toIso(object.current_period_end);
    await client.from("billing_subscriptions").update({
      status: periodEnd && new Date(periodEnd) > new Date() ? "cancelled" : "expired",
      current_period_ends_at: periodEnd,
      cancel_at_period_end: true,
      ended_at: periodEnd && new Date(periodEnd) > new Date() ? null : providerCreatedAt,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    return;
  }

  if (event.type === "charge.refunded") {
    const invoiceId = typeof object.invoice === "string" ? object.invoice : object.invoice?.id;
    if (!invoiceId) return;
    const { data: invoice } = await client.from("billing_invoices")
      .select("id, paid_cents").eq("provider", "stripe").eq("external_invoice_id", invoiceId).maybeSingle();
    if (!invoice) return;
    const refunded = object.amount_refunded ?? 0;
    const full = refunded >= invoice.paid_cents;
    await client.from("billing_invoices").update({
      refunded_cents: refunded,
      status: full ? "refunded" : "partially_refunded",
      updated_at: new Date().toISOString(),
    }).eq("id", invoice.id);
    await client.from("fiscal_documents").update(full
      ? { status: "cancellation_requested", updated_at: new Date().toISOString() }
      : {
          status: "manual_review",
          manual_review_reason: "partial_refund",
          updated_at: new Date().toISOString(),
        }).eq("billing_invoice_id", invoice.id);
  }
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    requireJobSecret(request);
    const client = createServiceClient();
    const workerId = crypto.randomUUID();
    const { data: candidates, error } = await client.from("billing_events")
      .select("id, payload, provider_created_at")
      .in("status", ["pending", "retry"])
      .lte("available_at", new Date().toISOString())
      .order("id")
      .limit(25);
    if (error) throw error;

    let processed = 0;
    let retried = 0;
    for (const candidate of candidates ?? []) {
      const { data: claimed } = await client.from("billing_events").update({
        status: "processing",
        locked_at: new Date().toISOString(),
        locked_by: workerId,
      }).eq("id", candidate.id).in("status", ["pending", "retry"]).select("id, attempts").maybeSingle();
      if (!claimed) continue;
      try {
        await processEvent(client, candidate.payload, candidate.provider_created_at);
        await client.from("billing_events").update({
          status: "processed", processed_at: new Date().toISOString(), locked_at: null,
          locked_by: null, last_error_code: null,
        }).eq("id", candidate.id);
        processed += 1;
      } catch (eventError) {
        const attempts = (claimed.attempts ?? 0) + 1;
        await client.from("billing_events").update({
          status: attempts >= 8 ? "dead_letter" : "retry",
          attempts,
          available_at: new Date(Date.now() + Math.min(3600, 2 ** attempts * 15) * 1000).toISOString(),
          locked_at: null,
          locked_by: null,
          last_error_code: sanitizeErrorCode(eventError),
        }).eq("id", candidate.id);
        retried += 1;
      }
    }
    return json({ processed, retried });
  } catch (error) {
    const code = sanitizeErrorCode(error);
    return json({ error: code }, code === "unauthorized" ? 401 : 500);
  }
});
