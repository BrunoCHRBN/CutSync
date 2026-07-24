import {
  createServiceClient,
  getRequiredEnv,
  json,
  requireJobSecret,
  sanitizeErrorCode,
} from "../_shared/billing.ts";
import { decryptDocument } from "../_shared/legal-identity.ts";

const focusBaseUrl = () =>
  Deno.env.get("FOCUS_NFE_ENVIRONMENT") === "production"
    ? "https://api.focusnfe.com.br"
    : "https://homologacao.focusnfe.com.br";

const focusFetch = async (path: string, init?: RequestInit) => {
  const authorization = btoa(`${getRequiredEnv("FOCUS_NFE_TOKEN")}:`);
  return fetch(`${focusBaseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${authorization}`,
      ...(init?.headers ?? {}),
    },
  });
};

const normalizedStatus = (raw: string) => {
  const status = raw.toLowerCase();
  if (["autorizado", "autorizada", "issued"].includes(status)) return "authorized";
  if (["cancelado", "cancelada", "cancelled"].includes(status)) return "cancelled";
  if (["processando_autorizacao", "processing"].includes(status)) return "processing";
  if (status.includes("erro")) return "error";
  return "processing";
};

const refreshDocument = async (
  client: ReturnType<typeof createServiceClient>,
  document: Record<string, any>,
) => {
  const response = await focusFetch(`/v2/nfse/${encodeURIComponent(document.external_reference)}`);
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`focus_lookup_${response.status}`);
  const result = await response.json();
  await client.from("fiscal_documents").update({
    external_document_id: String(result.id ?? result.id_nfse ?? "") || null,
    status: normalizedStatus(String(result.status ?? result.status_nfse ?? "processing")),
    number: String(result.numero ?? result.numero_nfse ?? "") || null,
    verification_code: String(result.codigo_verificacao ?? "") || null,
    issued_at: result.data_emissao ?? null,
    cancelled_at: result.data_cancelamento ?? null,
    last_error_code: result.erros?.[0]?.codigo ?? null,
    updated_at: new Date().toISOString(),
  }).eq("id", document.id);
  return true;
};

const issueDocument = async (
  client: ReturnType<typeof createServiceClient>,
  document: Record<string, any>,
) => {
  const { data: invoice, error } = await client.from("billing_invoices")
    .select("id, total_cents, currency, paid_at, billing_accounts(*)")
    .eq("id", document.billing_invoice_id)
    .single();
  if (error) throw error;
  const account = Array.isArray(invoice.billing_accounts)
    ? invoice.billing_accounts[0] : invoice.billing_accounts;
  let taxpayerDocument = account?.taxpayer_document ?? null;
  if (account?.legal_entity_id) {
    const { data: legalEntity, error: legalEntityError } = await client
      .from("legal_entities")
      .select("encrypted_document, encryption_iv, encryption_key_version")
      .eq("id", account.legal_entity_id)
      .single();
    if (legalEntityError || !legalEntity) throw new Error("fiscal_legal_identity_unavailable");
    taxpayerDocument = await decryptDocument(
      legalEntity.encrypted_document,
      legalEntity.encryption_iv,
      legalEntity.encryption_key_version,
    );
  }
  const { data: settings } = await client.from("platform_fiscal_settings")
    .select("*").eq("id", true).single();
  if (
    !settings || !taxpayerDocument || !settings.document_number || !settings.service_code ||
    !settings.retention_rules?.natureza_operacao ||
    typeof settings.retention_rules?.optante_simples_nacional !== "boolean"
  ) {
    await client.from("fiscal_documents").update({
      status: "error",
      last_error_code: "fiscal_configuration_pending",
      updated_at: new Date().toISOString(),
    }).eq("id", document.id);
    return;
  }
  if (settings.environment === "production" && !settings.production_enabled) {
    throw new Error("fiscal_production_disabled");
  }

  const payload = {
    data_emissao: invoice.paid_at,
    natureza_operacao: settings.retention_rules.natureza_operacao,
    regime_especial_tributacao: settings.tax_regime,
    optante_simples_nacional: settings.retention_rules.optante_simples_nacional,
    incentivador_cultural: Boolean(settings.retention_rules.incentivador_cultural),
    prestador: {
      cnpj: settings.document_number,
      inscricao_municipal: settings.municipal_registration,
      codigo_municipio: settings.retention_rules?.municipality_code,
    },
    tomador: {
      razao_social: account.taxpayer_name,
      email: account.billing_email,
      cnpj: taxpayerDocument.length === 14 ? taxpayerDocument : undefined,
      cpf: taxpayerDocument.length === 11 ? taxpayerDocument : undefined,
      endereco: account.fiscal_address,
    },
    servico: {
      aliquota: settings.tax_rate,
      discriminacao: "Assinatura mensal da plataforma CutSync",
      iss_retido: false,
      item_lista_servico: settings.service_code,
      codigo_cnae: settings.cnae,
      valor_servicos: invoice.total_cents / 100,
    },
  };
  const response = await focusFetch(
    `/v2/nfse?ref=${encodeURIComponent(document.external_reference)}`,
    { method: "POST", body: JSON.stringify(payload) },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 422) throw new Error(`focus_issue_${response.status}`);
  await client.from("fiscal_documents").update({
    external_document_id: String(result.id ?? result.id_nfse ?? "") || null,
    status: normalizedStatus(String(result.status ?? result.status_nfse ?? "processing")),
    number: String(result.numero ?? result.numero_nfse ?? "") || null,
    last_error_code: result.erros?.[0]?.codigo ?? null,
    updated_at: new Date().toISOString(),
  }).eq("id", document.id);
};

