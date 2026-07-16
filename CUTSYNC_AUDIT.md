# Auditoria prioritária — CutSync

**Data:** 16/07/2026  
**Escopo:** segurança, bloqueios de uso, arquitetura, APIs, banco, infraestrutura e experiência responsiva em web/Android/iOS.  
**Regra desta etapa:** nenhuma alteração funcional foi feita no sistema.

## Resumo executivo

O CutSync já possui uma base de produto utilizável, exporta para web e permite entrar com os três perfis. Entretanto, **não deve avançar para produção antes da correção dos P0 de autorização e isolamento entre estabelecimentos**.

Principais resultados:

- **Crítico:** qualquer novo usuário pode declarar `admin` ou `professional` e apontar para um estabelecimento existente por metadata; o próprio perfil também pode alterar campos sensíveis.
- **Crítico confirmado em produção:** um cliente autenticado conseguiu ler perfis de outros estabelecimentos, incluindo e-mails e telefones.
- **Crítico:** a agenda não possui trava transacional no banco contra dois agendamentos simultâneos ou sobrepostos.
- **Alto:** magic link e persistência de sessão móvel não estão implementados de forma completa para web, Android e iOS.
- **Qualidade:** TypeScript passou e o pacote web foi gerado, mas o lint encontrou **40 erros e 21 avisos**; não existe nenhum teste automatizado.
- **Responsividade:** cliente, profissional e gestor carregam, mas há conteúdo cortado e ações comprimidas em 390 px.

## Evidências e validações executadas

- Leitura de arquitetura, rotas, autenticação, hooks, schema SQL, RLS, configuração Expo e Tauri.
- Login real, somente leitura, com cliente, profissional e dono/admin.
- Consulta real das políticas RLS sem criar, alterar ou excluir dados.
- Navegação visual desktop e mobile (390 × 844).
- `npx tsc --noEmit`: **aprovado**.
- `npx expo export --platform web`: **aprovado**; bundle JS principal de aproximadamente **3,6 MB** e export total de **16 MB**.
- ESLint: **40 erros / 21 avisos**, em 21 arquivos.
- Expo Doctor: 19/20 verificações; 17 pacotes Expo com patch divergente.
- Dependências: 13 alertas moderados, nenhum alto/crítico no `npm audit` atual.
- Testes automatizados encontrados: **0**.

## P0 — corrigir antes de qualquer nova funcionalidade

### 1. Escalada de privilégio e tomada de estabelecimento

**Severidade:** crítica  
**Evidências:** `src/components/screens/RegisterExperience.tsx:103-127`, `supabase/setup.sql:133-162`, `supabase/setup.sql:203-210`.

O cadastro envia `role` e `establishment_id` em `raw_user_meta_data`, e o trigger os aceita diretamente. Como estabelecimentos e IDs são públicos, um atacante pode criar uma conta como `admin` ou `professional` de qualquer estabelecimento. Além disso, a política de atualização do próprio perfil restringe apenas `id = auth.uid()`, sem impedir mudança de `role`, `establishment_id` ou `commission_rate`.

**Correção necessária:**

1. Toda conta pública deve nascer exclusivamente como `client`.
2. Roles e vínculos devem ser definidos no servidor por convite de uso único, com validade e estabelecimento fixo.
3. Separar campos editáveis pelo usuário dos campos administrativos; bloquear alteração direta de role, vínculo e comissão.
4. Migrar a autorização para uma tabela de memberships e funções SQL seguras, sem confiar em metadata controlada pelo cliente.
5. Criar testes negativos de RLS para cada role e tenant.

### 2. Vazamento confirmado de dados pessoais entre tenants

**Severidade:** crítica / LGPD  
**Evidência:** `supabase/setup.sql:201-205`.

A política `Qualquer autenticado lê perfis` usa `USING (true)`. No teste real, a conta cliente recebeu **4 perfis**, sendo **3 de outros estabelecimentos**, com **4 e-mails e 4 telefones visíveis**.

