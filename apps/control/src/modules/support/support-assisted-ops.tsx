import { Link, useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useControlAuth } from '@/contexts/control-auth-context';
import { resolveCloudActionAvailability } from '@/features/cloud/cloud-action-availability';
import { CLOUD_ROUTES } from '@/navigation/cloud-routes';
import {
  ControlSupportError,
  getControlSupportOverview,
  type SupportCapabilities,
} from '@/services/control-support';
import { cloudTheme } from '@/theme/cloud-components';

type CatalogRow = {
  operation: string;
  availability: string;
  permission: string;
  where: string;
};

export function SupportAssistedOpsScreen() {
  const { can } = useControlAuth();
  const [capabilities, setCapabilities] = useState<SupportCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const result = await getControlSupportOverview({
        status: null,
        priority: null,
        category: null,
        limit: 1,
      });
      if (id === requestId.current) setCapabilities(result.capabilities);
    } catch (loadError) {
      if (id === requestId.current) {
        setCapabilities(null);
        setError(
          loadError instanceof ControlSupportError
            ? 'Não foi possível carregar a disponibilidade do suporte.'
            : 'Não foi possível carregar o catálogo assistido.',
        );
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    if (can('control.support.manage')) void load();
    return () => { requestId.current += 1; };
  }, [can, load]));

  const createTicket = resolveCloudActionAvailability({
    action: 'create_support_ticket',
    can,
    allowNewTickets: capabilities?.allowNewTickets ?? false,
  });

  const rows: CatalogRow[] = [
    {
      operation: 'Novo atendimento',
      availability: createTicket.enabled
        ? 'Disponível (homologação UI)'
        : (createTicket.reason ?? 'Indisponível'),
      permission: 'control.support.manage + flag allowNewTickets',
      where: 'Atendimentos · cabeçalho',
    },
    {
      operation: 'Reprocessar sincronização',
      availability: capabilities?.syncEnabled === false
        ? 'Sync pausada no runtime'
        : 'Disponível no detalhe',
      permission: 'control.support.manage',
      where: 'Atendimentos · detalhe do chamado',
    },
    {
      operation: 'Escalar L1–L3',
      availability: 'Disponível no detalhe',
      permission: 'control.support.manage',
      where: 'Atendimentos · detalhe do chamado',
    },
    {
      operation: 'Ações em lote',
      availability: 'Bloqueado até RPC homologada',
      permission: 'control.support.manage',
      where: 'Atendimentos · seleção na tabela',
    },
    {
      operation: 'Configurar runtime JSM',
      availability: 'Owner · painel inline em Atendimentos',
      permission: 'control.support.manage + SaaS_Owner',
      where: 'Atendimentos · faixa de contexto',
    },
  ];

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.kicker}>SUPORTE / OPERAÇÕES ASSISTIDAS</Text>
        <Text style={styles.title}>Catálogo de operações</Text>
        <Text style={styles.lead}>
          Disponibilidade reflete permissões e feature flags reais. Execução ocorre no detalhe ou na fila, conforme a linha.
        </Text>
      </View>

      {loading && !capabilities ? (
        <View style={styles.loading}>
          <ActivityIndicator color={cloudTheme.colors.brand} />
          <Text style={styles.muted}>Carregando disponibilidade...</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {capabilities ? (
        <View style={styles.strip}>
          <Text style={styles.stripItem}>
            Módulo {capabilities.enabled ? 'ativo' : 'pausado'}
          </Text>
          <View style={styles.divider} />
          <Text style={styles.stripItem}>
            Novos {capabilities.allowNewTickets ? 'liberados' : 'bloqueados'}
          </Text>
          <View style={styles.divider} />
          <Text style={styles.stripItem}>
            Sync {capabilities.syncEnabled ? 'ativa' : 'pausada'}
          </Text>
        </View>
      ) : null}

      <View style={styles.table}>
        <View style={styles.tableHead}>
          <Text style={[styles.headCell, styles.colOp]}>Operação</Text>
          <Text style={[styles.headCell, styles.colAvail]}>Disponibilidade</Text>
          <Text style={[styles.headCell, styles.colPerm]}>Permissão</Text>
          <Text style={[styles.headCell, styles.colWhere]}>Onde executar</Text>
        </View>
        {rows.map((row) => (
          <View key={row.operation} style={styles.row}>
            <Text style={[styles.cellStrong, styles.colOp]}>{row.operation}</Text>
            <Text style={[styles.cell, styles.colAvail]}>{row.availability}</Text>
            <Text style={[styles.cell, styles.colPerm]}>{row.permission}</Text>
            <Text style={[styles.cell, styles.colWhere]}>{row.where}</Text>
          </View>
        ))}
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
    maxWidth: 1100,
    alignSelf: 'center',
    gap: 18,
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
  lead: { color: cloudTheme.colors.textSecondary, fontSize: 14, lineHeight: 20, maxWidth: 680 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  muted: { color: cloudTheme.colors.textSecondary, fontSize: 13 },
  error: { color: cloudTheme.colors.danger, fontSize: 13 },
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
  stripItem: { color: cloudTheme.colors.text, fontSize: 13, fontWeight: '700' },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: cloudTheme.colors.border },
  table: {
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
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
    minHeight: 44,
  },
  cell: { color: cloudTheme.colors.textSecondary, fontSize: 12, lineHeight: 17 },
  cellStrong: { color: cloudTheme.colors.text, fontSize: 13, fontWeight: '700' },
  colOp: { flex: 1.2, minWidth: 140 },
  colAvail: { flex: 1.3, minWidth: 160 },
  colPerm: { flex: 1.2, minWidth: 150 },
  colWhere: { flex: 1.2, minWidth: 140 },
  cta: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: cloudTheme.colors.brand,
    backgroundColor: cloudTheme.colors.surface,
  },
  ctaText: { color: cloudTheme.colors.brand, fontWeight: '800', fontSize: 13 },
  pressed: { opacity: 0.88 },
});
