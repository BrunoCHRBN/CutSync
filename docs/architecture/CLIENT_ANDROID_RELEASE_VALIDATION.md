# Fatia 8 — validação de distribuição Android

Data da verificação: 2026-07-23

## Estado da entrega

A configuração e os contratos da Fatia 8 estão implementados no repositório. O fechamento remoto permanece condicionado à criação autenticada do projeto Sentry, à aplicação da migration de exclusão em homologação e à publicação da Edge Function.

Nenhum `eas update` ou `eas submit` foi executado.

## Configuração confirmada

- `apps/client` é a origem exclusiva do projeto EAS `cutsync-client`;
- EAS Project ID: `ebed753a-2b13-4fa1-bb73-fc28270c2cec`;
- versão técnica: `0.1.0`;
- runtime OTA usa a política `appVersion`;
- canais `development`, `preview` e `production` estão definidos;
- Preview gera APK interno;
- Production gera AAB com incremento remoto;
- os três ambientes EAS possuem os nomes:
  - `EXPO_PUBLIC_APP_ENV`;
  - `EXPO_PUBLIC_EAS_PROJECT_ID`;
  - `EXPO_PUBLIC_SUPABASE_URL`;
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`;
  - `SENTRY_ORG`;
  - `SENTRY_PROJECT`.

As variáveis `EXPO_PUBLIC_SENTRY_DSN` e `SENTRY_AUTH_TOKEN` não foram criadas porque ainda não existe sessão autenticada disponível para criar e configurar o projeto Sentry. O token deverá ser Sensitive e nunca poderá ser salvo no Git.

## Evidências executadas

- `npx expo-doctor` no Client: 20 de 20 verificações aprovadas;
- `npm run typecheck:client`: aprovado;
- `npm run lint:client`: aprovado;
- quatro testes unitários de sanitização, diagnóstico e estados de exclusão: aprovados;
- três verificações estáticas da Edge Function e dos contratos de exclusão: aprovadas;
- exportação Web do Client: aprovada;
- bundle Android do Client: aprovado;
- página pública de privacidade e caminho externo de exclusão: E2E aprovado em viewport mobile;
- `npm run test:e2e:client`: proteção sem sessão aprovada; cinco cenários autenticados ignorados porque as credenciais E2E não estavam disponíveis no processo;
- typecheck completo da Web executado e ainda vermelho por erros preexistentes fora dos arquivos desta fatia.

O teste SQL transacional não foi executado porque o Docker/Postgres local não respondeu. A migration não foi aplicada remotamente nesta validação.

## Validação remota pendente

1. Criar a organização `cutsync` e o projeto React Native `cutsync-client` no Sentry.
2. Configurar `EXPO_PUBLIC_SENTRY_DSN` nos três ambientes EAS.
3. Configurar `SENTRY_AUTH_TOKEN` como Sensitive nos três ambientes.
4. Aplicar `20260724020000_client_account_deletion.sql` em homologação.
5. Publicar `execute-client-account-deletion`.
6. Gerar um novo APK Preview.
7. Confirmar autenticação, descoberta, criação, agenda, cancelamento, reagendamento e Push.
8. Disparar o diagnóstico Preview e confirmar release, ambiente, stack simbolizada e ausência de PII no Sentry.
9. Executar a exclusão com uma conta descartável e confirmar:
   - solicitação criada pelo próprio cliente;
   - fila visível na governança;
   - perfil anonimizado;
   - vínculos revogados;
   - identidade Auth removida;
   - novo login rejeitado;
   - retentativa segura em uma falha parcial controlada.
10. Gerar o AAB Production sem submissão à loja.

## Checklist para a Play Store

- [ ] Nome, descrição curta e descrição completa revisados.
- [ ] Categoria do aplicativo definida.
- [ ] E-mail e site público de suporte publicados.
- [ ] URL pública de política de privacidade publicada.
- [ ] URL pública de exclusão de conta publicada.
- [ ] Formulário Data Safety alinhado ao comportamento real do Client e fornecedores.
- [ ] Screenshots atuais de telefone preparadas sem dados pessoais.
- [ ] Ícone, feature graphic e materiais da ficha revisados.
- [ ] Classificação indicativa preenchida.
- [ ] Países, preço e disponibilidade definidos.
- [ ] Teste interno com APK/AAB assinado concluído.
- [ ] Sentry validado com source maps e sem PII.
- [ ] Conta descartável excluída de ponta a ponta em homologação.
- [ ] AAB Production gerado.
- [ ] `eas submit` executado somente após aprovação explícita da publicação.

## Segurança operacional

- keystore, service account FCM, service role, credenciais de usuário e token Sentry permanecem fora do repositório;
- a Edge Function valida a sessão, o AAL2 e o papel de governança antes de iniciar a execução;
- as operações administrativas usam service role somente no servidor;
- falhas parciais são registradas por código sanitizado e podem ser retomadas;
- as páginas públicas não recebem UUID nem justificativa livre do cliente;
- nenhum OTA foi publicado nesta fatia.
