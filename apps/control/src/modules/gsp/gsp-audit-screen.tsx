import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { DataTable } from '@/components/cloud/data-table';
import { FeedbackState } from '@/components/cloud/feedback-state';
import { PageHeader } from '@/components/cloud/page-header';
import { StatusBadge } from '@/components/cloud/status-badge';
import { ControlButton, ControlCard, ControlField } from '@/components/control-ui';
import { useControlAuth } from '@/contexts/control-auth-context';
import {
  formatAuditChangeSummary,
  formatDateTime,
  inferAuditResult,
  labelForAuditAction,
  labelForAuditResult,
  maskIdentifier,
  maskIp,
  resolveActorIdentity,
  toneForAuditResult,
} from '@/modules/gsp/presentation';
import {
  ControlGovernanceAuditError,
  getControlGovernanceAuditErrorMessage,
  listControlGovernanceAuditEvents,
  type ControlGovernanceAuditEvent,
} from '@/services/control-governance-audit';
import { cloudTheme } from '@/theme/cloud-components';

const PAGE_SIZE = 40;

type PeriodFilter = 'all' | '7d' | '30d' | '90d';

function periodBounds(period: PeriodFilter): { dateFrom: string | null; dateTo: string | null } {
  if (period === 'all') return { dateFrom: null, dateTo: null };
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return { dateFrom: from.toISOString(), dateTo: null };
}

