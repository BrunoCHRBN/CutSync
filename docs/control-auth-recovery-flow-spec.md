# Especificação de fluxo — recuperação administrativa de autenticação

**Status:** proposta para revisão; não implementada

**Escopo:** `apps/control`, Supabase Auth, suporte CutSync, usuários Client/Business e identidades privilegiadas de Control/Governance.

**Regra principal:** o suporte pode iniciar uma recuperação controlada, mas nunca deve gerar, conhecer ou enviar uma senha, um refresh token ou um código TOTP. A credencial deve ser criada pelo próprio usuário a partir de um link único de recuperação.

## 1. Objetivo

Definir o fluxo seguro para:

- recuperação normal de acesso de usuários Client e Business iniciada pelo suporte;
- envio manual excepcional de um link de recuperação;
- recuperação de MFA de operadores Control/Governance;
- recuperação emergencial break-glass;
- revogação de sessões e rastreabilidade das ações.

Esta especificação não autoriza ainda mudanças no banco, no frontend, nas Edge Functions ou nas configurações do Supabase.

## 2. Estado atual conhecido

O CutSync já possui recuperação iniciada pelo próprio usuário em Web, Client e Business, usando o Supabase Auth e a tela de criação de nova senha.

Referências atuais:

- `docs/PASSWORD_RECOVERY_SETUP.md`;
- `apps/web/src/components/screens/ForgotPasswordExperience.tsx`;
- `apps/web/src/components/screens/ResetPasswordExperience.tsx`;
- `apps/client/src/contexts/session-context.tsx`;
- `apps/business/src/contexts/business-session.tsx`.

O Control possui autenticação AAL2, papéis `SaaS_Viewer`, `SaaS_Editor` e `SaaS_Owner`, e operações de suporte. Não existe, no estado auditado, uma tela ou Edge Function dedicada para um operador iniciar recuperação de autenticação para outro usuário.

O fluxo novo deve reutilizar o processo de recuperação existente e não criar uma segunda senha, uma segunda sessão ou uma segunda fonte de identidade.

## 3. Termos e limites

### 3.1 Recuperação de senha

O usuário recebe um link temporário e define uma nova senha. O operador não vê a senha.

### 3.2 Recuperação de MFA

O fator TOTP antigo é invalidado mediante autorização apropriada. O usuário cadastra e verifica um novo fator. Nenhum operador recebe o segredo TOTP ou o código de seis dígitos.

### 3.3 Acesso Control

É a autorização global em `governance_users`. Não deve ser confundida com:

- `profiles.role`;
- memberships de uma unidade ou estabelecimento;
- papel operacional de Client, Business ou profissional;
- endereço de e-mail ou domínio.

### 3.4 Break-glass

Procedimento excepcional, temporário e auditado para recuperar uma identidade privilegiada. Não significa ignorar AAL2 nem atribuir AAL2 por decisão da interface.

## 4. Papéis e permissões propostas

As permissões abaixo são novas capacidades de desenho. Elas não devem ser inferidas automaticamente dos papéis atuais sem revisão e homologação.

| Ator | Permissão/capacidade | Escopo | Não pode fazer |
| --- | --- | --- | --- |
| `SaaS_Viewer` | nenhuma | apenas leitura autorizada | iniciar, aprovar ou executar recuperação |
| Operador de suporte | `control.auth_recovery.manage` | Client/Business e contas públicas, com chamado | resetar Control/Governance, resetar MFA privilegiado ou conceder papel |
| Supervisor de suporte | `control.auth_recovery.manage` + `control.auth_recovery.approve` | aprovar recuperações comuns de alto impacto | atuar como aprovador da própria solicitação |
| `SaaS_Editor` | somente capacidades explicitamente atribuídas | fluxos de governança permitidos | alterar acesso Control ou resetar MFA de operador |
| `SaaS_Owner` | `control.access.manage` + capacidade de recuperação privilegiada | Control/Governance, MFA e break-glass | aprovar sozinho quando a política exigir dupla aprovação |
| Segundo Owner | `control.auth_recovery.approve` | segunda aprovação para privilégio/break-glass | aprovar a própria solicitação |

`control.support.manage` não deve, sozinho, significar poder de resetar autenticação. A recuperação deve ter uma permissão específica, com escopo e auditoria próprios.

## 5. Telas propostas

### 5.1 Control → Suporte → Recuperação de acesso

Tela destinada a recuperações comuns.

Elementos:

