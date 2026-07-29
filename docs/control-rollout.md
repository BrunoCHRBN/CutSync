# CutSync Control — implantação do primeiro incremento

## Estado deste incremento

A base web privada está em `apps/control` e contém:

- login separado dos aplicativos públicos;
- sessão somente em memória, com 30 minutos de inatividade e limite absoluto de 8 horas;
- cadastro e validação TOTP com exigência de AAL2;
- contexto de acesso por `SaaS_Viewer`, `SaaS_Editor` e `SaaS_Owner`;
- visão executiva com indicadores operacionais reais;
- painel `Ao vivo` com agenda do dia, saúde da plataforma e fila de suporte;
- invalidação por Broadcast privado `control:live`, polling de segurança e
  indicação de snapshot desatualizado;
- diretório de acessos disponível somente para `SaaS_Owner`;
- módulo de cobrança multiunidade preservado e isolado por permissão;
- operação da central de suporte no Control, sem expor credenciais do Jira ao
  aplicativo;
- rotas de governança e conhecimento ainda preparadas, sem dados simulados.

As migrations do Control, incluindo
`20260804001000_control_live_operations.sql`, foram aplicadas no projeto
separado `CutSync Homolog`. O histórico local/remoto está alinhado até essa
migration. O teste `control_live_operations.sql` passou localmente e no SQL
Editor da homologação; ambos terminaram em `ROLLBACK`, e a consulta de
confirmação remota encontrou zero fixtures restantes.
Elas ainda não devem ser aplicadas diretamente em produção.

Durante a homologação remota, foi identificado que o restore schema-only não
recriou o trigger `auth.users -> public.handle_new_user()`. A migration
`20260801001000_restore_auth_profile_creation_trigger.sql` restaura esse vínculo
de forma idempotente e deve ser validada na homologação antes de qualquer
promoção.

Os advisors também identificaram grants `EXECUTE` anônimos recriados pelo
restore em RPCs privadas de cobrança. A migration
`20260801002000_harden_control_rpc_execute_grants.sql` revoga `PUBLIC/anon` de
todas as RPCs consumidas pelo Control e mantém apenas
`authenticated/service_role`.

## Ordem de homologação

Enquanto uma Supabase Branch implicar custo incompatível com o estágio atual,
use o projeto separado `CutSync Homolog`. O ambiente local continua útil para
validar migrations e contratos SQL, mas não substitui a validação remota antes
da promoção final.

### Caminho local sem custo de nuvem

1. Inicie o Docker Desktop.
2. Execute `npx supabase start`.
3. Confira as migrations com `npx supabase migration list --local`.
4. Revise o plano com `npx supabase db push --local --dry-run`.
5. Aplique somente as migrations revisadas com `npx supabase db push --local`.
6. Execute o teste transacional pelo `psql` do container:

```powershell
Get-Content -Raw -LiteralPath 'supabase/tests/control_access_foundation.sql' |
  docker exec -i supabase_db_CutSync psql -U postgres -d postgres -v ON_ERROR_STOP=1
```

O resultado válido termina em `ROLLBACK`. Nenhum dado de teste deve permanecer.

### Caminho remoto futuro

1. Usar uma Supabase Branch ou um projeto separado de homologação.
2. Confirmar que a história de migrations desse ambiente está reconciliada com o repositório.
3. Aplicar as migrations pendentes em ordem, sem repetir migrations já presentes no remoto.
4. Executar `supabase/tests/control_access_foundation.sql`.
5. Executar `supabase/tests/control_live_operations.sql`.
6. Gerar novamente os tipos em `packages/database/src/supabase.generated.ts`.
7. Configurar uma conta de teste `SaaS_Owner` sem dados pessoais reais.
8. Ativar TOTP no projeto e elevar a sessão para AAL2.
9. Validar os fluxos de Owner, Editor, Viewer, usuário expirado e usuário sem acesso.
10. Executar os advisors de segurança e desempenho e registrar qualquer alerta novo.
11. Somente após a homologação, promover a migration para produção.

