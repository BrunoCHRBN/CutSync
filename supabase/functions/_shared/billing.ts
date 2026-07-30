import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.110.3";
import Stripe from "npm:stripe@18.5.0";
import { getSupabaseSecretKey } from "./supabase-keys.ts";

export type ServiceClient = SupabaseClient;

const allowedWebOrigin = () => {
  try {
    return new URL(Deno.env.get("CUTSYNC_WEB_URL") ?? "http://localhost:8081").origin;
  } catch {
    return "http://localhost:8081";
  }
};

export const corsHeaders = () => ({
  "Access-Control-Allow-Origin": allowedWebOrigin(),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

export const json = (body: Record<string, unknown>, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });

export const getRequiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
};

export const createServiceClient = () =>
  createClient(
    getRequiredEnv("SUPABASE_URL"),
    getSupabaseSecretKey(),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

export const createStripe = () =>
  new Stripe(getRequiredEnv("STRIPE_SECRET_KEY"), {
    apiVersion: "2025-08-27.basil",
    httpClient: Stripe.createFetchHttpClient(),
  });

export const assertBillingEnvironmentAllowed = async (client: ServiceClient) => {
  const stripeKey = getRequiredEnv("STRIPE_SECRET_KEY");
  if (!stripeKey.startsWith("sk_live_")) return;
  const { data, error } = await client
    .from("platform_fiscal_settings")
    .select("production_enabled, accountant_approved_at")
    .eq("id", true)
    .single();
  if (error || !data?.production_enabled || !data.accountant_approved_at) {
    throw new Error("production_billing_disabled");
  }
};

export const requireUser = async (request: Request, client: ServiceClient) => {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("authentication_required");
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new Error("authentication_required");
  return data.user;
};

export const requireBillingOwner = async (
  request: Request,
  client: ServiceClient,
  establishmentId: string,
) => {
  const user = await requireUser(request, client);
  const { data, error } = await client
    .from("billing_accounts")
    .select("id, establishment_id, billing_owner_profile_id, billing_email")
    .eq("establishment_id", establishmentId)
    .eq("billing_owner_profile_id", user.id)
    .single();
  if (error || !data) throw new Error("billing_owner_required");
  return { user, account: data };
};

export type EffectiveBillingOwner = {
  user: Awaited<ReturnType<typeof requireUser>>;
  billingScope: "establishment" | "organization";
  account: {
    id: string;
    billing_email: string | null;
    billing_owner_profile_id: string | null;
    establishment_id?: string;
    organization_id?: string;
  };
  subscriptionId: string | null;
  coveredEstablishmentIds: string[];
  cutoverAt: string | null;
};

export const requireEffectiveBillingOwner = async (
  request: Request,
  client: ServiceClient,
  establishmentId: string,
): Promise<EffectiveBillingOwner> => {
  const user = await requireUser(request, client);
  const { data, error } = await client.rpc("resolve_business_billing_context", {
    target_establishment_id: establishmentId,
  });
  const rawContext = Array.isArray(data) ? data[0] : data;
  const context = rawContext as Record<string, unknown> | null;
  if (
    error ||
    !context ||
    context.billing_owner_profile_id !== user.id ||
    !["establishment", "organization"].includes(String(context.billing_scope))
  ) {
    throw new Error("billing_owner_required");
  }

  const billingScope = context.billing_scope as "establishment" | "organization";
  const table = billingScope === "organization"
    ? "organization_billing_accounts"
    : "billing_accounts";
  const columns = billingScope === "organization"
    ? "id, organization_id, billing_owner_profile_id, billing_email"
    : "id, establishment_id, billing_owner_profile_id, billing_email";
  const { data: account, error: accountError } = await client
    .from(table)
    .select(columns)
    .eq("id", String(context.billing_account_id))
    .single();
  if (accountError || !account) throw new Error("billing_owner_required");

  return {
    user,
    billingScope,
    account: account as EffectiveBillingOwner["account"],
    subscriptionId: context.subscription_id ? String(context.subscription_id) : null,
    coveredEstablishmentIds: Array.isArray(context.covered_establishment_ids)
      ? context.covered_establishment_ids.map(String)
      : [establishmentId],
    cutoverAt: context.pending_change_at ? String(context.pending_change_at) : null,
  };
};

export const requireOrganizationBillingOwner = async (
  request: Request,
  client: ServiceClient,
  organizationId: string,
): Promise<EffectiveBillingOwner> => {
  const user = await requireUser(request, client);
  const { data: account, error: accountError } = await client
    .from("organization_billing_accounts")
    .select("id, organization_id, billing_owner_profile_id, billing_email")
    .eq("organization_id", organizationId)
    .eq("billing_owner_profile_id", user.id)
    .single();
  if (accountError || !account) throw new Error("billing_owner_required");
  const { data: subscription, error: subscriptionError } = await client
    .from("organization_subscriptions")
    .select("id")
    .eq("billing_account_id", account.id)
    .neq("status", "canceled")
    .maybeSingle();
  if (subscriptionError || !subscription) {
    throw new Error("organization_subscription_required");
  }
  const { data: cutover, error: cutoverError } = await client
    .from("billing_cutover_requests")
    .select("establishment_ids, cutover_at")
    .eq("organization_subscription_id", subscription.id)
    .in("status", ["scheduled", "reconciling"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cutoverError) throw cutoverError;
  let coveredEstablishmentIds = cutover?.establishment_ids?.map(String) ?? [];
  if (!coveredEstablishmentIds.length) {
    const { data: coverage, error: coverageError } = await client
      .from("billing_coverage_assignments")
      .select("establishment_id")
      .eq("organization_subscription_id", subscription.id)
      .eq("status", "active");
    if (coverageError) throw coverageError;
    coveredEstablishmentIds = (coverage ?? []).map((item) => String(item.establishment_id));
  }
  if (!coveredEstablishmentIds.length) throw new Error("organization_cutover_required");

  return {
    user,
    billingScope: "organization",
    account: account as EffectiveBillingOwner["account"],
    subscriptionId: subscription.id,
    coveredEstablishmentIds,
    cutoverAt: cutover?.cutover_at ? String(cutover.cutover_at) : null,
  };
};

export const safeEquals = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

export const requireJobSecret = (request: Request) => {
  const expected = getRequiredEnv("BILLING_JOB_SECRET");
  const supplied = request.headers.get("x-cutsync-job-secret") ?? "";
  if (!safeEquals(expected, supplied)) throw new Error("unauthorized");
};

export const sanitizeErrorCode = (error: unknown) => {
  const raw = error instanceof Error ? error.message : "unknown_error";
  return raw.toLowerCase().replace(/[^a-z0-9_:-]+/g, "_").slice(0, 120);
};

export const toIso = (unixSeconds: number | null | undefined) =>
  unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;
