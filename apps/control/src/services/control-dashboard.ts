export interface ControlDashboardSnapshot {
  generatedAt: string;
  timezone: string;
  appointmentsToday: number;
  completedLast28Days: number;
  cancelledLast28Days: number;
  activeEstablishments: number;
  pendingEstablishmentRequests: number;
}

type DashboardPayload = {
  generated_at?: unknown;
  timezone?: unknown;
  appointments_today?: unknown;
  completed_last_28_days?: unknown;
  cancelled_last_28_days?: unknown;
  active_establishments?: unknown;
  pending_establishment_requests?: unknown;
};

export function parseControlDashboard(value: unknown): ControlDashboardSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('control_dashboard_invalid');
  }

  const payload = value as DashboardPayload;
  const numericValues = [
    payload.appointments_today,
    payload.completed_last_28_days,
    payload.cancelled_last_28_days,
    payload.active_establishments,
    payload.pending_establishment_requests,
  ];

  if (
    typeof payload.generated_at !== 'string'
    || Number.isNaN(Date.parse(payload.generated_at))
    || typeof payload.timezone !== 'string'
    || !numericValues.every((item) => typeof item === 'number' && Number.isFinite(item) && item >= 0)
  ) {
    throw new Error('control_dashboard_invalid');
  }

  return {
    generatedAt: payload.generated_at,
    timezone: payload.timezone,
    appointmentsToday: payload.appointments_today as number,
    completedLast28Days: payload.completed_last_28_days as number,
    cancelledLast28Days: payload.cancelled_last_28_days as number,
    activeEstablishments: payload.active_establishments as number,
    pendingEstablishmentRequests: payload.pending_establishment_requests as number,
  };
}
