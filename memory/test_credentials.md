# Credenciais de teste — Migração Supabase

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
- Supabase configurado em `/app/.env` com URL e chave pública.

## Administrador informado pelo usuário

- E-mail: `brusantos777@gmail.com`
- Senha: `bruno1324`
- Uso: validar persistência do perfil profissional, jornada e galeria do estabelecimento.

## Validação disponível sem credenciais

- Login e seus estados de erro.
- Build TypeScript e pacote web.
- Análise estática do Dashboard Admin e Agendamento.

## Validação pendente

- Dashboard Admin autenticado com dados reais quando as variáveis Supabase estiverem disponíveis no ambiente.
- Agendamento completo com cliente, serviços, profissionais e conflitos reais.
- Módulo profissional: agenda, histórico, reagendamento e encaixe rápido.

Também são necessárias as variáveis `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY` para iniciar a prévia autenticada.