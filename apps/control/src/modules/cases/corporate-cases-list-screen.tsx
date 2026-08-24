import type { CorporateCaseStatus, CorporateCaseView } from '@cutsync/domain';
import { Link, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DataTable, type DataTableColumn } from '@/components/cloud/data-table';
import { FeedbackState } from '@/components/cloud/feedback-state';
import { FilterTabs, type FilterTab } from '@/components/cloud/filter-tabs';
import { StatusBadge } from '@/components/cloud/status-badge';
import { ControlNotice } from '@/components/control-ui';
import { SectionPage } from '@/components/section-page';
import {
  corporateCasePriorityLabels,
  corporateCasePriorityTone,
  corporateCaseStatusTone,
  corporateCaseViewCopy,
  formatCorporateCaseDate,
  formatCorporateCaseDeadline,
  formatCorporateCaseStatus,
} from '@/modules/cases/corporate-cases-presentation';
import { corporateCasePath } from '@/navigation/cloud-routes';
import {
  getCorporateCasesReadContext,
  listCorporateCases,
  type CorporateCaseSummary,
  type CorporateCasesReadContext,
} from '@/services/corporate-cases';
import { cloudTheme } from '@/theme/cloud-components';

type StatusFilter = CorporateCaseStatus | 'all';

const statusTabs: FilterTab<StatusFilter>[] = [
  { id: 'all', label: 'Todos' },
  { id: 'submitted', label: 'Recebidos' },
  { id: 'awaiting_approval', label: 'Aguardando aprovação' },
  { id: 'fulfillment', label: 'Em execução' },
  { id: 'waiting_requester', label: 'Aguardando solicitante' },
  { id: 'resolved', label: 'Resolvidos' },
  { id: 'expired', label: 'Expirados' },
];

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Não foi possível consultar os chamados.';
}

function CaseLink({ row }: { row: CorporateCaseSummary }) {
  return (
    <Link href={corporateCasePath(row.caseId) as never} asChild>
      <Pressable accessibilityRole="link" style={styles.caseLink}>
        <Text style={styles.protocol}>{row.protocol}</Text>
        <Text style={styles.caseType} numberOfLines={1}>{row.caseTypeLabel}</Text>
      </Pressable>
    </Link>
  );
}

function Deadline({ value }: { value: string }) {
  const deadline = formatCorporateCaseDeadline(value);
  return <StatusBadge label={deadline.label} tone={deadline.tone} />;
}

export function CorporateCasesListScreen({ view }: { view: CorporateCaseView }) {
  const copy = corporateCaseViewCopy[view];
  const [context, setContext] = useState<CorporateCasesReadContext | null>(null);
  const [rows, setRows] = useState<CorporateCaseSummary[]>([]);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const nextContext = await getCorporateCasesReadContext();
      if (currentRequest !== requestId.current) return;
      setContext(nextContext);
      if (!nextContext.enabled || !nextContext.views[view]) {
        setRows([]);
        return;
      }
      const nextRows = await listCorporateCases({
        view,
        status: status === 'all' ? null : status,
        limit: 50,
      });
      if (currentRequest === requestId.current) setRows(nextRows);
    } catch (loadError) {
      if (currentRequest === requestId.current) {
        setRows([]);
        setError(errorMessage(loadError));
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [status, view]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { requestId.current += 1; };
  }, [load]));

  const columns = useMemo<DataTableColumn<CorporateCaseSummary>[]>(() => [
    {
      key: 'case',
      header: 'Chamado',
      width: 180,
      render: (row) => <CaseLink row={row} />,
    },
    {
      key: 'subject',
      header: 'Assunto',
      render: (row) => (
        <View style={styles.subjectCell}>
          <Text style={styles.subject} numberOfLines={2}>{row.subject}</Text>
          <Text style={styles.summary} numberOfLines={2}>{row.summary}</Text>
        </View>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 170,
      render: (row) => (
        <StatusBadge
          label={formatCorporateCaseStatus(row.status)}
          tone={corporateCaseStatusTone[row.status]}
        />
      ),
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
      key: 'owner',
      header: 'Responsável',
      width: 190,
      render: (row) => (
        <View style={styles.subjectCell}>
          <Text style={styles.subject} numberOfLines={1}>
            {row.currentAssigneeName ?? 'Não atribuído'}
          </Text>
          <Text style={styles.summary} numberOfLines={1}>
            {row.currentGroupLabel ?? 'Sem grupo atual'}
          </Text>
        </View>
      ),
    },
    {
      key: 'deadline',
      header: 'Prazo',
      width: 190,
      render: (row) => <Deadline value={row.expiresAt} />,
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
      eyebrow="CHAMADOS · SOMENTE LEITURA"
      title={copy.title}
      description={copy.description}
    >
      <FilterTabs tabs={statusTabs} value={status} onChange={setStatus} />

      {loading ? (
        <ControlNotice title="Chamados" message="Consultando a fila protegida..." tone="info" />
      ) : null}

      {!loading && error ? (
        <FeedbackState
          kind="error"
          title="Chamados indisponíveis"
          message={error}
          actionLabel="Tentar novamente"
          onAction={() => { void load(); }}
        />
      ) : null}

      {!loading && !error && context && !context.enabled ? (
        <FeedbackState
          kind="maintenance"
          title="Área ainda não habilitada"
          message="A fundação está instalada, mas a ativação operacional dos chamados continua desligada no backend."
        />
      ) : null}

      {!loading && !error && context?.enabled && !context.views[view] ? (
        <FeedbackState
          kind="partial"
          title="Visão não autorizada"
          message="O contexto protegido do backend não liberou esta visão para o seu perfil atual."
        />
      ) : null}

      {!loading && !error && context?.enabled && context.views[view] && rows.length === 0 ? (
        <FeedbackState kind="empty" title="Nenhum chamado" message={copy.empty} />
      ) : null}

      {!loading && !error && context?.enabled && context.views[view] && rows.length > 0 ? (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.caseId}
          emptyLabel={copy.empty}
        />
      ) : null}
    </SectionPage>
  );
}

const styles = StyleSheet.create({
  caseLink: { gap: 2 },
  protocol: { ...cloudTheme.type.smallStrong, color: cloudTheme.colors.accent },
  caseType: { ...cloudTheme.type.caption, color: cloudTheme.colors.textMuted },
  subjectCell: { gap: 2 },
  subject: { ...cloudTheme.type.smallStrong, color: cloudTheme.colors.text },
  summary: { ...cloudTheme.type.small, color: cloudTheme.colors.textSecondary },
});
