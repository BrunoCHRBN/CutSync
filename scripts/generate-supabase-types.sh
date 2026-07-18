#!/usr/bin/env bash
set -euo pipefail

project_id="${SUPABASE_PROJECT_ID:-}"

if [[ -z "$project_id" && -n "${EXPO_PUBLIC_SUPABASE_URL:-}" ]]; then
  project_id="${EXPO_PUBLIC_SUPABASE_URL#https://}"
  project_id="${project_id%%.*}"
fi

if [[ -z "$project_id" ]]; then
  echo "Defina SUPABASE_PROJECT_ID antes de gerar os tipos." >&2
  exit 1
fi

npx supabase gen types typescript \
  --project-id "$project_id" \
  --schema public \
  > src/types/supabase.generated.ts

echo "Tipos do Supabase atualizados em src/types/supabase.generated.ts"