const cancelDocument = async (
  client: ReturnType<typeof createServiceClient>,
  document: Record<string, any>,
) => {
  const response = await focusFetch(
    `/v2/nfse/${encodeURIComponent(document.external_reference)}`,
    { method: "DELETE", body: JSON.stringify({ justificativa: "Reembolso total da assinatura CutSync" }) },
  );
  if (!response.ok && response.status !== 422) throw new Error(`focus_cancel_${response.status}`);
  await client.from("fiscal_documents").update({
    status: "processing",
    updated_at: new Date().toISOString(),
  }).eq("id", document.id);
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    requireJobSecret(request);
    const client = createServiceClient();

    const { data: notifications } = await client.from("fiscal_events")
      .select("id, external_reference, attempts")
      .in("status", ["pending", "retry"])
      .lte("available_at", new Date().toISOString())
      .order("id")
      .limit(25);
    for (const notification of notifications ?? []) {
      const { data: claimed } = await client.from("fiscal_events").update({
        status: "processing",
        locked_at: new Date().toISOString(),
        locked_by: crypto.randomUUID(),
      }).eq("id", notification.id).in("status", ["pending", "retry"]).select("id").maybeSingle();
      if (!claimed) continue;
      try {
        const { data: document } = await client.from("fiscal_documents")
          .select("*").eq("external_reference", notification.external_reference).maybeSingle();
        if (document) await refreshDocument(client, document);
        await client.from("fiscal_events").update({
          status: "processed", processed_at: new Date().toISOString(), last_error_code: null,
          locked_at: null, locked_by: null,
        }).eq("id", notification.id);
      } catch (error) {
        const attempts = notification.attempts + 1;
        await client.from("fiscal_events").update({
          status: attempts >= 8 ? "dead_letter" : "retry",
          attempts,
          available_at: new Date(Date.now() + Math.min(3600, 2 ** attempts * 15) * 1000).toISOString(),
          last_error_code: sanitizeErrorCode(error),
          locked_at: null,
          locked_by: null,
        }).eq("id", notification.id);
      }
    }

    const { data: documents } = await client.from("fiscal_documents")
      .select("*")
      .in("status", ["pending", "processing", "cancellation_requested"])
      .order("created_at")
      .limit(25);
    let processed = 0;
    let failed = 0;
    for (const document of documents ?? []) {
      try {
        if (document.status === "pending") {
          const { data: claimed } = await client.from("fiscal_documents").update({
            status: "processing",
            updated_at: new Date().toISOString(),
          }).eq("id", document.id).eq("status", "pending").select("id").maybeSingle();
          if (!claimed) continue;
          await issueDocument(client, document);
        }
        else if (document.status === "cancellation_requested") await cancelDocument(client, document);
        else await refreshDocument(client, document);
        processed += 1;
      } catch (error) {
        await client.from("fiscal_documents").update({
          status: document.status === "pending" ? "pending" : document.status,
          last_error_code: sanitizeErrorCode(error),
          updated_at: new Date().toISOString(),
        }).eq("id", document.id);
        failed += 1;
      }
    }
    return json({ notifications: notifications?.length ?? 0, processed, failed });
  } catch (error) {
    const code = sanitizeErrorCode(error);
    return json({ error: code }, code === "unauthorized" ? 401 : 500);
  }
});
