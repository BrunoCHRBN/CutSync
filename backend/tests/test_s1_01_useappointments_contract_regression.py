"""Regression tests for S1-01 temporal contract migration in dashboards/useAppointments."""

from __future__ import annotations

from pathlib import Path


ROOT = Path("/app")
HOOK_FILE = ROOT / "src/hooks/useAppointments.ts"
ADMIN_DASHBOARD_FILE = ROOT / "src/components/screens/AdminDashboardExperience.tsx"
PRO_DASHBOARD_FILE = ROOT / "src/components/screens/BarberDashboardExperience.tsx"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


# Module: useAppointments temporal filters
def test_useappointments_accepts_datefrom_dateto_and_applies_gte_lte() -> None:
    content = _read(HOOK_FILE)

    assert "dateFrom?: string" in content
    assert "dateTo?: string" in content
    assert "query = query.gte('date_time', dateFrom);" in content
    assert "query = query.lte('date_time', dateTo);" in content


def test_useappointments_rejects_invalid_iso_and_inverted_ranges() -> None:
    content = _read(HOOK_FILE)

    assert "Number.isNaN(Date.parse(dateFrom))" in content
    assert "Number.isNaN(Date.parse(dateTo))" in content
    assert "Date.parse(dateTo) < Date.parse(dateFrom)" in content


def test_useappointments_realtime_refresh_keeps_current_fetch_context() -> None:
    content = _read(HOOK_FILE)

    assert ") => fetch()," in content
    assert "const channelName = `appointments-" in content
    assert "useEffect(() => {" in content
    assert "}, [fetch, enabled, establishmentId, professionalId, clientId]);" in content


# Module: dashboard temporal contract callers
def test_admin_dashboard_sends_period_range_as_datefrom_dateto_iso() -> None:
    content = _read(ADMIN_DASHBOARD_FILE)

    assert "const periodRange = useMemo(() => {" in content
    assert "dateFrom: periodRange.start.toISOString()," in content
    assert "dateTo: periodRange.end.toISOString()," in content
    assert "enabled: Boolean(profile?.establishment_id)," in content


def test_professional_dashboard_sends_selected_range_as_datefrom_dateto_iso() -> None:
    content = _read(PRO_DASHBOARD_FILE)

    assert "const selectedRange = useMemo(() => {" in content
    assert "dateFrom: selectedRange.start.toISOString()," in content
    assert "dateTo: selectedRange.end.toISOString()," in content
    assert "enabled: Boolean(profile?.establishment_id)," in content
