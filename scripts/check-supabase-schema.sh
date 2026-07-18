#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
committed_file="$repo_root/src/types/supabase.generated.ts"
generated_file="$(mktemp)"
trap 'rm -f "$generated_file"' EXIT

if [[ ! -f "$committed_file" ]]; then
  echo "Arquivo tipado não encontrado: src/types/supabase.generated.ts" >&2
  exit 1
fi

bash "$repo_root/scripts/generate-supabase-types.sh" "$generated_file" >/dev/null

if cmp -s "$committed_file" "$generated_file"; then
  echo "Schema Supabase sincronizado com os tipos versionados."
  exit 0
fi

echo "Divergência detectada entre o schema remoto e os tipos versionados." >&2
echo "Execute 'yarn types:supabase', revise o diff e versione o arquivo atualizado." >&2
diff -u \
  --label "tipos versionados" \
  --label "schema remoto" \
  "$committed_file" \
  "$generated_file" || true
exit 1