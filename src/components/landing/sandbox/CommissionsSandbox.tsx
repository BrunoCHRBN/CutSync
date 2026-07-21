import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DollarSign, Percent, Wallet, Building } from 'lucide-react-native';
import { colors, radii, typography } from '../../../theme/tokens';

export const CommissionsSandbox = () => {
  const [commissionRate, setCommissionRate] = useState(50); // percentage to professional
  const totalRevenueMock = 12500; // R$ 12.500 faturamento mensal médio

  const proPayout = (totalRevenueMock * commissionRate) / 100;
  const salonRetention = totalRevenueMock - proPayout;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <DollarSign size={18} color="#113939" />
          <Text style={styles.headerTitle}>Divisão de Comissões & Repasse Automatizado</Text>
        </View>
        <View style={styles.liveBadge}>
          <Percent size={12} color="#113939" />
          <Text style={styles.liveBadgeText}>SIMULADOR REAL</Text>
        </View>
      </View>

      <Text style={styles.subtitle}>
        Arraste a porcentagem de comissão para ver o cálculo automático em tempo real de retenção do salão e repasse aos profissionais.
      </Text>

      {/* Slider / Range Buttons */}
      <View style={styles.controlBox}>
        <View style={styles.labelRow}>
          <Text style={styles.controlLabel}>Porcentagem de Comissão do Colaborador:</Text>
          <Text style={styles.controlValue}>{commissionRate}%</Text>
        </View>

        <View style={styles.rangeRow}>
          {[20, 30, 40, 50, 60, 70, 80].map((rate) => (
            <Pressable
              key={rate}
              onPress={() => setCommissionRate(rate)}
              style={[styles.rateChip, commissionRate === rate && styles.rateChipActive]}
            >
              <Text style={[styles.rateChipText, commissionRate === rate && styles.rateChipTextActive]}>
                {rate}%
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Live Calculation Cards */}
      <View style={styles.metricsGrid}>
        <View style={styles.metricCard}>
          <View style={styles.iconCirclePro}>
            <Wallet size={16} color="#3F7A4C" />
          </View>
          <Text style={styles.metricLabel}>Repasse aos Profissionais ({commissionRate}%)</Text>
          <Text style={styles.metricValuePro}>R$ {proPayout.toLocaleString('pt-BR')}</Text>
          <Text style={styles.metricSub}>Pagamento direto via Pix liberado pelo Admin</Text>
        </View>

        <View style={styles.metricCard}>
          <View style={styles.iconCircleSalon}>
            <Building size={16} color="#113939" />
          </View>
          <Text style={styles.metricLabel}>Retenção da Casa ({100 - commissionRate}%)</Text>
          <Text style={styles.metricValueSalon}>R$ {salonRetention.toLocaleString('pt-BR')}</Text>
          <Text style={styles.metricSub}>Líquido retido para custos operacionais</Text>
        </View>
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
    gap: 4,
    backgroundColor: '#F0ECE0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  liveBadgeText: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: '#113939',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  controlBox: {
    backgroundColor: '#F8F9FA',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#E4E5DF',
    padding: 14,
    gap: 10,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  controlLabel: {
    fontSize: 12,
    fontFamily: typography.bodyStrong,
    color: '#1A1A1E',
  },
  controlValue: {
    fontSize: 14,
    fontFamily: typography.display,
    color: '#113939',
  },
  rangeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  rateChip: {
    flex: 1,
    height: 34,
    borderRadius: radii.sm,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E5DF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateChipActive: {
    backgroundColor: '#113939',
    borderColor: '#113939',
  },
  rateChipText: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: '#1A1A1E',
  },
  rateChipTextActive: {
    color: '#FFFFFF',
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#E4E5DF',
    padding: 14,
    gap: 6,
  },
  iconCirclePro: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: '#E9F2EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleSalon: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: '#F0ECE0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricLabel: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: colors.textSecondary,
    marginTop: 2,
  },
  metricValuePro: {
    fontSize: 18,
    fontFamily: typography.display,
    color: '#3F7A4C',
  },
  metricValueSalon: {
    fontSize: 18,
    fontFamily: typography.display,
    color: '#113939',
  },
  metricSub: {
    fontSize: 11,
    fontFamily: typography.body,
    color: colors.textMuted,
  },
});
