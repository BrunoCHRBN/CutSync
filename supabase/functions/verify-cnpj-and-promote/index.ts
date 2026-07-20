import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

export default {
  fetch: withSupabase({ auth: ["publishable"] }, async (req, ctx) => {
    // 1. Validar autenticação do usuário logado
    const userId = ctx.user?.id;
    if (!userId) {
      return Response.json({ error: "Sessão inválida ou não autenticada." }, { status: 401 });
    }

    try {
      const { cnpj, name, slug, address, phone, primary_color } = await req.json();

      if (!cnpj || !slug) {
        return Response.json({ error: "CNPJ e Endereço digital (slug) são obrigatórios." }, { status: 400 });
      }

      const cleanCnpj = String(cnpj).replace(/[^0-9]/g, "");
      if (cleanCnpj.length !== 14) {
        return Response.json({ error: "CNPJ deve conter exatamente 14 dígitos numéricos." }, { status: 400 });
      }

      // 2. Fazer triagem automatizada com a BrasilAPI
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
      if (!response.ok) {
        return Response.json({ error: "Não foi possível validar o CNPJ junto à Receita Federal." }, { status: 400 });
      }

      const data = await response.json();

      // Validar status ATIVA
      const statusText = String(data.descricao_situacao_cadastral || data.situacao || "").toUpperCase();
      const isActive = statusText === "ATIVA" || data.situacao_cadastral === 2;

      if (!isActive) {
        return Response.json({ error: `CNPJ inválido para onboarding. Situação cadastral: ${statusText}` }, { status: 400 });
      }

      // Validar CNAE elegível (Beleza / Estética)
      const cleanCnae = (code: any) => String(code || "").replace(/[^0-9]/g, "");
      const isBeautyCnae = (code: string) => code.startsWith("96025") || code === "8690904";

      const primaryCnae = cleanCnae(data.cnae_fiscal);
      let eligible = isBeautyCnae(primaryCnae);

      if (!eligible && Array.isArray(data.cnaes_secundarios)) {
        eligible = data.cnaes_secundarios.some((item: any) => isBeautyCnae(cleanCnae(item.codigo)));
      }

      if (!eligible) {
        return Response.json({ 
          error: "A atividade (CNAE) registrada para este CNPJ não é elegível para serviços de beleza ou estética." 
        }, { status: 400 });
      }

      // 3. Executar promoção atômica chamando a RPC segura via supabaseAdmin (service_role)
      const parsedAddress = address || `${data.logradouro}, ${data.numero}${data.complemento ? " " + data.complemento : ""} - ${data.bairro}, ${data.municipio} - ${data.uf}`;
      const parsedPhone = phone || data.ddd_telefone_1 || data.telefone;
      const parsedName = name || data.nome_fantasia || data.razao_social;

      const { data: establishmentId, error: rpcError } = await ctx.supabaseAdmin.rpc(
        "create_establishment_and_promote_owner",
        {
          target_user_id: userId,
          target_cnpj: cleanCnpj,
          requested_name: parsedName,
          requested_slug: slug,
          requested_address: parsedAddress,
          requested_phone: parsedPhone,
          requested_primary_color: primary_color || "#F5A524"
        }
      );

      if (rpcError) {
        console.error("Erro na auto-promoção B2B:", rpcError);
        const userFriendlyMessage = rpcError.message.includes("cnpj_already_registered")
          ? "Este CNPJ já está cadastrado no sistema."
          : rpcError.message.includes("slug_unavailable")
          ? "O endereço digital (slug) solicitado já está em uso."
          : "Não foi possível concluir a auto-promoção administrativa.";

        return Response.json({ error: userFriendlyMessage }, { status: 400 });
      }

      return Response.json({ success: true, establishment_id: establishmentId });

    } catch (e: any) {
      console.error("Erro interno no onboarding CNPJ:", e);
      return Response.json({ error: "Erro interno no processamento do onboarding." }, { status: 500 });
    }
  }),
};