- abertura ou associação obrigatória a um chamado;
- busca por UUID, identificador do chamado ou correspondência exata;
- identidade mascarada: nome parcial, e-mail parcial e produto;
- classificação do alvo: Client, Business, público ou privilegiado;
- método de verificação de identidade utilizado;
- motivo obrigatório;
- ação `Enviar link de recuperação`;
- ação excepcional `Gerar link para envio manual`;
- status e prazo da solicitação;
- histórico resumido, sem token ou segredo.

O operador não deve receber uma listagem ampla de usuários nem poder consultar e-mails para descobrir contas existentes.

### 5.2 Control → Suporte → Detalhe da recuperação

Mostra somente metadados:

- solicitação;
- alvo mascarado;
- operador;
- chamado;
- motivo;
- aprovações;
- expiração;
- entrega;
- abertura;
- conclusão;
- revogação ou falha.

O link manual, quando permitido, deve aparecer uma única vez, após confirmação explícita, e nunca no histórico.

### 5.3 Control → GSP → Recuperações privilegiadas

Tela exclusiva para `SaaS_Owner` e aprovações de alto risco.

Operações:

- recuperar operador Control/Governance;
- solicitar reset de MFA;
- suspender temporariamente o acesso;
- aprovar ou rejeitar break-glass;
- revogar solicitações pendentes;
- encerrar sessões, quando disponível no fluxo server-side;
- visualizar a auditoria completa da operação.

Essa tela não deve oferecer um campo para definir senha nem um campo para informar código TOTP.

### 5.4 Tela do usuário → Nova credencial

É a tela já existente de recuperação. O usuário:

- abre o link;
- cria uma senha forte;
- confirma a senha;
- encerra a sessão de recuperação;
- entra novamente normalmente;
- cadastra novo MFA se o fluxo exigir.

O texto da tela deve manter a regra: o CutSync nunca envia ou solicita a senha do usuário.

## 6. Fluxo normal de recuperação por suporte

1. O usuário abre um chamado por canal oficial.
2. O operador confirma a identidade conforme procedimento operacional aprovado.
3. O operador associa o chamado ao usuário correto.
4. O sistema mostra apenas a identidade mínima necessária.
5. O operador informa motivo, produto, canal e método de verificação.
6. O backend valida `auth.uid()`, AAL2, permissão, escopo do alvo e rate limit.
7. É criada uma solicitação em estado `identity_verified` ou `awaiting_approval`.
8. A Edge Function server-side gera um link de recuperação temporário usando a API administrativa apropriada.
9. O servidor envia o link pelo provedor configurado ou libera a opção de envio manual quando a política permitir.
10. O usuário abre o link e define a própria senha.
11. O backend registra o uso, invalida a solicitação e encerra/revoga sessões conforme o ambiente permitir.
12. O chamado recebe somente o resultado operacional, nunca a senha ou o token.

## 7. Fluxo de envio manual do link

Esse fluxo é fallback para quando o envio automático não estiver disponível.

Condições obrigatórias:

- chamado existente;
- identidade verificada;
- operador com capacidade específica;
- motivo obrigatório;
- prazo curto, recomendado entre 5 e 15 minutos;
- uso único;
- vínculo com usuário e chamado;
- confirmação antes da exibição;
- exibição somente uma vez;
- nenhum armazenamento do link original em banco ou log;
- canal de envio registrado, sem armazenar o conteúdo da conversa;
- revogação manual disponível até o uso ou expiração.

O link manual deve ser um código de recuperação ou `token_hash`/fluxo equivalente. Não deve conter access token ou refresh token exposto ao operador, em logs ou em histórico de navegação.

Se o link for copiado para um canal não aprovado, o operador deve cancelar a solicitação e gerar outra. Nunca reutilizar o link.

## 8. Fluxo de recuperação de MFA

### 8.1 Usuário Client/Business

O usuário deve usar o fluxo de segurança do próprio aplicativo. Suporte não recebe código MFA nem segredo TOTP.

### 8.2 Operador Control/Governance

1. O operador abre solicitação com chamado e motivo.
2. Um Owner diferente revisa a identidade e aprova.
3. O acesso privilegiado fica suspenso durante a recuperação.
4. O fator antigo é invalidado por função server-side autorizada.
5. O usuário recebe instruções de novo cadastro, nunca o segredo pronto.
6. O usuário cadastra o novo TOTP.
7. O usuário executa `challengeAndVerify`.
8. O backend confirma AAL2.
9. O acesso Control é reativado.
10. A operação é encerrada com auditoria.

