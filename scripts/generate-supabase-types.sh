#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SUPABASE_PROJECT_ID:-}" ]]; then
  echo "Defina SUPABASE_PROJECT_ID antes de gerar os tipos." >&2
  exit 1
fi

npx supabase gen types typescript \
  --project-id "$SUPABASE_PROJECT_ID" \
  --schema public \
  > src/types/supabase.generated.ts

echo "Tipos do Supabase atualizados em src/types/supabase.generated.ts"