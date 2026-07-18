import json
from pathlib import Path


ROOT = Path("/app")


def _read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def _read_json(path: str):
    return json.loads(_read(path))


# Dependency compatibility and install pipeline checks
def test_package_json_pins_lucide_react_native_and_node_22x():
    package = _read_json("package.json")
    assert package["dependencies"]["lucide-react-native"] == "1.25.0"
    assert package["dependencies"]["react"] == "19.2.3"
    assert package["engines"]["node"] == "22.x"


def test_nvmrc_is_node_22():
    assert _read(".nvmrc").strip() == "22"


def test_package_lock_contains_lucide_1250_peer_react_19_support():
    lock = _read_json("package-lock.json")
    lucide = lock["packages"]["node_modules/lucide-react-native"]
    peers = lucide["peerDependencies"]
    assert lucide["version"] == "1.25.0"
    assert "^19.0.0" in peers["react"]
    assert "^15.0.0" in peers["react-native-svg"]


def test_vercel_uses_clean_install_build_web_and_dist_output():
    vercel = _read_json("vercel.json")
    assert vercel["installCommand"] == "npm ci"
    assert vercel["buildCommand"] == "npm run build:web"
    assert vercel["outputDirectory"] == "dist"


def test_workflow_uses_node22_npm_ci_lint_and_build_web():
    workflow = _read(".github/workflows/install-and-build.yml")
    assert "actions/setup-node@v4" in workflow
    assert "node-version: 22" in workflow
    assert "run: npm ci" in workflow
    assert "run: npm run lint" in workflow
    assert "run: npm run build:web" in workflow


def test_no_legacy_peer_deps_or_force_workarounds_in_release_files():
    checked_files = [
        "package.json",
        "package-lock.json",
        "vercel.json",
        ".github/workflows/install-and-build.yml",
    ]
    forbidden = ["legacy-peer-deps", "--force", "npm install --force", "npm ci --force"]

    for file in checked_files:
        content = _read(file)
        lowered = content.lower()
        for token in forbidden:
            assert token not in lowered, f"Found forbidden token '{token}' in {file}"


# Icon import regression checks after Instagram export removal
def test_slug_screen_uses_camera_and_not_instagram_icon_import():
    content = _read("src/app/[slug]/index.tsx")
    import_line = next((line for line in content.splitlines() if "from 'lucide-react-native'" in line), "")
    assert "Camera" in import_line
    assert "Instagram" not in import_line


def test_profile_experience_uses_camera_and_not_instagram_icon_import():
    content = _read("src/components/screens/BarbershopProfileExperience.tsx")
    import_line = next((line for line in content.splitlines() if "from 'lucide-react-native'" in line), "")
    assert "Camera" in import_line
    assert "Instagram" not in import_line
