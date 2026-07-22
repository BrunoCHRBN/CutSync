import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Calendar, CircleCheck, Clock, Plus, UserCheck } from 'lucide-react-native';
import { landingColors as colors, landingRadii as radii, landingTypography as typography } from '../../../theme/landing-tokens';
import { INITIAL_MOCK_APPOINTMENTS, MOCK_BARBERS, MockAppointment } from './mockData';

export const AgendaSandbox = () => {
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const [appointments, setAppointments] = useState<MockAppointment[]>(INITIAL_MOCK_APPOINTMENTS);
  const [clientInputName, setClientInputName] = useState('');

  const addQuickBooking = () => {
    if (!clientInputName.trim()) return;
    setAppointments((current) => [{
      id: `appointment-${Date.now()}`,
      clientName: clientInputName.trim(),
      serviceName: 'Encaixe de balcão',
      timeSlot: '11:30',
      barberId: 'b1',
      status: 'pending',
      price: 50,
    }, ...current]);
    setClientInputName('');
  };

  const advanceStatus = (appointment: MockAppointment) => {
    const status = appointment.status === 'pending' ? 'confirmed' : 'completed';
    setAppointments((current) => current.map((item) => item.id === appointment.id ? { ...item, status } : item));
  };

  return (
    <View testID="business-agenda-demo" style={styles.card}>
      <View style={[styles.header, compact && styles.headerStacked]}>
        <View style={styles.headerCopy}>
          <View style={styles.titleRow}><Calendar size={18} color={colors.brand} /><Text style={styles.title}>Agenda e encaixe rápido</Text></View>
          <Text style={styles.subtitle}>Inclua um atendimento de balcão e avance o status de pendente para confirmado ou concluído.</Text>
        </View>
        <View style={styles.availableBadge}><Text style={styles.availableBadgeText}>FUNÇÃO DISPONÍVEL</Text></View>
      </View>

      <View style={[styles.inputRow, compact && styles.inputRowStacked]}>
        <TextInput
          accessibilityLabel="Nome do cliente do encaixe"
          value={clientInputName}
          onChangeText={setClientInputName}
          onSubmitEditing={addQuickBooking}
          placeholder="Nome do cliente"
          placeholderTextColor={colors.inkMuted}
          style={styles.input}
        />
        <Pressable accessibilityRole="button" onPress={addQuickBooking} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
          <Plus size={16} color={colors.white} /><Text style={styles.primaryButtonText}>Encaixe rápido</Text>
        </Pressable>
      </View>

      <View style={[styles.scheduleGrid, compact && styles.scheduleGridStacked]}>
        {MOCK_BARBERS.slice(0, 2).map((professional) => {
          const professionalAppointments = appointments.filter((appointment) => appointment.barberId === professional.id);
          return (
            <View key={professional.id} style={styles.professionalColumn}>
              <View style={styles.professionalHeader}>
                <Text style={styles.professionalName}>{professional.name}</Text>
                <Text style={styles.metaText}>{professional.role}</Text>
              </View>
              <View style={styles.appointmentList}>
                {professionalAppointments.map((appointment) => (
                  <View key={appointment.id} style={styles.appointmentCard}>
                    <View style={styles.appointmentHeader}>
                      <Clock size={12} color={colors.brand} /><Text style={styles.appointmentTime}>{appointment.timeSlot}</Text>
                      <View style={[styles.statusChip, appointment.status === 'pending' && styles.pendingChip]}>
                        {appointment.status === 'completed' ? <CircleCheck size={11} color={colors.success} /> : <UserCheck size={11} color={appointment.status === 'pending' ? colors.warning : colors.success} />}
                        <Text style={[styles.statusText, appointment.status === 'pending' && styles.pendingText]}>{appointment.status === 'pending' ? 'Pendente' : appointment.status === 'completed' ? 'Concluído' : 'Confirmado'}</Text>
                      </View>
                    </View>
                    <Text style={styles.clientName}>{appointment.clientName}</Text>
                    <Text style={styles.metaText}>{appointment.serviceName} · R$ {appointment.price}</Text>
                    {appointment.status !== 'completed' && (
                      <Pressable onPress={() => advanceStatus(appointment)} style={styles.statusButton}>
                        <Text style={styles.statusButtonText}>{appointment.status === 'pending' ? 'Confirmar' : 'Concluir'}</Text>
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { padding: 22, gap: 18, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surface, boxShadow: '0 2px 8px rgba(20,33,25,0.05)' },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18 },
  headerStacked: { flexDirection: 'column' },
  headerCopy: { flex: 1, gap: 7 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.ink, fontFamily: typography.displaySemiBold, fontSize: 19 },
  subtitle: { color: colors.inkSecondary, fontFamily: typography.body, fontSize: 14, lineHeight: 21 },
  availableBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.successSoft },
  availableBadgeText: { color: colors.success, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 0.5 },
  inputRow: { flexDirection: 'row', gap: 10 },
  inputRowStacked: { flexDirection: 'column' },
  input: { flex: 1, minHeight: 46, paddingHorizontal: 14, color: colors.ink, fontFamily: typography.body, fontSize: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surfaceSoft, outlineStyle: 'none' } as never,
  primaryButton: { minHeight: 46, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: radii.md, backgroundColor: colors.brand },
  primaryButtonText: { color: colors.white, fontFamily: typography.bodySemiBold, fontSize: 13 },
  pressed: { opacity: 0.82 },
  scheduleGrid: { flexDirection: 'row', gap: 12 },
  scheduleGridStacked: { flexDirection: 'column' },
  professionalColumn: { flex: 1, minWidth: 0, padding: 12, gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surfaceSoft },
  professionalHeader: { paddingBottom: 9, gap: 2, borderBottomWidth: 1, borderBottomColor: colors.border },
  professionalName: { color: colors.brand, fontFamily: typography.bodySemiBold, fontSize: 14 },
  metaText: { color: colors.inkMuted, fontFamily: typography.body, fontSize: 12, lineHeight: 17 },
  appointmentList: { gap: 8 },
  appointmentCard: { padding: 11, gap: 5, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, backgroundColor: colors.surface },
  appointmentHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  appointmentTime: { color: colors.ink, fontFamily: typography.bodySemiBold, fontSize: 12 },
  statusChip: { marginLeft: 'auto', paddingHorizontal: 7, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radii.pill, backgroundColor: colors.successSoft },
  pendingChip: { backgroundColor: colors.warningSoft },
  statusText: { color: colors.success, fontFamily: typography.bodySemiBold, fontSize: 11 },
  pendingText: { color: colors.warning },
  clientName: { color: colors.ink, fontFamily: typography.bodySemiBold, fontSize: 13 },
  statusButton: { minHeight: 40, marginTop: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, backgroundColor: colors.surfaceSoft },
  statusButtonText: { color: colors.brand, fontFamily: typography.bodySemiBold, fontSize: 11 },
});
