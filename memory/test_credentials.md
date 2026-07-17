# Credenciais de teste — Migração Supabase

> Status em 17/07/2026: as três contas foram validadas com a chave pública correta do projeto e retornaram sessão Auth 200.

## Cliente
- E-mail: `bakdmskaj8183@gmail.com`
- Senha: `bruno1324`

## Profissional
- E-mail: `brusantos7178@outlook.com`
- Senha: `bruno1324`

## Dono/Admin
- E-mail: `brusantos777@gmail.com`
- Senha: `bruno1324`

## Ambiente
- As variáveis públicas Supabase corretas estão configuradas no `.env` local, que permanece ignorado pelo Git.
- URL web oficial: `https://cut-sync.vercel.app`.
- A senha do banco informada pelo usuário não é registrada neste arquivo e deve ser rotacionada.

## Administrador informado pelo usuário

- E-mail: `brusantos777@gmail.com`
- Senha: `bruno1324`
- Uso: validar persistência do perfil profissional, jornada e galeria do estabelecimento.

## Validação disponível sem credenciais

- Login e seus estados de erro.
- Build TypeScript e pacote web.
- Análise estática do Dashboard Admin e Agendamento.

## Validação realizada em 16/07/2026

- Login e navegação real dos perfis cliente, profissional e dono/admin.
- Leitura de catálogo, perfis e agendamentos para auditoria de RLS, sem escrita no banco.
- Foi confirmado vazamento de perfis entre estabelecimentos; detalhes em `/app/CUTSYNC_AUDIT.md`.

## Ação de segurança

- Rotacionar as três senhas de teste, pois são iguais e foram compartilhadas durante a auditoria.
- Após qualquer rotação, substituir imediatamente os valores acima e repetir login cliente/profissional/admin.