# Teste de autenticação — CutSync

As rotas administrativas e do barbeiro exigem sessão Supabase válida e dados sincronizados no banco local.

## Rotas amigáveis

- `/admin` → visão geral administrativa
- `/admin/barbers` → equipe
- `/admin/services` → serviços
- `/admin/settings` → configurações
- `/barber` → painel do profissional

## Credenciais

Consulte `/app/memory/test_credentials.md`. Nenhuma conta é criada automaticamente para não escrever dados no projeto Supabase sem autorização.

## Cobertura sem sessão

- Login e cadastro por perfil.
- Redirecionamento seguro de deep-links.
- TypeScript, pacote web e Expo Doctor.