**Correção necessária:** remover leitura global de `profiles`; expor ao catálogo somente uma view/RPC com campos públicos mínimos. E-mail, telefone, push token, comissão e vínculos devem ficar acessíveis apenas ao titular ou aos gestores autorizados do tenant.

### 3. Alterações excessivas em agendamentos e serviços

**Severidade:** crítica/alta  
**Evidências:** `supabase/setup.sql:233-279`.

- Cliente recebe `FOR ALL` no próprio agendamento e pode tentar alterar status, profissional, serviço, estabelecimento e data.
- Profissional recebe gestão de todos os agendamentos e serviços do estabelecimento, não apenas da própria agenda.
- A preferência `share_agendas` existe, mas não é aplicada nas políticas.

**Correção necessária:** criar políticas separadas por operação (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) e funções transacionais para cancelar, confirmar, concluir e reagendar, validando transições de status e ownership no banco.

### 4. Duplo agendamento por condição de corrida

**Severidade:** crítica operacional  
**Evidências:** `src/app/[slug]/booking.tsx:189-217`, ausência de constraint em `supabase/setup.sql:78-93`.

A interface consulta disponibilidade e depois executa `INSERT`; duas pessoas podem reservar o mesmo intervalo ao mesmo tempo. Não existe constraint/exclusion constraint ou RPC atômica. A base atual não apresentou duplicidade exata, mas isso não evita a corrida futura.

**Correção necessária:** reservar via RPC transacional e constraint de sobreposição por profissional, considerando duração do serviço e apenas status ativos.

### 5. Rotacionar credenciais expostas

**Severidade:** crítica preventiva.

A senha do banco foi compartilhada durante a auditoria e as três contas usam a mesma senha fraca. A chave pública do Supabase também permanece no histórico Git — a anon key pode ser pública, mas deve ser protegida por RLS correta.

**Ação imediata:** trocar a senha do banco e as senhas das contas de teste; revogar sessões existentes; nunca armazenar senha do banco no app, relatório ou repositório.

## P1 — estabilização para web, Android e iOS

### Autenticação e sessão

- `detectSessionInUrl: false` (`src/services/supabase.ts:15-20`) impede a conclusão automática do magic link web.
- O deep link nativo `cutsync://(client)` não possui tratamento de callback/troca de código (`src/app/[slug]/booking.tsx:248-266`).
- O link não preserva serviço, profissional, dia e horário após recarregar.
- Não há adapter explícito de storage seguro/AsyncStorage para persistir sessão no React Native.
- O cadastro rápido tenta agendar imediatamente após `signUp`; se confirmação de e-mail estiver ativa, não haverá sessão autorizada e a reserva falhará.

**Plano:** implementar PKCE/deep-link completo, allowlist de redirects, estado de reserva assinado/persistido, storage móvel apropriado e testes web/Android/iOS.

### Disponibilidade e regras de agenda

- A reserva pública usa horários fixos, ignorando `opening_hours` e `work_hours`.
- Fuso está fixo em `America/Sao_Paulo` no cadastro; formatação usa o fuso do dispositivo em vários pontos.
- Duração e sobreposição são verificadas no cliente, não como regra central do banco.
- Cancelamento tardio e conclusão futura também dependem da interface, podendo ser contornados pela API.

### Responsividade e usabilidade

- Em 390 px, o título/subtítulo profissional e ações do admin aparecem cortados ou comprimidos.
- Há **102 ocorrências** de fonte entre 8 e 10 px, abaixo de uma leitura confortável.
- Cores secundárias como `#A1A1AA` têm contraste aproximado de 2,56:1 sobre branco, abaixo de WCAG AA.
- Nos principais fluxos auditados, 47 controles/modais tinham apenas 2 declarações explícitas de acessibilidade.
- A navegação do cliente mantém telas anteriores montadas, gerando IDs duplicados e múltiplos botões de logout no DOM; isso pode prejudicar automação e leitores de tela.
- Botões importantes são somente ícones, sem rótulo acessível suficiente.

