import type { CorporateCasePriority } from '@cutsync/domain';
import { Link, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DataTable, type DataTableColumn } from '@/components/cloud/data-table';
import { FeedbackState } from '@/components/cloud/feedback-state';
import { FilterTabs, type FilterTab } from '@/components/cloud/filter-tabs';
import { StatusBadge } from '@/components/cloud/status-badge';
import { ControlButton, ControlNotice } from '@/components/control-ui';
import { SectionPage } from '@/components/section-page';
import {
  corporateCasePriorityLabels,
  corporateCasePriorityTone,
  formatCorporateCaseDate,
  formatCorporateCaseDeadline,
} from '@/modules/cases/corporate-cases-presentation';
import { corporateCasePath } from '@/navigation/cloud-routes';
import {
  listCorporateCaseFulfillmentQueue,
  type CorporateCaseFulfillmentAttemptState,
  type CorporateCaseFulfillmentQueueCursor,
  type CorporateCaseFulfillmentQueueItem,
  type CorporateCaseFulfillmentSlaState,
} from '@/services/corporate-cases';
import { cloudTheme } from '@/theme/cloud-components';

type PriorityFilter = CorporateCasePriority | 'all';
type SlaFilter = CorporateCaseFulfillmentSlaState | 'all';
type AttemptFilter = CorporateCaseFulfillmentAttemptState | 'all';

const PAGE_SIZE = 50;

const priorityTabs: FilterTab<PriorityFilter>[] = [
  { id: 'all', label: 'Todas' },
  { id: 'critical', label: 'Crítica' },
  { id: 'high', label: 'Alta' },
  { id: 'normal', label: 'Normal' },
  { id: 'low', label: 'Baixa' },
];

const slaTabs: FilterTab<SlaFilter>[] = [
  { id: 'all', label: 'Todos os prazos' },
  { id: 'overdue', label: 'Vencidos' },
  { id: 'due_soon', label: 'Vencem em até 4h' },
  { id: 'on_track', label: 'No prazo' },
];

const attemptTabs: FilterTab<AttemptFilter>[] = [
  { id: 'all', label: 'Todas as tentativas' },
  { id: 'not_attempted', label: 'Não iniciadas' },
  { id: 'failed', label: 'Com falha' },
  { id: 'deferred', label: 'Devolvidas' },
];

const attemptLabels: Record<CorporateCaseFulfillmentAttemptState, string> = {
  not_attempted: 'Não iniciada',
  failed: 'Falha registrada',
  deferred: 'Devolvida à fila',
};

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Não foi possível consultar a fila de execução.';
}

function QueueCaseLink({ row }: { row: CorporateCaseFulfillmentQueueItem }) {
  return (
    <Link href={corporateCasePath(row.caseId) as never} asChild>
      <Pressable accessibilityRole="link" style={styles.cellStack}>
        <Text selectable style={styles.protocol}>{row.protocol}</Text>
        <Text style={styles.subject} numberOfLines={2}>{row.subject}</Text>
      </Pressable>
    </Link>
  );
}

function DeadlineBadge({ row }: { row: CorporateCaseFulfillmentQueueItem }) {
  if (row.caseExpired) return <StatusBadge label="Chamado expirado" tone="danger" />;
  const deadline = formatCorporateCaseDeadline(row.taskDueAt);
  return <StatusBadge label={deadline.label} tone={deadline.tone} />;
}

function AttemptBadge({ row }: { row: CorporateCaseFulfillmentQueueItem }) {
  const tone = row.attemptState === 'failed'
    ? 'danger'
    : row.attemptState === 'deferred'
      ? 'warning'
      : 'neutral';
  return (
    <View style={styles.cellStack}>
      <StatusBadge label={attemptLabels[row.attemptState]} tone={tone} />
      <Text style={styles.meta}>
        {row.attemptCount === 1 ? '1 tentativa' : `${row.attemptCount} tentativas`}
      </Text>
    </View>
  );
}

