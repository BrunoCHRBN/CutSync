import Establishment from './Barbershop';
import Profile from './Profile';
import Service from './Service';
import Appointment from './Appointment';
import ProfessionalService from './BarberService';
import ProfileEstablishment from './ProfileBarbershop';

export const models = [Establishment, Profile, Service, Appointment, ProfessionalService, ProfileEstablishment];

export { Establishment, Profile, Service, Appointment, ProfessionalService, ProfileEstablishment };

// Backward-compat aliases (will be removed in a future cleanup)
export { Establishment as Barbershop };
export { ProfessionalService as BarberService };
export { ProfileEstablishment as ProfileBarbershop };
