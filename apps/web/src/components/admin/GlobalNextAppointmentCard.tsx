import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { AppointmentRecord } from '@cutsync/database';
import { colors } from '../../theme/tokens';
import { NextAppointmentCard } from '../booking/NextAppointmentCard';

interface GlobalNextAppointmentCardProps {
  appointment: AppointmentRecord | null;
  loading: boolean;
  error: string | null;
  style?: StyleProp<ViewStyle>;
}

export const GlobalNextAppointmentCard = ({ appointment, loading, error, style }: GlobalNextAppointmentCardProps) => (
  <NextAppointmentCard
    appointment={appointment}
    loading={loading}
    error={error}
    accentColor={colors.accent}
    testID="global-next-appointment-card"
    testIDPrefix="global-next-appointment"
    title="Próximo atendimento da unidade"
    description="O compromisso ativo mais próximo de toda a equipe"
    showProfessional
    compact
    style={style}
  />
);
