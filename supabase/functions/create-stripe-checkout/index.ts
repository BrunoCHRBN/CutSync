import {
  createServiceClient,
  createStripe,
  assertBillingEnvironmentAllowed,
  corsHeaders,
  getRequiredEnv,
  json,
  requireEffectiveBillingOwner,
  requireOrganizationBillingOwner,
  sanitizeErrorCode,
} from "../_shared/billing.ts";

const assertPriceMatchesBillingTarget = async (
  stripe: ReturnType<typeof createStripe>,
  priceId: string,
  billingScope: "establishment" | "organization",
  networkPlan: boolean,
) => {
  const price = await stripe.prices.retrieve(priceId, { expand: ["tiers"] });
  if (
    price.active !== true ||
    price.currency.toLowerCase() !== "brl" ||
    price.type !== "recurring" ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1
  ) {
    throw new Error("stripe_price_configuration_invalid");
  }
  if (billingScope === "establishment" && price.unit_amount !== 4990) {
    throw new Error("stripe_owner_price_mismatch");
  }
  if (billingScope === "organization" && !networkPlan) {
    const tieredPrice = price as unknown as {
      billing_scheme?: string;
      tiers_mode?: string;
      tiers?: Array<{ up_to: number | null; unit_amount: number | null }>;
    };
    const tiers = tieredPrice.tiers ?? [];
    const validTiers = tieredPrice.billing_scheme === "tiered"
      && tieredPrice.tiers_mode === "graduated"
      && tiers.length === 3
      && tiers[0]?.up_to === 1
      && tiers[0]?.unit_amount === 4990
      && tiers[1]?.up_to === 2
      && tiers[1]?.unit_amount === 4490
      && tiers[2]?.up_to === null
      && tiers[2]?.unit_amount === 3990;
    if (!validTiers) throw new Error("stripe_organization_tiers_mismatch");
  }
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const input = await request.json() as {
      establishment_id?: string;
      organization_id?: string;
    };
    if (!input.establishment_id && !input.organization_id) {
      return json({ error: "billing_target_required" }, 400);
    }

    const client = createServiceClient();
    const {
      user,
      account,
      billingScope,
      subscriptionId,
      coveredEstablishmentIds,
      cutoverAt,
    } = input.organization_id
      ? await requireOrganizationBillingOwner(request, client, input.organization_id)
      : await requireEffectiveBillingOwner(request, client, input.establishment_id!);
    await assertBillingEnvironmentAllowed(client);
    const stripe = createStripe();

    const subscriptionTable = billingScope === "organization"
      ? "organization_subscriptions"
      : "billing_subscriptions";
    const periodColumn = billingScope === "organization"
      ? "current_period_end"
      : "current_period_ends_at";
    const result = billingScope === "organization"
      ? await client
        .from("organization_subscriptions")
        .select("id, external_customer_id, status, current_period_end, plan_id")
        .eq("billing_account_id", account.id)
        .eq("id", subscriptionId)
        .maybeSingle()
      : await client
        .from("billing_subscriptions")
        .select("id, external_customer_id, status, current_period_ends_at")
        .eq("billing_account_id", account.id)
        .in("status", ["checkout_pending", "active", "past_due", "cancelled"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    const existing = result.data as Record<string, any> | null;
    const existingError = result.error;
    if (existingError) throw existingError;
    if (billingScope === "organization" && !existing) {
      throw new Error("organization_subscription_required");
    }

    if (existing?.status === "past_due") {
      return json({ error: "subscription_requires_portal" }, 409);
    }
    const currentPeriodEnd = existing?.[periodColumn] as string | null | undefined;
    if (
      ["active", "cancelled", "canceled"].includes(existing?.status ?? "") &&
      (!currentPeriodEnd || new Date(currentPeriodEnd) > new Date())
    ) {
      return json({ error: "subscription_period_active" }, 409);
    }

    let customerId = existing?.external_customer_id as string | null;
    const referenceEstablishmentId = input.establishment_id
      ?? coveredEstablishmentIds[0];
    const metadata = {
      billing_scope: billingScope,
      billing_account_id: account.id,
      establishment_id: referenceEstablishmentId,
      ...(billingScope === "organization"
        ? {
            organization_id: account.organization_id!,
            organization_subscription_id: subscriptionId!,
          }
        : {}),
    };
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: account.billing_email || user.email,
        metadata,
      }, { idempotencyKey: `billing-customer-${account.id}` });
      customerId = customer.id;
    }

    if (existing?.id) {
      await client.from(subscriptionTable).update({
        external_customer_id: customerId,
        provider: "stripe",
        status: existing.status === "past_due" ? "past_due" : "checkout_pending",
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else if (billingScope === "establishment") {
      const { error: insertError } = await client.from("billing_subscriptions").insert({
        billing_account_id: account.id,
        provider: "stripe",
        external_customer_id: customerId,
        status: "checkout_pending",
      });
      if (insertError) throw insertError;
    }

    let priceId = getRequiredEnv("STRIPE_OWNER_MONTHLY_PRICE_ID");
    let quantity = 1;
    let networkPlan = false;
    if (billingScope === "organization") {
      quantity = coveredEstablishmentIds.length;
      if (quantity < 1) throw new Error("organization_units_required");
      const { data: plan, error: planError } = await client
        .from("organization_billing_plans")
        .select("code, is_network")
        .eq("id", existing!.plan_id)
        .single();
      if (planError || !plan) throw new Error("organization_plan_not_found");
      if (quantity >= 5 && !plan.is_network) throw new Error("network_plan_required");
      networkPlan = Boolean(plan.is_network);
      priceId = plan.is_network
        ? getRequiredEnv("STRIPE_ORGANIZATION_NETWORK_PRICE_ID")
        : getRequiredEnv("STRIPE_ORGANIZATION_MONTHLY_PRICE_ID");
    }
    await assertPriceMatchesBillingTarget(
      stripe,
      priceId,
      billingScope,
      networkPlan,
    );

    const webUrl = getRequiredEnv("CUTSYNC_WEB_URL").replace(/\/+$/, "");
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity }],
      success_url: billingScope === "organization"
        ? `${webUrl}/organization?checkout=success&organization_id=${account.organization_id}`
        : `${webUrl}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: billingScope === "organization"
        ? `${webUrl}/organization?checkout=cancelled&organization_id=${account.organization_id}`
        : `${webUrl}/billing?checkout=cancelled`,
      allow_promotion_codes: false,
      billing_address_collection: "required",
      client_reference_id: account.id,
      metadata,
      subscription_data: {
        metadata,
        ...(billingScope === "organization" && cutoverAt
          ? { trial_end: Math.floor(new Date(cutoverAt).getTime() / 1000) }
          : {}),
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