Nenhuma interface pode transformar um estado visual em AAL2. A elevação precisa vir de uma sessão JWT realmente elevada.

## 9. Fluxo break-glass

Aplicável somente a uma identidade privilegiada bloqueada ou a um incidente de segurança.

Requisitos:

- operador solicitante com sessão AAL2;
- segundo Owner aprovador com sessão AAL2;
- chamados e motivo detalhado;
- alvo identificado por UUID;
- escopo e duração definidos;
- confirmação fora da mesma sessão quando possível;
- notificação ao responsável e ao usuário afetado;
- expiração automática;
- auditoria imutável;
- revisão posterior obrigatória.

O break-glass não pode:

- criar uma senha conhecida pelo suporte;
- marcar o usuário como AAL2;
- remover RLS;
- conceder `SaaS_Owner` permanentemente;
- ignorar a proteção do último Owner;
- expor `service_role` no Control;
- liberar acesso sem registrar motivo e aprovação.

Se houver somente um Owner disponível, a operação deve ficar pendente ou seguir um procedimento externo documentado de emergência. Não se deve criar uma aprovação falsa para satisfazer a interface.

## 10. Estados da solicitação

| Estado | Significado |
| --- | --- |
| `requested` | solicitação criada, ainda não validada |
| `identity_pending` | aguardando confirmação de identidade |
| `awaiting_approval` | exige aprovação de supervisor ou Owner |
| `approved` | aprovada, ainda sem link emitido |
| `link_issued` | link criado e dentro do prazo |
| `manual_delivery_pending` | link aguarda envio manual excepcional |
| `opened` | link aberto pelo usuário |
| `completed` | nova senha ou MFA concluído |
| `expired` | prazo encerrado sem uso |
| `revoked` | solicitação cancelada antes do uso |
| `rejected` | solicitação recusada |
| `locked` | excedeu tentativas ou acionou proteção |
| `failed` | falha técnica sem conclusão segura |

As transições devem ser monotônicas, idempotentes e auditadas. Uma solicitação concluída, expirada ou revogada não pode voltar a `link_issued`.

## 11. Contrato lógico server-side

Os nomes abaixo são propostas de contrato, não instruções para implementar agora.

### 11.1 Operações de recuperação

- `create_auth_recovery_request`;
- `get_auth_recovery_request`;
- `list_auth_recovery_requests`;
- `approve_auth_recovery_request`;
- `issue_auth_recovery_link`;
- `revoke_auth_recovery_request`;
- `complete_auth_recovery`;
- `request_control_mfa_reset`;
- `approve_control_mfa_reset`.

As operações sensíveis devem ficar atrás de RPC protegida ou Edge Function autenticada. A API administrativa do Supabase deve ser chamada somente server-side.

### 11.2 Restrições de autorização

Cada operação deve validar, no servidor:

- `auth.uid()` do operador;
- sessão AAL2 para operações privilegiadas;
- permissão específica do contexto Control;
- papel e estado do alvo;
- escopo Client/Business versus Control/Governance;
- aprovação separada quando exigida;
- motivo, chamado e expiração;
- rate limit, idempotência e replay;
- estado atual da solicitação.

O e-mail pode ajudar a localizar uma identidade em correspondência exata, mas a autorização e o vínculo final devem usar UUID imutável.

## 12. Modelo lógico de dados

O modelo abaixo é conceitual. Não criar migration nesta etapa.

### `auth_recovery_requests`

- `id`;
- `target_profile_id`;
- `requested_by`;
- `approved_by`;
- `ticket_id`;
- `request_type`;
- `target_kind`;
- `reason`;
- `verification_method`;
- `delivery_channel`;
- `status`;
- `token_hash`, quando aplicável;
- `created_at`;
- `expires_at`;
- `opened_at`;
- `used_at`;
- `revoked_at`;
- `failure_code` sem dados sensíveis.

Não armazenar senha, código TOTP, access token, refresh token ou link original em texto puro.

### `auth_recovery_approvals`

- `request_id`;
- `approver_id`;
- `decision`;
- `reason`;
- `created_at`;
- `session_id` ou referência equivalente, quando disponível.

O solicitante não pode ser o único aprovador de sua própria solicitação.

### Auditoria

Registrar eventos imutáveis com:

- ator;
- alvo;
- operação;
- decisão;
- chamado;
- motivo;
- horário;
- resultado;
- correlation ID;
- ambiente.

