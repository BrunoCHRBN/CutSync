export interface DashboardAppointment {
  id: string;
  professionalId: string;
  barberName?: string;
  clientName: string;
  clientPhone: string;
  serviceName: string;
  price: number;
  dateTime: Date;
  status: string;
  cancellationReason?: string;
}

export interface DashboardDateOption {
  id: string;
  date: Date;
  weekDay: string;
  day: number;
}