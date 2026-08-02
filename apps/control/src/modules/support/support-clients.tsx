import { Link } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CLOUD_ROUTES } from '@/navigation/cloud-routes';
import { cloudTheme } from '@/theme/cloud-components';

/**
 * Future client projection table (not mocked):
 * columns — cliente · atendimentos · abertos · risco SLA · última interação
 * source — aggregated from authorized SupportTicketSummary rows when RPC/projection exists.
 */
export function SupportClientsScreen() {
  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.kicker}>SUPORTE / CLIENTES</Text>
        <Text style={styles.title}>Visão consolidada de clientes</Text>
        <Text style={styles.lead}>
          Esta superfície está em preparação. Não há projeção agregada nesta sessão.
        </Text>
      </View>

      <View style={styles.defList}>
        <View style={styles.defRow}>
          <Text style={styles.defLabel}>Estado do módulo</Text>
          <Text style={styles.defValue}>Em preparação</Text>
        </View>
        <View style={styles.defRow}>
          <Text style={styles.defLabel}>Fonte atual</Text>
          <Text style={styles.defValue}>Chamados autorizados</Text>
        </View>
        <View style={styles.defRow}>
          <Text style={styles.defLabel}>Dados simulados</Text>
          <Text style={styles.defValue}>Não utilizados</Text>
        </View>
        <View style={styles.defRow}>
          <Text style={styles.defLabel}>Acesso disponível</Text>
          <Text style={styles.defValue}>Pela fila de atendimentos</Text>
        </View>
      </View>

      <Link href={CLOUD_ROUTES.suporte.atendimentos} asChild>
        <Pressable
          accessibilityRole="link"
          style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
        >
          <Text style={styles.ctaText}>Ir para atendimentos</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: cloudTheme.layout.contentMax,
    alignSelf: 'center',
    gap: 20,
    padding: cloudTheme.layout.contentPadding,
  },
  header: { gap: 6 },
  kicker: {
    color: cloudTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: { color: cloudTheme.colors.text, fontSize: 26, fontWeight: '800' },
  lead: { color: cloudTheme.colors.textSecondary, fontSize: 14, lineHeight: 20, maxWidth: 640 },
  defList: {
    borderTopWidth: 1,
    borderTopColor: cloudTheme.colors.border,
    backgroundColor: cloudTheme.colors.surface,
  },
  defRow: {
    flexDirection: 'row',
    gap: 16,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
  },
  defLabel: { width: 180, color: cloudTheme.colors.textMuted, fontSize: 12, fontWeight: '700' },
  defValue: { flex: 1, color: cloudTheme.colors.text, fontSize: 14, fontWeight: '700' },
  cta: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: cloudTheme.colors.brand,
  },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  pressed: { opacity: 0.88 },
});
