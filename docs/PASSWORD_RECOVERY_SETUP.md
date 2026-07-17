# Recuperação de senha — configuração Supabase

O código já usa o Supabase Auth e abre a redefinição diretamente no CutSync. Para que o servidor imponha a mesma política e aceite os redirects, configure no painel do projeto `hxoenfnszrrgaqxplzmd`:

## 1. Authentication → URL Configuration

- **Site URL:** `https://cut-sync.vercel.app`
- **Redirect URLs:**
  - `https://cut-sync.vercel.app/reset-password`
  - `https://cut-sync.vercel.app/**`
  - `cutsync://reset-password`
  - `cutsync://**`

Para testes locais, adicione temporariamente `http://localhost:3000/reset-password` ou a porta usada pelo Expo.

## 2. Authentication → Password Security

- **Minimum password length:** `8`
- Exigir pelo menos:
  - uma letra minúscula;
  - uma letra maiúscula;
  - um número;
  - um símbolo especial.

Essas regras precisam coincidir com `src/utils/passwordPolicy.ts`.

## 3. Authentication → Email Templates → Reset Password

- Mantenha `{{ .ConfirmationURL }}` como destino do botão principal.
- Não inclua senha, access token ou refresh token no texto do e-mail.
- Assunto recomendado: `Redefina sua senha do CutSync`.

## 4. Variáveis de ambiente

Configurar no ambiente web/mobile:

```env
EXPO_PUBLIC_SUPABASE_URL=https://hxoenfnszrrgaqxplzmd.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<chave pública do projeto>
EXPO_PUBLIC_APP_URL=https://cut-sync.vercel.app
```

O arquivo `.env` local permanece ignorado pelo Git. Nunca usar a senha PostgreSQL ou uma chave `service_role` no aplicativo.