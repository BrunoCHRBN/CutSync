export const appointmentFeedbackMessages = {
  appointmentCreated: 'Agendamento solicitado. O horário ficará pendente até a confirmação do estabelecimento.',
  appointmentRescheduled: 'Agendamento reagendado com sucesso.',
  quickBookingCreated: 'Encaixe criado e reservado na sua agenda.',
  appointmentConflict: 'Esse horário acabou de ser reservado. Escolha outro horário.',
  availabilityLoadFailed: 'Não foi possível consultar os horários. Tente novamente.',
  nextAppointmentLoadFailed: 'Não foi possível consultar o próximo atendimento.',
} as const;

const appointmentErrorMessages: Record<string, string> = {
  appointment_must_be_in_future: 'Escolha um horário futuro para criar o encaixe.',
  appointment_conflict: appointmentFeedbackMessages.appointmentConflict,
  appointment_outside_availability: 'Este horário está fora da jornada disponível do profissional.',
  availability_check_failed: 'Não foi possível confirmar a disponibilidade. Tente novamente.',
  professional_unavailable: 'Seu vínculo com esta unidade não está ativo.',
  service_unavailable_for_professional: 'Este serviço não está habilitado para o seu perfil profissional.',
  service_unavailable: 'Este serviço não está mais disponível.',
  client_name_required: 'Informe o nome do cliente para criar o encaixe.',
  appointment_status_immutable: 'Este atendimento não pode mais ser alterado.',
  appointment_already_started: 'Este atendimento já começou ou está no passado.',
  cancellation_window_closed: 'O prazo para alterar este atendimento pelo aplicativo foi encerrado.',
  invalid_cancellation_reason: 'Escolha um motivo válido para cancelar.',
  reschedule_limit_reached: 'Este atendimento já atingiu o limite de reagendamentos.',
  establishment_unavailable: 'Este estabelecimento não está disponível para esta ação.',
  forbidden: 'Você não tem permissão para criar este encaixe.',
};

export const getAppointmentErrorText = (error: unknown) => {
  if (typeof error === 'string') return error;
  if (!error || typeof error !== 'object') return '';

  return ['message', 'details', 'hint', 'code']
    .map((key) => (error as Record<string, unknown>)[key])
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
};

export const translateAppointmentError = (
  error: unknown,
  fallback = 'Não foi possível concluir esta ação.',
) => {
  const errorText = getAppointmentErrorText(error);
  const matchedCode = Object.keys(appointmentErrorMessages)
    .find((code) => errorText.includes(code));

  return matchedCode ? appointmentErrorMessages[matchedCode] : fallback;
};
