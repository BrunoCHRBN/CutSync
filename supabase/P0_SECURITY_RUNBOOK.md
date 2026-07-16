# Aplicação do P0 de autorização

## Pré-requisito privado

Defina no banco a lista inicial de superadministradores antes das migrations, usando apenas e-mails já cadastrados:

```sql
ALTER DATABASE postgres
SET app.settings.cutsync_superadmin_emails = 'superadmin@exemplo.com';
```

Essa configuração fica no PostgreSQL, não no app nem em metadata do usuário. Superadmins já presentes em `public.superadmins` são preservados.

## Ordem

1. Aplicar todas as migrations em `supabase/migrations`.
2. Confirmar que `memberships` preservou os vínculos administrativos e profissionais atuais.
3. Executar `supabase/tests/authorization_p0.sql` com `psql` em um ambiente de validação.
4. Liberar cadastro e convites somente após toda a matriz terminar sem exceções `FAIL`.

## Garantias verificadas

- Cadastro público ignora `role` e `establishment_id` enviados por metadata.
- Superadmin convida admin; admin do tenant convida apenas profissional.
- Convites exigem e-mail confirmado, token de 256 bits, uso único e expiração de 24 horas.
- `memberships` é a fonte da autorização; o perfil mantém apenas um espelho de compatibilidade.
- Usuário não recebe privilégio para alterar role, estabelecimento ou comissão diretamente.