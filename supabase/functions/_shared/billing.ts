import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.110.3";
import Stripe from "npm:stripe@18.5.0";

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
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

export const createStripe = () =>
  new Stripe(getRequiredEnv("STRIPE_SECRET_KEY"), {
    apiVersion: "2025-06-30.basil",
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
