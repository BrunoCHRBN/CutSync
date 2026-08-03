# Minutas jurídicas — Bloco 5: Control e administração interna

**Status:** minuta interna para revisão jurídica, de segurança e de governança — não vigente.

**Versão do pacote:** 0.1 — 30 de julho de 2026

## Conteúdo

1. `01-termo-de-acesso-administrativo-privilegiado.md`
2. `02-politica-de-delegacao-e-revogacao-de-acessos.md`
3. `03-politica-interna-de-privacidade-e-seguranca.md`
4. `04-procedimento-de-direitos-dos-titulares.md`
5. `CHECKLIST-VALIDACAO-JURIDICA-E-GOVERNANCA.md`

## Escopo

Este pacote regula o acesso privado ao Control e os procedimentos internos do CutSync. Ele não concede acesso a qualquer pessoa, não substitui contratos de trabalho/prestação de serviço e não cria autorização para tratar dados fora da finalidade legítima.

## Premissas de arquitetura incorporadas

- O Control é privado, restrito à governança do CutSync e deve começar com um único `SaaS_Owner`.
- Delegação é explícita, revogável, com menor privilégio e registro de eventos relevantes.
- Papéis canônicos: `SaaS_Viewer`, `SaaS_Editor` e `SaaS_Owner`; permissões reais são impostas pelo servidor.
- AAL2 é exigido para ações sensíveis, inclusive decisões de privacidade e gestão de acesso administrativo.
- Não se deve tratar o Control como um repositório de dados pessoais livres: logs e justificativas devem ser minimizados.

## Pendências para entrada em vigor

1. Formalizar a entidade responsável, encarregado(a)/canal de privacidade e donos de cada procedimento.
2. Homologar papéis, AAL2, RLS, RPCs, auditoria e revogação contra o ambiente remoto antes de depender deles.
3. Integrar as telas do Control aos fluxos reais de privacidade e governança, sem criar tabelas ou controles paralelos.
4. Criar treinamento e aceite interno para toda pessoa que receber acesso privilegiado.

