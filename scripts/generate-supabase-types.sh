#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_path="${1:-$repo_root/src/types/supabase.generated.ts}"
project_id="${SUPABASE_PROJECT_ID:-}"

if [[ -z "$project_id" && -n "${EXPO_PUBLIC_SUPABASE_URL:-}" ]]; then
  project_id="${EXPO_PUBLIC_SUPABASE_URL#https://}"
  project_id="${project_id%%.*}"
fi

if [[ -z "$project_id" ]]; then
  echo "Defina SUPABASE_PROJECT_ID ou EXPO_PUBLIC_SUPABASE_URL antes de gerar os tipos." >&2
  exit 1
fi

generated_file="$(mktemp)"
trap 'rm -f "$generated_file"' EXIT

if command -v supabase >/dev/null 2>&1; then
  supabase gen types typescript --project-id "$project_id" --schema public > "$generated_file"
else
  npx supabase gen types typescript --project-id "$project_id" --schema public > "$generated_file"
fi

mkdir -p "$(dirname "$output_path")"
{
  printf '%s\n' '// Gerado pelo Supabase CLI. Atualize com: yarn types:supabase'
  while IFS= read -r line || [[ -n "$line" ]]; do
    printf '%s\n' "$line"
  done < "$generated_file"
} > "$output_path"

echo "Tipos do Supabase atualizados em ${output_path#"$repo_root/"}"