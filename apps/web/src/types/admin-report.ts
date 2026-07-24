export interface AdminReportSummary {
  production_realized: number;
  scheduled_value: number;
  average_ticket: number;
  occupancy_rate: number;
  occupied_minutes: number;
  available_minutes: number;
  idle_minutes: number;
  completed_count: number;
  cancelled_count: number;
  pending_count: number;
  confirmed_count: number;
  active_count: number;
}

export interface AdminReportDay {
  date: string;
  production_realized: number;
  scheduled_value: number;
  occupied_minutes: number;
  available_minutes: number;
  occupancy_rate: number;
  completed_count: number;
  cancelled_count: number;
  appointment_count: number;
}

export interface AdminReportService {
  id: string;
  name: string;
  appointment_count: number;
  completed_count: number;
  cancelled_count: number;
  production_realized: number;
  average_ticket: number;
  average_duration_minutes: number;
  demand_share: number;
}

export interface AdminReportProfessional {
  id: string;
  name: string;
  commission_rate: number;
  appointment_count: number;
  completed_count: number;
  cancelled_count: number;
  production_realized: number;
  commission_amount: number;
  production_share: number;
  available_minutes: number;
  occupied_minutes: number;
  occupancy_rate: number;
}

export interface AdminReportCancellationItem {
  count: number;
}

export interface AdminReportCancellationReason extends AdminReportCancellationItem {
  reason: string;
}

export interface AdminReportCancellationRole extends AdminReportCancellationItem {
  role: 'client' | 'professional' | 'admin' | 'unknown';
}

export interface AdminReport {
  period: {
    start: string;
    end: string;
    days: number;
    previous_start: string;
    previous_end: string;
    timezone: string;
  };
  summary: AdminReportSummary;
  previous_summary: AdminReportSummary;
  daily_series: AdminReportDay[];
  hourly_demand: {
    day_of_week: number;
    hour: number;
    appointment_count: number;
  }[];
  services: AdminReportService[];
  professionals: AdminReportProfessional[];
  cancellations: {
    total: number;
    by_reason: AdminReportCancellationReason[];
    by_role: AdminReportCancellationRole[];
  };
  clients: {
    identified_clients: number;
    new_clients: number;
    returning_clients: number;
    return_rate: number;
    walk_in_appointments: number;
  };
  generated_at: string;
}

export type AdminReportTab = 'overview' | 'operations' | 'team' | 'services' | 'clients';
export type AdminReportStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';
export type AdminReportDetailDimension = 'appointments' | 'clients';

export interface AdminReportFilters {
  professionalId?: string | null;
  serviceId?: string | null;
  status?: AdminReportStatus | null;
}

export interface AdminReportAppointmentDetail {
  kind: 'appointment';
  id: string;
  date_time: string;
  status: AdminReportStatus;
  service_name: string;
  professional_id: string;
  professional_name: string;
  client_name: string;
  production_value: number;
}

export interface AdminReportClientDetail {
  kind: 'client';
  id: string;
  display_name: string;
  last_visit: string;
  visit_count: number;
  next_appointment: string | null;
  operational_status: 'scheduled' | 'active' | 'inactive';
}

export type AdminReportDetailItem = AdminReportAppointmentDetail | AdminReportClientDetail;

export interface AdminReportDetailPage {
  dimension: AdminReportDetailDimension;
  items: AdminReportDetailItem[];
  next_cursor: string | null;
  has_more: boolean;
}

export const emptyAdminReportSummary = (): AdminReportSummary => ({
  production_realized: 0,
  scheduled_value: 0,
  average_ticket: 0,
  occupancy_rate: 0,
  occupied_minutes: 0,
  available_minutes: 0,
  idle_minutes: 0,
  completed_count: 0,
  cancelled_count: 0,
  pending_count: 0,
  confirmed_count: 0,
  active_count: 0,
});