Se Supabase Branch não estiver disponível, use um projeto separado. Não use o projeto produtivo como substituto silencioso.

### Bootstrap do primeiro Owner na homologação

O projeto restaurado não contém usuários do Auth. Para criar o primeiro acesso:

1. Em `Authentication > Users`, crie uma conta de teste sua com e-mail
   confirmado. Não use dados de clientes.
2. Confirme que a criação do usuário também criou a linha de mesmo e-mail em
   `public.profiles`.
3. Abra `supabase/snippets/bootstrap_control_owner_by_email.sql`.
4. Troque somente `replace-with-your-test-email@example.test` pelo e-mail da
   conta criada e execute o arquivo na homologação.
5. Inicie o Control, faça login e cadastre o TOTP. O dashboard somente será
   liberado depois que a sessão atingir AAL2.

O snippet recusa o placeholder, exige perfil existente e não permite assumir o
controle quando já existe outro `SaaS_Owner` ativo.

### Baseline dos advisors na homologação

Após `20260801002000_harden_control_rpc_execute_grants.sql`:

- nenhuma RPC consumida pelo Control permanece executável por `anon`;
- as RPCs `SECURITY DEFINER` acessíveis por `authenticated` continuam
  reportadas pelo advisor, de forma esperada, pois o aplicativo precisa
  invocá-las e cada função aplica autorização interna;
- `governance_users` possui duas políticas permissivas de leitura
  (`self` e `SaaS_Owner`), gerando um aviso de desempenho. A consolidação deve
  ocorrer em incremento separado, com teste de equivalência para Viewer,
  Editor e Owner;
- os demais avisos dos advisors pertencem ao baseline amplo do schema e não
  foram alterados silenciosamente durante a implantação do Control.

## Variáveis públicas

Crie `apps/control/.env` a partir de `.env.example`:

```powershell
Copy-Item apps/control/.env.example apps/control/.env
```

Preencha apenas:

- `EXPO_PUBLIC_SUPABASE_URL`;
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

Esses valores são públicos por definição. Nunca use `service_role`, token do Jira, token do Sentry ou senha no bundle.

## Validação local

```powershell
npm run typecheck:control
npm run lint:control
$env:CUTSYNC_E2E_BASE_URL = 'http://127.0.0.1:1'
npx playwright test --project=unit tests/unit/control-access-foundation.unit.spec.ts
npm --workspace @cutsync/control run build:web
```

O teste SQL exige uma instância Supabase local ou a homologação preparada:

```powershell
Get-Content -Raw -LiteralPath 'supabase/tests/control_live_operations.sql' |
  docker exec -i supabase_db_CutSync psql -U postgres -d postgres -v ON_ERROR_STOP=1
```

O resultado válido termina em `ROLLBACK`. Se usar conexão remota, use somente
uma URL de homologação descartável para esse teste transacional.

## Projeto Vercel separado

Crie um projeto Vercel exclusivo para o Control com:

- diretório do repositório: raiz do monorepo;
- build command: `npm --workspace @cutsync/control run build:web`;
- output directory: `apps/control/dist`;
- Node.js: 22;
- variáveis públicas apontando para a homologação no Preview e para produção apenas depois da promoção.

Até existir domínio próprio, mantenha a URL temporária do projeto. O Control não deve compartilhar o projeto ou o bundle de `apps/web`.

## Próximo incremento

1. Homologar o ciclo real CutSync → Jira → resposta pública → CutSync, mantendo
   `allow_new_tickets=false` até a evidência ponta a ponta.
2. Validar o painel `Ao vivo` com Owner, Editor, Viewer, AAL1 e AAL2 em sessão
   remota, incluindo reconexão e polling de contingência.
3. Sentry nos quatro aplicativos, com projetos/releases separados e sem PII.
4. Convite e mutação de acessos pelo Control, após homologar as RPCs de concessão e revogação.
5. Migração gradual das rotas de governança e conhecimento, mantendo o Web até a paridade funcional.
