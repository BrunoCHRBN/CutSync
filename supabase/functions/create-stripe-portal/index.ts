import {
  createServiceClient,
  createStripe,
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
    const stripe = createStripe();
    const { account } = await requireBillingOwner(request, client, input.establishment_id);
    const { data } = await client
      .from("billing_subscriptions")
      .select("external_customer_id")
      .eq("billing_account_id", account.id)
      .not("external_customer_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data?.external_customer_id) return json({ error: "stripe_customer_not_found" }, 404);

    const webUrl = getRequiredEnv("CUTSYNC_WEB_URL").replace(/\/+$/, "");
    const portal = await stripe.billingPortal.sessions.create({
      customer: data.external_customer_id,
      return_url: `${webUrl}/billing`,
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