Não registrar credenciais, tokens, códigos MFA, senha, conteúdo integral da conversa ou documentos de identidade.

## 13. Regras Supabase e segurança de infraestrutura

- `service_role` somente em Edge Function ou ambiente server-side protegido.
- Nenhuma chave secreta em `EXPO_PUBLIC_*` ou bundle.
- RLS em toda tabela exposta; preferir schema privado para solicitações de recuperação.
- Revogar execução de RPCs para `anon` e `PUBLIC` quando não forem públicas.
- Toda `SECURITY DEFINER` deve ter `search_path` fixo, validação explícita de `auth.uid()` e grants mínimos.
- Não usar `user_metadata`, e-mail, domínio ou `profiles.role` como autorização.
- Não expor views que contornem RLS.
- Validar `USING` e `WITH CHECK` em políticas de atualização.
- Usar bucket privado para qualquer documento de verificação.
- Aplicar rate limit para geração, reenvio, abertura e tentativa de recuperação.
- Remover parâmetros sensíveis da URL após o consumo e impedir vazamento em `Referer`, logs e analytics.
- Revalidar o contexto de Control após recuperação, revogação e mudança de MFA.

## 14. Notificações

Para recuperação comum:

- preferir envio server-side por provedor de e-mail configurado;
- usar resposta genérica, sem confirmar se a conta existe;
- não enviar senha, token bruto ou código MFA;
- registrar somente que uma notificação foi solicitada.

Para recuperação privilegiada:

- notificar o usuário afetado;
- notificar o Owner aprovador;
- registrar a abertura e a conclusão;
- gerar alerta de segurança em caso de múltiplas tentativas, troca de e-mail ou falha repetida.

Enquanto o SMTP padrão do Supabase não for infraestrutura de produção, o envio manual deve ser tratado como exceção operacional, não como mecanismo definitivo.

## 15. Critérios de aceite

### Autorização

- Viewer não cria nem aprova recuperação.
- Suporte não recupera Control/Governance.
- Editor não altera papel Control nem reseta MFA privilegiado por padrão.
- Owner não consegue aprovar sozinho uma operação que exige dupla aprovação.
- AAL1 não executa operações privilegiadas.
- Usuário revogado ou expirado não acessa as RPCs.
- `anon` não executa as funções administrativas.

### Tokens e credenciais

- Nenhum teste encontra senha, refresh token, access token ou TOTP em logs, banco ou resposta de UI.
- Link expirado, usado ou revogado não funciona.
- Link emitido para um usuário não funciona para outro.
- Reenvio cria nova solicitação e invalida a anterior.
- URL é limpa após o consumo.

### Aprovação e auditoria

- Solicitação privilegiada exige segundo aprovador.
- O solicitante não aprova a própria solicitação.
- Toda concessão, revogação, recuperação e reset de MFA possui motivo e chamado.
- O histórico não pode ser apagado pelo frontend.
- A proteção do último `SaaS_Owner` permanece ativa.

### Sessões

- Recuperação concluída encerra ou revoga sessões conforme a capacidade server-side disponível.
- Revogação impede novas chamadas protegidas mesmo que um JWT antigo ainda exista.
- Alteração de MFA exige nova sessão AAL2 antes de liberar Control.

### Privacidade e operação

- Busca não permite enumeração de usuários.
- Identidade é mascarada na interface.
- Documentos nunca usam URL pública.
- Falha técnica não informa ao operador que o link foi emitido quando isso não puder ser confirmado.
- Todas as operações possuem idempotência e estado visível.

## 16. Ordem futura de implementação

1. Revisar e aprovar esta política com os responsáveis de suporte e Control.
2. Confirmar projeto Supabase, histórico de migrations, grants, RLS, Auth e configuração de e-mail na homologação.
3. Definir as novas permissões e seus limites por tipo de usuário.
4. Implementar primeiro o modelo server-side e os testes SQL/RPC.
5. Implementar o fluxo de recuperação comum com envio automático.
6. Implementar o envio manual como feature flag desligada por padrão.
7. Implementar MFA privilegiado com aprovação dupla.
8. Homologar Viewer, Editor, Owner, suporte, usuário revogado, expirado e AAL1.
9. Validar sessões, links, rate limit, auditoria e ausência de segredos nos logs.
10. Liberar gradualmente no Control.

Nenhuma etapa de implementação deve alterar o fluxo de recuperação comum existente sem preservar a possibilidade de rollback e sem homologação remota.
