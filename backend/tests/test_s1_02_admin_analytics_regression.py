"""Regression tests for S1-02 daily agenda and analytics query separation."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
ADMIN_DASHBOARD = ROOT / "src/components/screens/AdminDashboardExperience.tsx"
APPOINTMENTS_HOOK = ROOT / "src/hooks/useAppointments.ts"


def _source() -> str:
    return ADMIN_DASHBOARD.read_text(encoding="utf-8", errors="ignore")


def test_admin_uses_daily_query_and_aggregated_report() -> None:
    content = _source()

    assert "const dailyRange = useMemo(() => {" in content
    assert "dateFrom: dailyRange.start.toISOString()," in content
    assert "dateTo: dailyRange.end.toISOString()," in content
    assert "useAdminReport({" in content
    assert "rangeStart: todayKey," in content
    assert "rangeEnd: todayKey," in content


def test_operational_date_does_not_change_report_date() -> None:
    content = _source()

    assert "const todayKey = toDateKey(new Date());" in content
    assert "rangeStart: todayKey" in content


def test_metrics_use_server_report_and_not_fixed_slot_estimate() -> None:
    content = _source()

    assert "reportSummary?.production_realized" in content
    assert "reportSummary?.scheduled_value" in content
    assert "reportSummary?.occupancy_rate" in content
    assert "12 * periodDayCount" not in content
    assert "Ocupação estimada" not in content


def test_daily_records_keep_the_operational_mapper() -> None:
    content = _source()

    assert "const toRichAppointment = (item: AppointmentRecord): RichAppointment" in content
    assert "appointmentRecords.map(toRichAppointment)" in content


def test_mutations_refresh_daily_and_report_queries() -> None:
    content = _source()

    assert "await Promise.all([refreshDaily(), refreshReport()]);" in content


def test_realtime_channels_are_unique_per_query_range() -> None:
    content = APPOINTMENTS_HOOK.read_text(encoding="utf-8", errors="ignore")

    assert "const rangeKey = `${dateFrom ? Date.parse(dateFrom) : 'open'}-${dateTo ? Date.parse(dateTo) : 'open'}`;" in content
    assert "-${rangeKey}-${channelInstanceId}`;" in content
