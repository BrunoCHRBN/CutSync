#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_path="${1:-$repo_root/packages/database/src/supabase.generated.ts}"
project_id="${SUPABASE_PROJECT_ID:-}"
local_mode="${SUPABASE_TYPES_LOCAL:-false}"

case "${local_mode,,}" in
  1|true|yes) local_mode=true ;;
  0|false|no|'') local_mode=false ;;
  *)
    echo "SUPABASE_TYPES_LOCAL inválido: '$local_mode'. Use true ou false." >&2
    exit 1
    ;;
esac

if [[ "$local_mode" == false ]]; then
  if [[ -z "$project_id" && -n "${EXPO_PUBLIC_SUPABASE_URL:-}" ]]; then
    project_id="$EXPO_PUBLIC_SUPABASE_URL"
  fi

  # Normalize project ref: strip whitespace, protocol, host suffix.
  project_id="${project_id//[[:space:]]/}"
  project_id="${project_id#https://}"
  project_id="${project_id#http://}"
  project_id="${project_id%%/*}"
  project_id="${project_id%%.*}"

  if [[ -z "$project_id" ]]; then
    echo "Defina SUPABASE_PROJECT_ID ou EXPO_PUBLIC_SUPABASE_URL antes de gerar os tipos." >&2
    exit 1
  fi

  if [[ ! "$project_id" =~ ^[a-z]{20}$ ]]; then
    echo "SUPABASE_PROJECT_ID inválido: '$project_id'. Deve ser um ref de 20 letras minúsculas (ex.: abcdefghijklmnopqrst)." >&2
    echo "Se você configurou a URL completa (https://xxxx.supabase.co), o script já extrai automaticamente; verifique o secret." >&2
    exit 1
  fi
fi

generated_file="$(mktemp)"
output_tmp=""
cleanup() {
  rm -f "$generated_file"
  if [[ -n "$output_tmp" ]]; then
    rm -f "$output_tmp"
  fi
}
trap cleanup EXIT

source_args=()
if [[ "$local_mode" == true ]]; then
  source_args+=(--local)
else
  source_args+=(--project-id "$project_id")
fi

if command -v supabase >/dev/null 2>&1; then
  supabase gen types typescript "${source_args[@]}" --schema public > "$generated_file"
else
  npx supabase gen types typescript "${source_args[@]}" --schema public > "$generated_file"
fi

mkdir -p "$(dirname "$output_path")"
output_tmp="$(mktemp "$(dirname "$output_path")/.supabase-types.XXXXXX")"
{
  printf '%s\n' '// Gerado pelo Supabase CLI. Atualize com: yarn types:supabase'
  awk '
    { lines[NR] = $0 }
    $0 !~ /^[[:space:]]*$/ { last_content_line = NR }
    END {
      for (line_number = 1; line_number <= last_content_line; line_number += 1) {
        print lines[line_number]
      }
    }
  ' "$generated_file"
} > "$output_tmp"
mv "$output_tmp" "$output_path"
output_tmp=""

echo "Tipos do Supabase atualizados em ${output_path#"$repo_root/"}"
