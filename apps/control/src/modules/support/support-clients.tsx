import { Link } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CLOUD_ROUTES } from '@/navigation/cloud-routes';
import { cloudTheme } from '@/theme/cloud-components';

/**
 * Future client projection table (not mocked):
 * columns — cliente · localização · chamados abertos · último contato · risco SLA
 * source — aggregated from authorized SupportTicketSummary rows when RPC/projection exists.
 */
export function SupportClientsScreen() {
  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.kicker}>SUPORTE / CLIENTES</Text>
        <Text style={styles.title}>Clientes</Text>
        <Text style={styles.lead}>
          Escopo limitado aos chamados autorizados da equipe. A listagem agregada permanece em preparação.
        </Text>
      </View>

      <View style={styles.strip}>
        <Text style={styles.stripLabel}>Estado</Text>
        <Text style={styles.stripValue}>Em preparação</Text>
        <View style={styles.divider} />
        <Text style={styles.stripLabel}>Fonte</Text>
        <Text style={styles.stripValue}>Chamados autorizados da fila</Text>
      </View>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Consultar atendimentos</Text>
        <Text style={styles.muted}>
          Até a projeção de clientes existir, use a fila operacional para localizar solicitantes e contexto.
        </Text>
        <Link href={CLOUD_ROUTES.suporte.atendimentos} asChild>
          <Pressable
            accessibilityRole="link"
            style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
          >
            <Text style={styles.ctaText}>Abrir atendimentos</Text>
          </Pressable>
        </Link>
      </View>

      <View style={styles.tableShell} accessibilityLabel="Tabela de clientes (em preparação)">
        <View style={styles.tableHead}>
          <Text style={[styles.headCell, styles.colClient]}>Cliente</Text>
          <Text style={[styles.headCell, styles.colMeta]}>Localização</Text>
          <Text style={[styles.headCell, styles.colMeta]}>Chamados</Text>
          <Text style={[styles.headCell, styles.colMeta]}>Último contato</Text>
        </View>
        <View style={styles.emptyRow}>
          <Text style={styles.muted}>Nenhuma projeção de clientes disponível nesta sessão.</Text>
        </View>
      </View>
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
  strip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: 6,
    backgroundColor: cloudTheme.colors.surface,
  },
  stripLabel: { color: cloudTheme.colors.textMuted, fontSize: 11, fontWeight: '700' },
  stripValue: { color: cloudTheme.colors.text, fontSize: 13, fontWeight: '700' },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: cloudTheme.colors.border, marginHorizontal: 4 },
  block: {
    gap: 8,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: cloudTheme.colors.border,
  },
  blockTitle: { color: cloudTheme.colors.text, fontSize: 16, fontWeight: '800' },
  muted: { color: cloudTheme.colors.textSecondary, fontSize: 13, lineHeight: 19 },
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
  tableShell: {
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: cloudTheme.colors.surface,
  },
  tableHead: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
    backgroundColor: cloudTheme.colors.canvas,
  },
  headCell: { color: cloudTheme.colors.textMuted, fontSize: 11, fontWeight: '800' },
  colClient: { flex: 1.4, minWidth: 140 },
  colMeta: { flex: 1, minWidth: 100 },
  emptyRow: { padding: 16 },
});
