# Changelog — CutSync Business

## 15/08/2026 — F0 Preparação e F1 Quick wins

- Ativada a branch aprovada `codex/android-first-cycle` e instalado o monorepo com os pacotes do app Business.
- Adicionados `lucide-react-native` e `react-native-svg` ao workspace Business.
- Criado `BusinessEmptyState`, aplicado em Hoje e Agenda com títulos, descrições e ações contextuais.
- Gestão passou de cards com textos técnicos para lista plana com ícones, descrições amigáveis, capabilities e estados “Em breve”.
- Conta recebeu textos orientados ao usuário, fallback melhor de nome, confirmação de logout e linguagem simplificada para notificações e atualizações.
- Login recebeu proposta mais clara, validação de campos vazios e testIDs nas ações secundárias.
- Hoje e Agenda receberam linguagem simplificada, testIDs completos no escopo alterado e ações mais diretas.

### Validação
- TypeScript: aprovado.
- ESLint: aprovado sem erros ou avisos.
- Expo web export: aprovado.
- Smoke test externo da tela de acesso: aprovado.
- Testing agent: 95%; única observação de testID com acento corrigida depois do relatório.
- Fluxos autenticados não executados porque as variáveis públicas do Supabase não estão configuradas nesta prévia. Nenhuma API foi simulada.