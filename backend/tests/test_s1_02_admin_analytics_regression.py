"""Regression tests for S1-02 daily agenda and analytics query separation."""

from pathlib import Path


ADMIN_DASHBOARD = Path("/app/src/components/screens/AdminDashboardExperience.tsx")
APPOINTMENTS_HOOK = Path("/app/src/hooks/useAppointments.ts")


def _source() -> str:
    return ADMIN_DASHBOARD.read_text(encoding="utf-8", errors="ignore")


def test_admin_uses_independent_daily_and_period_queries() -> None:
    content = _source()

    assert "const dailyRange = useMemo(() => {" in content
    assert "dateFrom: dailyRange.start.toISOString()," in content
    assert "dateTo: dailyRange.end.toISOString()," in content
    assert "appointments: periodAppointmentRecords" in content
    assert "dateFrom: periodRange.start.toISOString()," in content
    assert "dateTo: periodRange.end.toISOString()," in content


def test_period_filter_does_not_depend_on_selected_calendar_date() -> None:
    content = _source()

    assert "const start = new Date();" in content
    assert "}, [period]);" in content
    assert "}, [period, selectedDate]);" not in content


def test_week_runs_from_monday_through_sunday() -> None:
    content = _source()

    assert "const daysSinceMonday = day === 0 ? 6 : day - 1;" in content
    assert "end.setDate(end.getDate() + 6)" in content


def test_metrics_and_commissions_use_period_records_only() -> None:
    content = _source()

    assert "const periodAppointments = useMemo<RichAppointment[]>" in content
    assert "periodAppointments.filter((item) => item.status !== 'cancelled')" in content
    assert "periodAppointments.filter((item) => item.status === 'completed')" in content
    assert "12 * periodDayCount" in content
    assert "period === 'week' ? 6 : 26" not in content
    assert "const rate = barber.commissionRate ?? 0;" in content
    assert "Comissão não configurada" in content
    assert "barber.commissionRate ?? 0.5" not in content


def test_daily_and_period_records_share_the_same_mapper() -> None:
    content = _source()

    assert "const toRichAppointment = (item: AppointmentRecord): RichAppointment" in content
    assert "appointmentRecords.map(toRichAppointment)" in content
    assert "periodAppointmentRecords.map(toRichAppointment)" in content


def test_mutations_refresh_daily_and_period_queries() -> None:
    content = _source()

    assert "await Promise.all([refreshDaily(), refreshPeriod()]);" in content


def test_realtime_channels_are_unique_per_query_range() -> None:
    content = APPOINTMENTS_HOOK.read_text(encoding="utf-8", errors="ignore")

    assert "const rangeKey = `${dateFrom ? Date.parse(dateFrom) : 'open'}-${dateTo ? Date.parse(dateTo) : 'open'}`;" in content
    assert "-${rangeKey}-${channelInstanceId}`;" in content