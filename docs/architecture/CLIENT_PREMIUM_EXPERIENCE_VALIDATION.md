# Fatia 8.1 — validação da experiência premium

Data da verificação: 2026-07-24

## Estado da entrega

A experiência premium do Client está implementada no repositório em cinco etapas:

- fundações visuais e versão `0.2.0`;
- onboarding opcional de primeira abertura;
- movimento reduzível e feedback tátil;
- acabamento dos fluxos principais;
- validação e documentação.

Não houve alteração de banco, RPC, política de acesso ou regra de negócio.

## Funcionalidades implementadas

- tokens centralizados de cor, tipografia, espaçamento, raios, elevação, movimento e opacidade;
- componentes compartilhados para telas, superfícies, ações, feedback, skeleton e glassmorphism;
- `expo-blur` `57.0.2` com `BlurTargetView` no Android e fallback para versões anteriores ao SDK 31;
- `expo-haptics` `57.0.1` com padrões nativos de seleção, confirmação, rejeição e toggle;
- onboarding de três páginas antes do login, com opção de pular;
- versão do onboarding persistida no SecureStore nativo e localStorage Web;
- reprodução do onboarding pela área Conta;
- callbacks de autenticação mantidos fora das guardas do onboarding;
- redução de movimento controlada pela preferência do sistema;
- animações de até 300 ms usando opacity e transform;
- acabamento compartilhado em autenticação, descoberta, agenda, booking, detalhe, cancelamento e configurações;
- sanitização de emoji, HTML e SVG preservada nos campos existentes;
- tema claro e identidade verde/areia preservados.

## Evidências executadas

- `npm run typecheck:client`: aprovado;
- `npm run lint:client`: aprovado;
- 5 testes unitários da experiência premium: aprovados;
- `npm run test:e2e:client`:
  - onboarding de primeira abertura: aprovado;
  - persistência após pular: aprovada;
  - proteção das rotas privadas: aprovada;
  - 5 cenários autenticados ignorados por ausência das credenciais no processo;
- `npx expo-doctor@latest`: 20 de 20 verificações aprovadas;
- exportação Web do Client: aprovada;
- bundle Android do Client: aprovado;
- autolinking nativo confirmou:
  - `expo-blur` `57.0.2`;
  - `expo-haptics` `57.0.1`.

## Builds Android

### Compilação local

O Gradle reconheceu os novos módulos, mas a primeira tentativa parou em
`:app:processDebugResources` porque o AAPT2 do Windows não conseguiu iniciar e
solicitou o Universal C Runtime. A segunda tentativa permaneceu presa nos
processos Java e foi encerrada após o timeout, sem APK local.

Essa falha é do ambiente Android local e não altera os resultados do bundle,
typecheck, lint ou testes.

### EAS Preview

- build: `8583a258-80a2-4253-a0d4-8939394d3b79`;
- versão: `0.2.0`;
- runtime: `0.2.0`;
- commit: `0010cf1`;
- perfil/canal: `preview`;
- resultado: falhou na etapa de upload dos source maps;
- causa confirmada: `SENTRY_AUTH_TOKEN` não está configurado no ambiente
  Preview do EAS.

O Gradle remoto compilou os módulos e gerou o bundle antes da etapa Sentry. O
APK não foi publicado porque o upload obrigatório dos source maps terminou com
erro de autenticação.

## Validação pendente

1. Criar um token de organização do Sentry com permissão de CI/release.
2. Salvar `SENTRY_AUTH_TOKEN` como Sensitive nos ambientes Development,
   Preview e Production do EAS.
3. Reexecutar `npm run eas:client:preview`.
4. Instalar o APK em instalação limpa e sobre a versão anterior.
5. Validar no Android:
   - onboarding, pular e reprodução pela Conta;
   - inicialização fria e quente;
   - fonte ampliada;
   - redução de movimento;
   - blur e desempenho das listas;
   - haptics de seleção, sucesso, aviso e erro;
   - autenticação, descoberta, booking, agenda, cancelamento e reagendamento;
   - evento Sentry simbolizado e sem PII.
6. Após aprovação do Preview, gerar o AAB Production `0.2.0` sem executar
   `eas submit`.

## Segurança

- nenhum token Sentry, credencial E2E, keystore ou chave privada foi salvo no
  repositório;
- erros de armazenamento do onboarding usam códigos sanitizados no Sentry;
- o onboarding não solicita Push nem coleta informações;
- nenhuma atualização OTA ou submissão à loja foi executada.