### Qualidade e manutenibilidade

- ESLint: 40 erros e 21 avisos, incluindo efeitos com atualizações síncronas, funções impuras no render e memoizações inconsistentes.
- Arquivos de 951, 975 e 1.130 linhas concentram estado, consulta, regra de negócio e apresentação.
- 51 usos de `any`/casts reduzem a proteção de tipos.
- SQL legado (`migration_i18n.sql`) usa nomes e roles antigos (`barbershops`, `barber_id`, `barber`), divergindo do schema atual (`establishments`, `professional_id`, `professional`). Aplicá-lo hoje é arriscado.
- O schema do banco não é gerado automaticamente para TypeScript.
- Upload de banners depende de bucket/policies não versionados no repositório.

### Build e dependências

- `npm ci` falha por conflito de peer dependency entre React 19 e `lucide-react-native`; apenas `--legacy-peer-deps` instalou.
- Yarn não possui lockfile e falha com o Node 20 exigido pelo ambiente atual do Supabase SDK.
- Expo Doctor encontrou 17 patches desalinhados.
- `package.json` ainda se chama `ctrlshot`; a janela Tauri ainda exibe `CTRLShot`.
- O Tauri está com CSP `null`; a web também não possui política CSP versionada.
- O bundle web carrega muitas variantes de duas famílias tipográficas, aumentando o peso inicial.

## P2 — maturidade e preparação de lançamento

- Adicionar suíte de testes unitários, integração, RLS e E2E para os três perfis.
- CI com TypeScript, lint, Expo Doctor, auditoria de dependências e export web.
- Observabilidade com erros estruturados, correlação de requisições e alertas; remover logs com dados sensíveis.
- Trilhas de auditoria para mudanças de status, preço, comissão, vínculo e configuração.
- Política de retenção, exclusão/exportação de conta, consentimento de notificação e documentação LGPD.
- Rate limit/CAPTCHA para signup, OTP, criação de estabelecimento e tentativas de login.
- Paginação e seleção explícita de colunas; evitar `select('*')`.
- Validar permissões, deep links, notificações, safe areas, teclado e retorno do app em dispositivos Android/iOS reais.
- Definir CSP, headers de segurança, proteção contra embedding e política de origem no hosting web.

## Checklist objetivo

| Área | Estado | Prioridade |
|---|---|---|
| Isolamento multi-tenant | Reprovado, vazamento confirmado | P0 |
| Controle de roles | Reprovado, autoatribuição possível | P0 |
| Integridade da agenda | Reprovado, sem trava atômica | P0 |
| Sessão/magic link multiplataforma | Incompleto | P1 |
| TypeScript | Aprovado | — |
| Build web | Aprovado | — |
| Lint | Reprovado: 40 erros | P1 |
| Testes automatizados | Ausentes | P1/P2 |
| Responsividade mobile | Parcial, cortes observados | P1 |
| Acessibilidade | Insuficiente | P1 |
| Dependências reproduzíveis | Reprovado | P1 |
| LGPD e auditoria | Incompleto | P1/P2 |

## Ordem recomendada de execução

1. Rotacionar credenciais e congelar cadastros de admin/profissional.
2. Reescrever RLS e fluxo de roles/memberships; validar com testes negativos.
3. Criar RPC transacional de reserva/reagendamento e constraint anti-conflito.
4. Corrigir sessão, magic link e deep links em web/Android/iOS.
5. Centralizar disponibilidade, fuso e transições de status no backend.
6. Corrigir instalação determinística, lint e divergência do schema/migrations.
7. Corrigir responsividade, acessibilidade e fontes/contraste.
8. Adicionar testes, CI, observabilidade e requisitos LGPD.

## Conclusão

O produto tem boa cobertura funcional e uma interface visual coerente, mas a camada de autorização ainda confia demais no cliente. **O primeiro ciclo de trabalho deve ser exclusivamente segurança multi-tenant e integridade da agenda.** Novas funcionalidades antes disso ampliariam a superfície de risco e o custo de correção.