import {
  createServiceClient,
  createStripe,
  corsHeaders,
  getRequiredEnv,
  json,
  requireEffectiveBillingOwner,
  requireOrganizationBillingOwner,
  sanitizeErrorCode,
} from "../_shared/billing.ts";

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
    const stripe = createStripe();
    const { account, billingScope, subscriptionId } = input.organization_id
      ? await requireOrganizationBillingOwner(request, client, input.organization_id)
      : await requireEffectiveBillingOwner(request, client, input.establishment_id!);
    const subscriptionTable = billingScope === "organization"
      ? "organization_subscriptions"
      : "billing_subscriptions";
    const query = client
      .from(subscriptionTable)
      .select("external_customer_id")
      .eq("billing_account_id", account.id)
      .not("external_customer_id", "is", null);
    const { data } = billingScope === "organization"
      ? await query.eq("id", subscriptionId).maybeSingle()
      : await query.order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (!data?.external_customer_id) return json({ error: "stripe_customer_not_found" }, 404);

    const webUrl = getRequiredEnv("CUTSYNC_WEB_URL").replace(/\/+$/, "");
    const portal = await stripe.billingPortal.sessions.create({
      customer: data.external_customer_id,
      return_url: billingScope === "organization"
        ? `${webUrl}/organization`
        : `${webUrl}/billing`,
    });
    return json({ portal_url: portal.url });
  } catch (error) {
    const code = sanitizeErrorCode(error);
    const status = code.includes("authentication") ? 401
      : code.includes("billing_owner") ? 403
      : code.startsWith("missing_") ? 503 : 500;
    return json({ error: code }, status);
  }
});