export function CorporateCaseFulfillmentQueueScreen() {
  const [rows, setRows] = useState<CorporateCaseFulfillmentQueueItem[]>([]);
  const [priority, setPriority] = useState<PriorityFilter>('all');
  const [slaState, setSlaState] = useState<SlaFilter>('all');
  const [attemptState, setAttemptState] = useState<AttemptFilter>('all');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const loadPage = useCallback(async (
    cursor: CorporateCaseFulfillmentQueueCursor | null,
    append: boolean,
  ) => {
    const currentRequest = ++requestId.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');
    try {
      const nextRows = await listCorporateCaseFulfillmentQueue({
        priority: priority === 'all' ? null : priority,
        slaState: slaState === 'all' ? null : slaState,
        attemptState: attemptState === 'all' ? null : attemptState,
        limit: PAGE_SIZE,
        cursor,
      });
      if (currentRequest !== requestId.current) return;
      setRows((currentRows) => append ? [...currentRows, ...nextRows] : nextRows);
      setHasMore(nextRows.length === PAGE_SIZE);
    } catch (loadError) {
      if (currentRequest !== requestId.current) return;
      if (!append) setRows([]);
      setError(errorMessage(loadError));
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [attemptState, priority, slaState]);

  useFocusEffect(useCallback(() => {
    void loadPage(null, false);
    return () => { requestId.current += 1; };
  }, [loadPage]));

  const loadMore = useCallback(() => {
    const lastRow = rows.at(-1);
    if (!lastRow || loadingMore) return;
    void loadPage({ dueAt: lastRow.taskDueAt, id: lastRow.taskId }, true);
  }, [loadPage, loadingMore, rows]);

  const columns = useMemo<DataTableColumn<CorporateCaseFulfillmentQueueItem>[]>(() => [
    {
      key: 'case',
      header: 'Chamado',
      width: 230,
      render: (row) => <QueueCaseLink row={row} />,
    },
    {
      key: 'access',
      header: 'Solicitação',
      width: 220,
      render: (row) => (
        <View style={styles.cellStack}>
          <Text style={styles.subject} numberOfLines={2}>{row.requestedProfileLabel}</Text>
          <Text selectable style={styles.meta} numberOfLines={1}>
            {row.requestedAction === 'grant' ? 'Conceder' : 'Revogar'} · {row.requestedProfileKey}
          </Text>
        </View>
      ),
    },
    {
      key: 'beneficiary',
      header: 'Beneficiário',
      width: 180,
      render: (row) => row.beneficiaryName ?? 'Não informado',
    },
    {
      key: 'priority',
      header: 'Prioridade',
      width: 110,
      render: (row) => (
        <StatusBadge
          label={corporateCasePriorityLabels[row.priority]}
          tone={corporateCasePriorityTone[row.priority]}
        />
      ),
    },
    {
      key: 'sla',
      header: 'SLA da tarefa',
      width: 190,
      render: (row) => <DeadlineBadge row={row} />,
    },
    {
      key: 'attempt',
      header: 'Tentativa',
      width: 170,
      render: (row) => <AttemptBadge row={row} />,
    },
    {
      key: 'assignment',
      header: 'Execução',
      width: 200,
      render: (row) => (
        <View style={styles.cellStack}>
          <Text style={styles.subject} numberOfLines={1}>
            {row.assignedProfileName ?? 'Não atribuída'}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>{row.assignedGroupLabel}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {row.canExecute ? 'Pronta para sua execução' : row.canClaim ? 'Disponível para assumir' : 'Em acompanhamento'}
          </Text>
        </View>
      ),
    },
    {
      key: 'updated',
      header: 'Atualizado',
      width: 150,
      render: (row) => formatCorporateCaseDate(row.updatedAt),
    },
  ], []);

  return (
    <SectionPage
      eyebrow="CHAMADOS · OPERAÇÃO CONTROLADA"
      title="Execução de acessos"
      description="Fila protegida de solicitações aprovadas. Somente membros elegíveis do grupo de execução, com AAL2 e segregação de funções válida, recebem itens."
    >
      <View style={styles.filters} testID="corporate-case-fulfillment-queue-filters">
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Criticidade</Text>
          <FilterTabs tabs={priorityTabs} value={priority} onChange={setPriority} />
        </View>
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Prazo operacional</Text>
          <FilterTabs tabs={slaTabs} value={slaState} onChange={setSlaState} />
        </View>
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Última tentativa</Text>
          <FilterTabs tabs={attemptTabs} value={attemptState} onChange={setAttemptState} />
        </View>
      </View>

      {loading ? (
        <ControlNotice title="Fila de execução" message="Consultando tarefas elegíveis..." tone="info" />
      ) : null}

      {!loading && error && rows.length === 0 ? (
        <FeedbackState
          kind="error"
          title="Fila indisponível"
          message={error}
          actionLabel="Tentar novamente"
          onAction={() => { void loadPage(null, false); }}
        />
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <FeedbackState
          kind="empty"
          title="Nenhuma execução pendente"
          message="Não há tarefas compatíveis com seus grupos, sua segregação de funções e os filtros selecionados."
        />
      ) : null}

      {rows.length > 0 ? (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.taskId}
            emptyLabel="Nenhuma execução pendente."
          />
          {error ? <ControlNotice title="Paginação interrompida" message={error} tone="danger" /> : null}
          {hasMore ? (
            <ControlButton
              busy={loadingMore}
              label="Carregar mais execuções"
              onPress={loadMore}
              variant="outline"
              style={styles.loadMore}
              testID="load-more-corporate-case-fulfillment"
            />
          ) : null}
        </>
      ) : null}
    </SectionPage>
  );
}

const styles = StyleSheet.create({
  filters: { gap: cloudTheme.spacing.md },
  filterGroup: { gap: cloudTheme.spacing.xs },
  filterLabel: { ...cloudTheme.type.smallStrong, color: cloudTheme.colors.textSecondary },
  cellStack: { gap: 3 },
  protocol: { ...cloudTheme.type.smallStrong, color: cloudTheme.colors.accent },
  subject: { ...cloudTheme.type.smallStrong, color: cloudTheme.colors.text },
  meta: { ...cloudTheme.type.caption, color: cloudTheme.colors.textMuted },
  loadMore: { alignSelf: 'flex-start' },
});
