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
  { id: 'b1', name: 'Marcos Lima', role: 'Barbeiro', avatar: '' },
  { id: 'b2', name: 'Ana Souza', role: 'Cabeleireira', avatar: '' },
  { id: 'b3', name: 'Camila Rocha', role: 'Especialista', avatar: '' },
  { id: 'b4', name: 'Rafael Alves', role: 'Barbeiro', avatar: '' },
];

export const INITIAL_MOCK_APPOINTMENTS: MockAppointment[] = [
  { id: 'a1', clientName: 'João Silva', serviceName: 'Corte e barba', timeSlot: '09:00', barberId: 'b1', status: 'pending', price: 65 },
  { id: 'a2', clientName: 'Carlos Oliveira', serviceName: 'Barba', timeSlot: '10:00', barberId: 'b1', status: 'confirmed', price: 45 },
  { id: 'a3', clientName: 'Beatriz Santos', serviceName: 'Manicure', timeSlot: '09:30', barberId: 'b3', status: 'confirmed', price: 80 },
  { id: 'a4', clientName: 'Lucas Pereira', serviceName: 'Corte social', timeSlot: '11:00', barberId: 'b2', status: 'confirmed', price: 50 },
];