export function GspAuditScreen() {
  const { can } = useControlAuth();
  const canRead = can('control.governance.read');
  const { width } = useWindowDimensions();
  const compact = width < 900;

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [period, setPeriod] = useState<PeriodFilter>('30d');
  const [actionFilter, setActionFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const [events, setEvents] = useState<ControlGovernanceAuditEvent[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [selected, setSelected] = useState<ControlGovernanceAuditEvent | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canRead) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const bounds = periodBounds(period);
      const rows = await listControlGovernanceAuditEvents({
        searchTerm: appliedSearch.trim() || null,
        action: actionFilter.trim() || null,
        dateFrom: bounds.dateFrom,
        dateTo: bounds.dateTo,
        pageSize: PAGE_SIZE,
        pageOffset: offset,
      });
      setEvents(rows);
      setTotalCount(rows[0]?.totalCount ?? rows.length);
    } catch (err) {
      setEvents([]);
      setTotalCount(0);
      setError(getControlGovernanceAuditErrorMessage(err));
      setForbidden(err instanceof ControlGovernanceAuditError && err.code === 'forbidden');
    } finally {
      setLoading(false);
    }
  }, [actionFilter, appliedSearch, canRead, offset, period]);

  useEffect(() => {
    void load();
  }, [load]);

  const actionOptions = useMemo(() => {
    const unique = new Set(events.map((event) => event.action).filter(Boolean));
    return Array.from(unique).sort();
  }, [events]);

  const columns = useMemo(
    () => [
      {
        key: 'actor',
        header: 'Ator',
        render: (row: ControlGovernanceAuditEvent) => resolveActorIdentity(row.actorName).primary,
      },
      {
        key: 'action',
        header: 'Ação',
        render: (row: ControlGovernanceAuditEvent) => labelForAuditAction(row.action),
      },
      {
        key: 'target',
        header: 'Alvo',
        render: (row: ControlGovernanceAuditEvent) => row.targetName || '—',
      },
      {
        key: 'at',
        header: 'Data/hora',
        render: (row: ControlGovernanceAuditEvent) => formatDateTime(row.createdAt) ?? '—',
      },
      {
        key: 'result',
        header: 'Resultado',
        render: (row: ControlGovernanceAuditEvent) => {
          const result = inferAuditResult(row.action, row.changes);
          return <StatusBadge label={labelForAuditResult(result)} tone={toneForAuditResult(result)} />;
        },
      },
      {
        key: 'origin',
        header: 'Origem',
        render: (row: ControlGovernanceAuditEvent) => maskIp(row.clientIp) ?? '—',
      },
      {
        key: 'view',
        header: 'Detalhe',
        render: (row: ControlGovernanceAuditEvent) => (
          <Pressable onPress={() => setSelected(row)}>
            <Text style={styles.link}>Ver evento</Text>
          </Pressable>
        ),
      },
    ],
    [],
  );

  const pageLabel = totalCount > 0
    ? `${Math.min(offset + 1, totalCount)}–${Math.min(offset + events.length, totalCount)} de ${totalCount}`
    : '0 eventos';

  const changeSummary = selected ? formatAuditChangeSummary(selected.changes) : null;

  return (
    <View style={styles.page}>
      <PageHeader
        eyebrow="GSP · AUDITORIA"
        title="Auditoria"
        description="Trilha de eventos sensíveis com ator, ação, alvo e origem quando disponível."
        actions={(
          <ControlButton
            label="Exportar"
            variant="secondary"
            disabled
            onPress={() => undefined}
          />
        )}
      />

      <ControlCard style={styles.filters}>
        <View style={styles.filterRow}>
          <View style={styles.searchWrap}>
            <ControlField
              label="Busca"
              value={search}
              onChangeText={setSearch}
              placeholder="Ação ou alvo"
              placeholderTextColor={cloudTheme.colors.textMuted}
              onSubmitEditing={() => {
                setOffset(0);
                setAppliedSearch(search);
              }}
            />
          </View>
          <View style={styles.periodWrap}>
            <Text style={styles.filterLabel}>Período</Text>
            <View style={styles.chips}>
              {([
                ['7d', '7 dias'],
                ['30d', '30 dias'],
                ['90d', '90 dias'],
                ['all', 'Tudo'],
              ] as const).map(([value, label]) => (
                <Pressable
                  key={value}
                  onPress={() => {
                    setPeriod(value);
                    setOffset(0);
                  }}
                  style={[styles.chip, period === value && styles.chipActive]}
                >
                  <Text style={[styles.chipText, period === value && styles.chipTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
        <View style={styles.filterActions}>
          <ControlButton
            label="Aplicar busca"
            onPress={() => {
              setOffset(0);
              setAppliedSearch(search);
            }}
          />
          <ControlButton
            label="Limpar"
            variant="secondary"
            onPress={() => {
              setSearch('');
              setAppliedSearch('');
              setActionFilter('');
              setPeriod('30d');
              setOffset(0);
            }}
          />
          <Text style={styles.meta}>{pageLabel}</Text>
          <Text style={styles.metaMuted}>Exportação desabilitada — sem backend de export.</Text>
        </View>
        {actionOptions.length > 0 ? (
          <View style={styles.chips}>
            <Pressable
              onPress={() => {
                setActionFilter('');
                setOffset(0);
              }}
              style={[styles.chip, !actionFilter && styles.chipActive]}
            >
              <Text style={[styles.chipText, !actionFilter && styles.chipTextActive]}>Todas as ações</Text>
            </Pressable>
            {actionOptions.map((action) => (
              <Pressable
                key={action}
                onPress={() => {
                  setActionFilter(action);
                  setOffset(0);
                }}
                style={[styles.chip, actionFilter === action && styles.chipActive]}
              >
                <Text style={[styles.chipText, actionFilter === action && styles.chipTextActive]}>
                  {labelForAuditAction(action)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ControlCard>

      {loading ? (
        <FeedbackState kind="partial" title="Carregando auditoria" message="Consultando list_governance_audit_events." />
      ) : forbidden ? (
        <FeedbackState
          kind="error"
          title="Sem permissão"
          message={error ?? 'É necessário control.governance.read (usuário de governança).'}
          actionLabel="Tentar novamente"
          onAction={() => { void load(); }}
        />
      ) : error ? (
        <FeedbackState
          kind="error"
          title="Auditoria indisponível"
          message={error}
          actionLabel="Tentar novamente"
          onAction={() => { void load(); }}
        />
      ) : events.length === 0 ? (
        <FeedbackState
          kind="empty"
          title="Nenhum evento no recorte"
          message="A fonte está conectada. Ajuste busca ou período, ou aguarde novos eventos reais."
        />
      ) : (
        <View style={styles.tableWrap}>
          <DataTable
            columns={columns}
            rows={events}
            rowKey={(row) => String(row.id)}
            emptyLabel="Nenhum evento de auditoria disponível nesta sessão."
          />
          <View style={styles.pager}>
            <ControlButton
              label="Anterior"
              variant="secondary"
              disabled={offset <= 0 || loading}
              onPress={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
            />
            <ControlButton
              label="Próxima"
              variant="secondary"
              disabled={offset + events.length >= totalCount || loading}
              onPress={() => setOffset((value) => value + PAGE_SIZE)}
            />
          </View>
        </View>
      )}

      <Modal visible={Boolean(selected)} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSelected(null)}>
          <Pressable style={[styles.drawer, compact && styles.drawerFull]} onPress={(event) => event.stopPropagation?.()}>
            <ScrollView contentContainerStyle={styles.drawerBody}>
              <View style={styles.drawerHead}>
                <Text style={styles.drawerTitle}>Detalhe do evento</Text>
                <Pressable onPress={() => setSelected(null)}>
                  <Text style={styles.link}>Fechar</Text>
                </Pressable>
              </View>
              {selected ? (
                <>
                  <Def label="Ação" value={labelForAuditAction(selected.action)} />
                  <Def label="Ação técnica" value={selected.action} />
                  <Def label="Ator" value={resolveActorIdentity(selected.actorName).primary} />
                  <Def label="Alvo" value={selected.targetName || '—'} />
                  <Def label="Tipo do alvo" value={selected.targetType || '—'} />
                  <Def label="ID do alvo" value={maskIdentifier(selected.targetId) ?? '—'} />
                  <Def label="Quando" value={formatDateTime(selected.createdAt) ?? '—'} />
                  <Def label="IP" value={maskIp(selected.clientIp) ?? 'Não informado'} />
                  <Def
                    label="Resultado"
                    value={labelForAuditResult(inferAuditResult(selected.action, selected.changes))}
                  />
                  <Def label="Antes" value={changeSummary?.before ?? '—'} />
                  <Def label="Depois" value={changeSummary?.after ?? '—'} />
                  <View style={styles.copyRow}>
                    <Text style={styles.defLabel}>ID do evento</Text>
                    <Pressable
                      onPress={() => {
                        const value = String(selected.id);
                        const clipboard = (globalThis as { navigator?: { clipboard?: { writeText?: (v: string) => Promise<void> } } }).navigator?.clipboard;
                        if (clipboard?.writeText) {
                          void clipboard.writeText(value).then(() => setCopied(value));
                        } else {
                          setCopied(value);
                        }
                      }}
                    >
                      <Text style={styles.link}>{copied === String(selected.id) ? 'Copiado' : String(selected.id)}</Text>
                    </Pressable>
                  </View>
                  {selected.changes ? (
                    <View style={styles.changesBlock}>
                      <Text style={styles.defLabel}>Alterações (JSON)</Text>
                      <Text style={styles.changesJson} selectable>
                        {JSON.stringify(selected.changes, null, 2)}
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Def({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.defRow}>
      <Text style={styles.defLabel}>{label}</Text>
      <Text style={styles.defValue} selectable>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: cloudTheme.layout.contentMax,
    alignSelf: 'center',
    gap: cloudTheme.spacing.xl,
    padding: cloudTheme.layout.contentPadding,
  },
  filters: { gap: cloudTheme.spacing.md },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: cloudTheme.spacing.md,
  },
  searchWrap: { flexGrow: 1, flexBasis: 220, minWidth: 200 },
  periodWrap: { flexGrow: 1, flexBasis: 280, gap: cloudTheme.spacing.xs },
  filterLabel: { ...cloudTheme.type.caption, color: cloudTheme.colors.textMuted, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: cloudTheme.spacing.xs },
  chip: {
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: cloudTheme.radii.sm,
    paddingHorizontal: cloudTheme.spacing.sm,
    paddingVertical: cloudTheme.spacing.xs,
    backgroundColor: cloudTheme.colors.surfaceMuted,
  },
  chipActive: {
    borderColor: cloudTheme.colors.accent,
    backgroundColor: cloudTheme.colors.accentBlueSoft,
  },
  chipText: { ...cloudTheme.type.small, color: cloudTheme.colors.textSecondary },
  chipTextActive: { ...cloudTheme.type.smallStrong, color: cloudTheme.colors.text },
  filterActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: cloudTheme.spacing.sm,
  },
  meta: { ...cloudTheme.type.smallStrong, color: cloudTheme.colors.text },
  metaMuted: { ...cloudTheme.type.small, color: cloudTheme.colors.textMuted },
  tableWrap: { gap: cloudTheme.spacing.md },
  pager: { flexDirection: 'row', gap: cloudTheme.spacing.sm },
  link: { ...cloudTheme.type.smallStrong, color: cloudTheme.colors.accent },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 20, 0.45)',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  drawer: {
    width: 420,
    maxWidth: '100%',
    height: '100%',
    backgroundColor: cloudTheme.colors.surface,
    borderLeftWidth: 1,
    borderLeftColor: cloudTheme.colors.border,
  },
  drawerFull: { width: '100%' },
  drawerBody: { padding: cloudTheme.spacing.xl, gap: cloudTheme.spacing.sm },
  drawerHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: cloudTheme.spacing.sm,
  },
  drawerTitle: { ...cloudTheme.type.sectionTitle, color: cloudTheme.colors.text },
  defRow: { gap: 2, paddingVertical: cloudTheme.spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: cloudTheme.colors.border },
  defLabel: { ...cloudTheme.type.caption, color: cloudTheme.colors.textMuted, textTransform: 'uppercase' },
  defValue: { ...cloudTheme.type.body, color: cloudTheme.colors.text },
  copyRow: { gap: 4, paddingVertical: cloudTheme.spacing.xs },
  changesBlock: { gap: cloudTheme.spacing.xs, marginTop: cloudTheme.spacing.sm },
  changesJson: {
    ...cloudTheme.type.small,
    color: cloudTheme.colors.textSecondary,
    fontFamily: 'monospace',
  },
});
