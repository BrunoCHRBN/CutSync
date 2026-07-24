import {
  createServiceClient,
  createStripe,
  assertBillingEnvironmentAllowed,
  corsHeaders,
  getRequiredEnv,
  json,
  requireBillingOwner,
  sanitizeErrorCode,
} from "../_shared/billing.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const input = await request.json() as { establishment_id?: string };
    if (!input.establishment_id) return json({ error: "establishment_required" }, 400);

    const client = createServiceClient();
    const { user, account } = await requireBillingOwner(
      request,
      client,
      input.establishment_id,
    );
    await assertBillingEnvironmentAllowed(client);
    const stripe = createStripe();

    const { data: existing } = await client
      .from("billing_subscriptions")
      .select("id, external_customer_id, status, current_period_ends_at")
      .eq("billing_account_id", account.id)
      .in("status", ["checkout_pending", "active", "past_due", "cancelled"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.status === "past_due") {
      return json({ error: "subscription_requires_portal" }, 409);
    }
    if (
      ["active", "cancelled"].includes(existing?.status ?? "") &&
      (!existing?.current_period_ends_at || new Date(existing.current_period_ends_at) > new Date())
    ) {
      return json({ error: "subscription_period_active" }, 409);
    }

    let customerId = existing?.external_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: account.billing_email || user.email,
        metadata: {
          billing_account_id: account.id,
          establishment_id: account.establishment_id,
        },
      }, { idempotencyKey: `billing-customer-${account.id}` });
      customerId = customer.id;
    }

    if (existing?.id) {
      await client.from("billing_subscriptions").update({
        external_customer_id: customerId,
        status: existing.status === "past_due" ? "past_due" : "checkout_pending",
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      const { error: insertError } = await client.from("billing_subscriptions").insert({
        billing_account_id: account.id,
        provider: "stripe",
        external_customer_id: customerId,
        status: "checkout_pending",
      });
      if (insertError) throw insertError;
    }

    const webUrl = getRequiredEnv("CUTSYNC_WEB_URL").replace(/\/+$/, "");
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: getRequiredEnv("STRIPE_OWNER_MONTHLY_PRICE_ID"), quantity: 1 }],
      success_url: `${webUrl}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${webUrl}/billing?checkout=cancelled`,
      allow_promotion_codes: false,
      billing_address_collection: "required",
      client_reference_id: account.id,
      metadata: {
        billing_account_id: account.id,
        establishment_id: account.establishment_id,
      },
      subscription_data: {
        metadata: {
          billing_account_id: account.id,
          establishment_id: account.establishment_id,
        },
      },
    }, { idempotencyKey: `checkout-${account.id}-${Math.floor(Date.now() / 600_000)}` });

    return json({ checkout_url: session.url });
  } catch (error) {
    const code = sanitizeErrorCode(error);
    const status = code.includes("authentication") ? 401
      : code.includes("billing_owner") ? 403
      : code.startsWith("missing_") ? 503 : 500;
    return json({ error: code }, status);
  }
});
