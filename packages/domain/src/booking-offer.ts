export interface BookingServiceOption {
  id: string;
  price: number;
  durationMinutes: number;
}

export interface BookingProfessionalOption {
  id: string;
}

export interface BookingProfessionalServiceOption {
  professionalId: string;
  serviceId: string;
  price: number;
  durationMinutes: number;
  isActive: boolean;
}

export const resolveBookingOffer = <
  Service extends BookingServiceOption,
  Professional extends BookingProfessionalOption,
>(
  services: readonly Service[],
  professionals: readonly Professional[],
  configurations: readonly BookingProfessionalServiceOption[],
  serviceId: string,
  professionalId: string,
) => {
  const service = services.find((item) => item.id === serviceId);
  const professional = professionals.find((item) => item.id === professionalId);
  if (!service || !professional) return null;
  const configuration = configurations.find((item) => (
    item.serviceId === serviceId && item.professionalId === professionalId
  ));
  if (configuration && !configuration.isActive) return null;
  return {
    service,
    professional,
    price: configuration?.price ?? service.price,
    durationMinutes: configuration?.durationMinutes ?? service.durationMinutes,
  };
};
