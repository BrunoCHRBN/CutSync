import json
import os
import shutil
import stat
import subprocess
from pathlib import Path

import pytest
import yaml


# Supabase schema drift scripts/workflow regression tests
REPO_ROOT = Path(__file__).resolve().parents[2]
GENERATE_SCRIPT = REPO_ROOT / "scripts" / "generate-supabase-types.sh"
CHECK_SCRIPT = REPO_ROOT / "scripts" / "check-supabase-schema.sh"
WORKFLOW_FILE = REPO_ROOT / ".github" / "workflows" / "supabase-schema-drift.yml"
PACKAGE_JSON = REPO_ROOT / "package.json"


def _write_executable(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR)


def _make_repo_fixture(tmp_path: Path, committed_types: str) -> Path:
    repo = tmp_path / "repo"
    (repo / "scripts").mkdir(parents=True)
    (repo / "packages" / "database" / "src").mkdir(parents=True)

    shutil.copy(GENERATE_SCRIPT, repo / "scripts" / "generate-supabase-types.sh")
    shutil.copy(CHECK_SCRIPT, repo / "scripts" / "check-supabase-schema.sh")
    (repo / "packages" / "database" / "src" / "supabase.generated.ts").write_text(committed_types, encoding="utf-8")
    return repo


def _run(cmd: list[str], cwd: Path, env: dict[str, str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=str(cwd), env=env, text=True, capture_output=True)


def test_package_script_points_to_check_script() -> None:
    package = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))
    assert package["scripts"]["check:supabase-schema"] == "bash scripts/check-supabase-schema.sh"


