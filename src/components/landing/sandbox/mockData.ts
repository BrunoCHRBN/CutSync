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
  status: 'confirmed' | 'pending' | 'urgent';
  price: number;
}

export const MOCK_BARBERS: MockBarber[] = [
  { id: 'b1', name: 'Lucas Silva', role: 'Master Barber', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150' },
  { id: 'b2', name: 'Matheus Rocha', role: 'Barbeiro Sênior', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150' },
  { id: 'b3', name: 'Camila Santos', role: 'Especialista Nails', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150' },
  { id: 'b4', name: 'Gabriel Lima', role: 'Hair Stylist', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150' },
];

export const INITIAL_MOCK_APPOINTMENTS: MockAppointment[] = [
  { id: 'a1', clientName: 'Ricardo Prado', serviceName: 'Corte Degradê & Barba', timeSlot: '09:00', barberId: 'b1', status: 'confirmed', price: 65 },
  { id: 'a2', clientName: 'Felipe Mendes', serviceName: 'Barba Terapia', timeSlot: '10:00', barberId: 'b1', status: 'confirmed', price: 45 },
  { id: 'a3', clientName: 'Ana Clara', serviceName: 'Manicure Gel VIP', timeSlot: '09:30', barberId: 'b3', status: 'confirmed', price: 80 },
  { id: 'a4', clientName: 'Carlos Eduardo', serviceName: 'Corte Masculino', timeSlot: '11:00', barberId: 'b2', status: 'confirmed', price: 50 },
];
