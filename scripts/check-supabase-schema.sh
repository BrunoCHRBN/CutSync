#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
committed_file="$repo_root/packages/database/src/supabase.generated.ts"
generated_file="$(mktemp)"
trap 'rm -f "$generated_file"' EXIT

local_mode="${SUPABASE_TYPES_LOCAL:-false}"
case "${local_mode,,}" in
  1|true|yes)
    local_mode=true
    comparison_label="replay local"
    ;;
  0|false|no|'')
    local_mode=false
    comparison_label="Homolog remoto"
    ;;
  *)
    echo "SUPABASE_TYPES_LOCAL inválido: '$local_mode'. Use true ou false." >&2
    exit 1
    ;;
esac

write_summary() {
  local status="$1"
  local detail="$2"

  if [[ -z "${GITHUB_STEP_SUMMARY:-}" ]]; then
    return
  fi

  {
    echo "## Contrato de tipos Supabase"
    echo
    echo "- Fonte comparada: ${comparison_label}"
    echo "- Status: ${status}"
    echo "- Detalhe: ${detail}"
  } >> "$GITHUB_STEP_SUMMARY"
}

if [[ ! -f "$committed_file" ]]; then
  echo "Arquivo tipado não encontrado: packages/database/src/supabase.generated.ts" >&2
  exit 1
fi

bash "$repo_root/scripts/generate-supabase-types.sh" "$generated_file" >/dev/null

if cmp -s "$committed_file" "$generated_file"; then
  if [[ "$local_mode" == true ]]; then
    echo "Replay local sincronizado com o contrato de tipos versionado."
    write_summary "aprovado" "As migrations reproduzidas localmente correspondem aos tipos versionados."
  else
    echo "Homolog sincronizado com o contrato de tipos do replay local."
    write_summary "sem drift" "Homolog corresponde ao contrato de tipos versionado."
  fi
  exit 0
fi

if [[ "$local_mode" == true ]]; then
  echo "Divergência detectada entre o replay local e o contrato de tipos versionado." >&2
  echo "Execute 'SUPABASE_TYPES_LOCAL=true npm run types:supabase', revise o diff e versione o contrato local." >&2
  expected_label="tipos versionados"
  actual_label="replay local"
  write_summary "falha" "O replay local e os tipos versionados divergem."
else
  echo "Drift detectado entre Homolog e o contrato de tipos do replay local." >&2
  echo "Não regenere os tipos a partir de Homolog para ocultar o drift; reconcilie ou promova somente migrations autorizadas." >&2
  expected_label="contrato tipado do replay local"
  actual_label="Homolog remoto"
  write_summary "drift detectado" "O monitor é somente leitura; nenhuma migration remota foi aplicada ou reparada."
fi

diff -u \
  --label "$expected_label" \
  --label "$actual_label" \
  "$committed_file" \
  "$generated_file" || true
exit 1
