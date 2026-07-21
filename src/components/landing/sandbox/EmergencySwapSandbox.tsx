import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AlertTriangle, ArrowRight, CheckCircle2, RefreshCw, UserX } from 'lucide-react-native';
import { colors, radii, typography } from '../../../theme/tokens';

export const EmergencySwapSandbox = () => {
  const [reallocated, setReallocated] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleReallocate = () => {
    setLoading(true);
    setTimeout(() => {
      setReallocated(true);
      setLoading(false);
    }, 400);
  };

  const handleReset = () => {
    setReallocated(false);
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <AlertTriangle size={18} color="#B66A13" />
          <Text style={styles.headerTitle}>Contingência de Ausência & Realocação</Text>
        </View>
        <View style={styles.alertBadge}>
          <Text style={styles.alertBadgeText}>AUTOMAÇÃO DE EMERGÊNCIA</Text>
        </View>
      </View>

      <Text style={styles.subtitle}>
        Simulação em tempo real: Quando um profissional falta, o CutSync identifica colaboradores livres no mesmo horário e sugere a realocação sem cancelar o cliente.
      </Text>

      {/* Incident Box */}
      <View style={[styles.incidentBox, reallocated && styles.incidentBoxSuccess]}>
        {!reallocated ? (
          <>
            <View style={styles.incidentTop}>
              <View style={styles.absentIconCircle}>
                <UserX size={16} color="#B84A4A" />
              </View>
              <View style={styles.incidentCopy}>
                <Text style={styles.incidentTitle}>Ausência Detectada: Lucas Silva</Text>
                <Text style={styles.incidentDesc}>
                  Agendamento afetado: <Text style={styles.boldText}>Ricardo Prado</Text> às <Text style={styles.boldText}>14:00</Text> (Corte & Barba)
                </Text>
              </View>
            </View>

            <View style={styles.suggestionRow}>
              <Text style={styles.suggestionText}>
                Sugestão do Sistema: Transferir para <Text style={styles.suggestionName}>Matheus Rocha</Text> (Disponível no slot 14:00)
              </Text>
              <Pressable
                style={({ pressed }) => [styles.reallocateBtn, pressed && styles.btnPressed]}
                onPress={handleReallocate}
                disabled={loading}
              >
                <ArrowRight size={14} color="#FFFFFF" />
                <Text style={styles.reallocateBtnText}>
                  {loading ? 'Realocando...' : 'Realocar Agora'}
                </Text>
              </Pressable>
            </View>
          </>
        ) : (
          <View style={styles.successRow}>
            <CheckCircle2 size={22} color="#3F7A4C" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.successTitle}>Cliente Realocado com Sucesso!</Text>
              <Text style={styles.successDesc}>
                Ricardo Prado (14:00) transferido para a agenda de Matheus Rocha. Notificação enviada ao cliente.
              </Text>
            </View>
            <Pressable onPress={handleReset} style={styles.resetBtn}>
              <RefreshCw size={14} color="#113939" />
              <Text style={styles.resetBtnText}>Testar Novamente</Text>
            </Pressable>
          </View>
        )}
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
  alertBadge: {
    backgroundColor: '#F8EEE1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  alertBadgeText: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: '#B66A13',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  incidentBox: {
    backgroundColor: '#F8EAEA',
    borderWidth: 1,
    borderColor: 'rgba(184,74,74,0.3)',
    borderRadius: radii.md,
    padding: 14,
    gap: 12,
  },
  incidentBoxSuccess: {
    backgroundColor: '#E9F2EA',
    borderColor: 'rgba(63,122,76,0.3)',
  },
  incidentTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  absentIconCircle: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  incidentCopy: {
    flex: 1,
    gap: 2,
  },
  incidentTitle: {
    fontSize: 13,
    fontFamily: typography.bodyStrong,
    color: '#B84A4A',
  },
  incidentDesc: {
    fontSize: 12,
    fontFamily: typography.body,
    color: '#1A1A1E',
  },
  boldText: {
    fontFamily: typography.bodyStrong,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(184,74,74,0.2)',
  },
  suggestionText: {
    fontSize: 11,
    fontFamily: typography.body,
    color: '#1A1A1E',
    flex: 1,
    paddingRight: 10,
  },
  suggestionName: {
    fontFamily: typography.bodyStrong,
    color: '#113939',
  },
  reallocateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#113939',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.sm,
  },
  btnPressed: {
    opacity: 0.85,
  },
  reallocateBtnText: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: '#FFFFFF',
  },
  successRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  successTitle: {
    fontSize: 13,
    fontFamily: typography.bodyStrong,
    color: '#3F7A4C',
  },
  successDesc: {
    fontSize: 11,
    fontFamily: typography.body,
    color: colors.textSecondary,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: '#E4E5DF',
  },
  resetBtnText: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: '#113939',
  },
});
