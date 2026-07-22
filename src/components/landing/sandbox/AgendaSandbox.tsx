import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Calendar, Plus, UserCheck, Clock } from 'lucide-react-native';
import { landingColors as colors, landingRadii as radii, landingTypography } from '../../../theme/landing-tokens';
import { INITIAL_MOCK_APPOINTMENTS, MOCK_BARBERS, MockAppointment } from './mockData';

const typography = { display: landingTypography.displaySemiBold, body: landingTypography.body, bodyStrong: landingTypography.bodySemiBold };

export const AgendaSandbox = () => {
  const [appointments, setAppointments] = useState<MockAppointment[]>(INITIAL_MOCK_APPOINTMENTS);
  const [clientInputName, setClientInputName] = useState('');
  const [selectedBarberId] = useState('b1');
  const [selectedTimeSlot] = useState('11:30');

  const handleAddQuickFitting = () => {
    if (!clientInputName.trim()) return;

    const newAppointment: MockAppointment = {
      id: `a-${Date.now()}`,
      clientName: clientInputName.trim(),
      serviceName: 'Encaixe Rápido / Balcão',
      timeSlot: selectedTimeSlot,
      barberId: selectedBarberId,
      status: 'confirmed',
      price: 50,
    };

    setAppointments((prev) => [newAppointment, ...prev]);
    setClientInputName('');
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Calendar size={18} color="#113939" />
          <Text style={styles.headerTitle}>Agenda de Balcão & Encaixe Rápido</Text>
        </View>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveBadgeText}>COMPONENTE AO VIVO</Text>
        </View>
      </View>

      <Text style={styles.subtitle}>
        Simule o lançamento de um cliente sem agendamento prévio. Digite o nome e clique em Encaixe Rápido.
      </Text>

      {/* Quick Input Bar */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Nome do cliente (ex: João Araraquara)"
          placeholderTextColor={colors.textMuted}
          value={clientInputName}
          onChangeText={setClientInputName}
        />
        <Pressable 
          style={({ pressed }) => [styles.fitBtn, pressed && styles.btnPressed]} 
          onPress={handleAddQuickFitting}
        >
          <Plus size={16} color="#FFFFFF" />
          <Text style={styles.fitBtnText}>+ Encaixe Rápido</Text>
        </Pressable>
      </View>

      {/* Schedule Column Grid */}
      <View style={styles.scheduleGrid}>
        {MOCK_BARBERS.slice(0, 2).map((barber) => {
          const barberAppts = appointments.filter((a) => a.barberId === barber.id);
          return (
            <View key={barber.id} style={styles.barberCol}>
              <View style={styles.barberHeader}>
                <Text style={styles.barberName}>{barber.name}</Text>
                <Text style={styles.barberRole}>{barber.role}</Text>
              </View>

              <View style={styles.slotsList}>
                {barberAppts.map((appt) => (
                  <View key={appt.id} style={styles.apptCard}>
                    <View style={styles.apptTimeRow}>
                      <Clock size={12} color="#113939" />
                      <Text style={styles.apptTime}>{appt.timeSlot}</Text>
                      <View style={styles.statusChip}>
                        <UserCheck size={10} color="#3F7A4C" />
                        <Text style={styles.statusChipText}>Confirmado</Text>
                      </View>
                    </View>
                    <Text style={styles.apptClient}>{appt.clientName}</Text>
                    <Text style={styles.apptService}>{appt.serviceName} • R$ {appt.price}</Text>
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
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#E4E5DF',
    padding: 20,
    gap: 14,
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: typography.display,
    color: '#1A1A1E',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(63,122,76,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3F7A4C',
  },
  liveBadgeText: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: '#3F7A4C',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    flex: 1,
    height: 42,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E4E5DF',
    borderRadius: radii.md,
    paddingHorizontal: 14,
    fontSize: 13,
    fontFamily: typography.body,
    color: '#1A1A1E',
  },
  fitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#113939',
    paddingHorizontal: 16,
    borderRadius: radii.md,
    height: 42,
  },
  btnPressed: {
    opacity: 0.85,
  },
  fitBtnText: {
    fontSize: 12,
    fontFamily: typography.bodyStrong,
    color: '#FFFFFF',
  },
  scheduleGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  barberCol: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#E4E5DF',
    padding: 12,
    gap: 10,
  },
  barberHeader: {
    borderBottomWidth: 1,
    borderBottomColor: '#E4E5DF',
    paddingBottom: 8,
  },
  barberName: {
    fontSize: 13,
    fontFamily: typography.bodyStrong,
    color: '#113939',
  },
  barberRole: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.body,
  },
  slotsList: {
    gap: 8,
  },
  apptCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E5DF',
    borderRadius: radii.sm,
    padding: 10,
    gap: 4,
  },
  apptTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  apptTime: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: '#1A1A1E',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
    backgroundColor: '#E9F2EA',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusChipText: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: '#3F7A4C',
  },
  apptClient: {
    fontSize: 12,
    fontFamily: typography.bodyStrong,
    color: '#1A1A1E',
  },
  apptService: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
});
