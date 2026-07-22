export interface MockBarber {
  id: string;
  name: string;
  role: string;
  avatar: string;
}

export interface MockAppointment {
  id: string;
  clientName: string;
  serviceName: string;
  timeSlot: string;
  barberId: string;
  status: 'confirmed' | 'pending' | 'completed';
  price: number;
}

export const MOCK_BARBERS: MockBarber[] = [
  { id: 'b1', name: 'Profissional A', role: 'Barbeiro', avatar: '' },
  { id: 'b2', name: 'Profissional B', role: 'Barbeiro', avatar: '' },
  { id: 'b3', name: 'Profissional C', role: 'Especialista', avatar: '' },
  { id: 'b4', name: 'Profissional D', role: 'Cabeleireiro', avatar: '' },
];

export const INITIAL_MOCK_APPOINTMENTS: MockAppointment[] = [
  { id: 'a1', clientName: 'Cliente 01', serviceName: 'Corte e barba', timeSlot: '09:00', barberId: 'b1', status: 'pending', price: 65 },
  { id: 'a2', clientName: 'Cliente 02', serviceName: 'Barba', timeSlot: '10:00', barberId: 'b1', status: 'confirmed', price: 45 },
  { id: 'a3', clientName: 'Cliente 03', serviceName: 'Manicure', timeSlot: '09:30', barberId: 'b3', status: 'confirmed', price: 80 },
  { id: 'a4', clientName: 'Cliente 04', serviceName: 'Corte', timeSlot: '11:00', barberId: 'b2', status: 'confirmed', price: 50 },
];
