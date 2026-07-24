import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import {
  encryptDocument,
  fingerprintDocument,
  isValidCnpj,
  isValidCpf,
  normalizeBrazilPhone,
  normalizeDocument,
} from "../_shared/legal-identity.ts";

const headers = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};
const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });
const decodeClaims = (token: string) => {
  try {
    const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")));
  } catch {
    return null;
  }
};
const safeCode = (message: string) => {
  for (const code of [
    "invalid_document", "invalid_phone", "slug_unavailable", "invalid_registration",
    "aal2_required",
  ]) if (message.includes(code)) return code;
  return "registration_failed";
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return respond({ error: "method_not_allowed" }, 405);

  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  const url = Deno.env.get("SUPABASE_URL");
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!token || token === authorization || !url || !publicKey || !serviceKey) {
    return respond({ error: "authentication_required" }, 401);
  }

  const userClient = createClient(url, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) return respond({ error: "authentication_required" }, 401);
  if (decodeClaims(token)?.aal !== "aal2") return respond({ error: "aal2_required" }, 403);

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return respond({ error: "invalid_registration" }, 400);
  }
  const documentType = input.documentType === "CPF" ? "CPF" : input.documentType === "CNPJ" ? "CNPJ" : null;
  if (!documentType) {
    return respond({ error: "invalid_document" }, 400);
  }
  const document = normalizeDocument(documentType, String(input.document ?? ""));
  if (documentType === "CPF" ? !isValidCpf(document) : !isValidCnpj(document)) {
    return respond({ error: "invalid_document" }, 400);
  }

  try {
    const phone = normalizeBrazilPhone(String(input.phone ?? ""));
    const [fingerprint, encrypted] = await Promise.all([
      fingerprintDocument(document),
      encryptDocument(document),
    ]);
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await admin.rpc("register_business_identity_atomic", {
      actor_profile_id: userData.user.id,
      target_document_type: documentType,
      target_document_fingerprint: fingerprint,
      encrypted_document_value: encrypted.encryptedDocument,
      encryption_iv_value: encrypted.encryptionIv,
      encryption_key_version_value: encrypted.encryptionKeyVersion,
      target_document_last4: document.slice(-4),
      requested_name: String(input.name ?? ""),
      requested_slug: String(input.slug ?? ""),
      requested_address: String(input.address ?? ""),
      requested_phone: phone,
      requested_primary_color: String(input.primaryColor ?? "#F5A524"),
    });
    if (error) throw new Error(error.message);
    const result = Array.isArray(data) ? data[0] : data;
    return respond({
      status: result?.result_status,
      establishmentId: result?.establishment_id,
      organizationId: result?.organization_id,
    });
  } catch (error) {
    const code = safeCode(error instanceof Error ? error.message : "");
    return respond({ error: code }, code === "registration_failed" ? 500 : 400);
  }
});