def test_check_returns_zero_when_generated_matches_committed(tmp_path: Path) -> None:
    generated_types = "export type Database = { ok: true }\n"
    committed_types = "// Gerado pelo Supabase CLI. Atualize com: yarn types:supabase\n" + generated_types
    repo = _make_repo_fixture(tmp_path, committed_types)

    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    _write_executable(
        bin_dir / "supabase",
        "#!/usr/bin/env bash\n"
        "set -euo pipefail\n"
        "cat <<'EOF'\n"
        f"{generated_types}"
        "EOF\n",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"
    env["SUPABASE_PROJECT_ID"] = "proj_123"

    result = _run(["bash", "scripts/check-supabase-schema.sh"], cwd=repo, env=env)
    assert result.returncode == 0
    assert "sincronizado" in result.stdout.lower()


def test_check_returns_one_and_unified_diff_when_drift_detected(tmp_path: Path) -> None:
    committed_types = "// Gerado pelo Supabase CLI. Atualize com: yarn types:supabase\nexport type Database = { v: 1 }\n"
    repo = _make_repo_fixture(tmp_path, committed_types)

    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    _write_executable(
        bin_dir / "supabase",
        "#!/usr/bin/env bash\n"
        "set -euo pipefail\n"
        "cat <<'EOF'\n"
        "export type Database = { v: 2 }\n"
        "EOF\n",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"
    env["SUPABASE_PROJECT_ID"] = "proj_123"

    result = _run(["bash", "scripts/check-supabase-schema.sh"], cwd=repo, env=env)
    combined = f"{result.stdout}\n{result.stderr}"
    assert result.returncode == 1
    assert "divergência" in combined.lower()
    assert "--- tipos versionados" in combined
    assert "+++ schema remoto" in combined


def test_generator_writes_atomically_and_supports_optional_output_path(tmp_path: Path) -> None:
    repo = _make_repo_fixture(tmp_path, "// Gerado pelo Supabase CLI. Atualize com: yarn types:supabase\nexport type Database = {}\n")

    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    _write_executable(
        bin_dir / "supabase",
        "#!/usr/bin/env bash\n"
        "set -euo pipefail\n"
        "cat <<'EOF'\n"
        "export type Database = { generated: true }\n"
        "EOF\n",
    )

    custom_out = repo / "tmp" / "custom.generated.ts"
    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"
    env["SUPABASE_PROJECT_ID"] = "proj_123"

    result = _run(["bash", "scripts/generate-supabase-types.sh", str(custom_out)], cwd=repo, env=env)
    assert result.returncode == 0
    assert custom_out.exists()
    content = custom_out.read_text(encoding="utf-8")
    assert content.startswith("// Gerado pelo Supabase CLI")
    assert "generated: true" in content


def test_generator_failure_does_not_corrupt_default_versioned_file(tmp_path: Path) -> None:
    original = "// Gerado pelo Supabase CLI. Atualize com: yarn types:supabase\nexport type Database = { stable: true }\n"
    repo = _make_repo_fixture(tmp_path, original)

    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    _write_executable(
        bin_dir / "supabase",
        "#!/usr/bin/env bash\n"
        "set -euo pipefail\n"
        "echo 'forced failure' >&2\n"
        "exit 9\n",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"
    env["SUPABASE_PROJECT_ID"] = "proj_123"

    result = _run(["bash", "scripts/generate-supabase-types.sh"], cwd=repo, env=env)
    versioned_file = repo / "packages" / "database" / "src" / "supabase.generated.ts"
    assert result.returncode != 0
    assert versioned_file.read_text(encoding="utf-8") == original


def test_generator_uses_project_id_env_or_derives_from_expo_url(tmp_path: Path) -> None:
    repo = _make_repo_fixture(tmp_path, "// Gerado pelo Supabase CLI. Atualize com: yarn types:supabase\n")
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    args_log = tmp_path / "args.log"

    _write_executable(
        bin_dir / "supabase",
        "#!/usr/bin/env bash\n"
        "set -euo pipefail\n"
        f"printf '%s\\n' \"$*\" >> '{args_log}'\n"
        "cat <<'EOF'\n"
        "export type Database = { ok: true }\n"
        "EOF\n",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"
    env["SUPABASE_PROJECT_ID"] = "direct_proj"
    result_direct = _run(["bash", "scripts/generate-supabase-types.sh", str(repo / "tmp" / "a.ts")], cwd=repo, env=env)
    assert result_direct.returncode == 0

    env2 = os.environ.copy()
    env2["PATH"] = f"{bin_dir}:{env2.get('PATH', '')}"
    env2["EXPO_PUBLIC_SUPABASE_URL"] = "https://derivedref.supabase.co"
    result_derived = _run(["bash", "scripts/generate-supabase-types.sh", str(repo / "tmp" / "b.ts")], cwd=repo, env=env2)
    assert result_derived.returncode == 0

    log = args_log.read_text(encoding="utf-8")
    assert "--project-id direct_proj" in log
    assert "--project-id derivedref" in log


def test_workflow_yaml_valid_and_blocks_drift_with_required_secrets() -> None:
    data = yaml.safe_load(WORKFLOW_FILE.read_text(encoding="utf-8"))
    assert isinstance(data, dict)

    # PyYAML (YAML 1.1) can coerce top-level key "on" to boolean True
    triggers = data.get("on") or data.get(True) or {}
    assert "pull_request" in triggers
    assert "push" in triggers
    assert "schedule" in triggers
    assert "workflow_dispatch" in triggers

    job = data["jobs"]["schema-drift"]
    env = job["env"]
    assert env["SUPABASE_ACCESS_TOKEN"] == "${{ secrets.SUPABASE_ACCESS_TOKEN }}"
    assert env["SUPABASE_PROJECT_ID"] == "${{ secrets.SUPABASE_PROJECT_ID }}"

    steps = job["steps"]
    run_commands = "\n".join(step.get("run", "") for step in steps)
    assert "check-supabase-schema.sh" in run_commands
    assert "SUPABASE_ACCESS_TOKEN" in run_commands and "SUPABASE_PROJECT_ID" in run_commands


def test_no_hardcoded_credentials_in_scripts_and_workflow() -> None:
    files = [GENERATE_SCRIPT, CHECK_SCRIPT, WORKFLOW_FILE]
    blob = "\n".join(f.read_text(encoding="utf-8") for f in files)

    assert "SUPABASE_ACCESS_TOKEN:" in blob
    assert "${{ secrets.SUPABASE_ACCESS_TOKEN }}" in blob
    assert "${{ secrets.SUPABASE_PROJECT_ID }}" in blob

    hardcoded_markers = [
        "sbp_",
        "service_role",
        "supabase.co/rest/v1",
        "Bearer ",
    ]
    for marker in hardcoded_markers:
        assert marker not in blob
