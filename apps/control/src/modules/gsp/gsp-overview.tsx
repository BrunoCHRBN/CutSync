import { Link } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FeedbackState } from '@/components/cloud/feedback-state';
import { PageHeader } from '@/components/cloud/page-header';
import { StatusBadge } from '@/components/cloud/status-badge';
import { ControlCard } from '@/components/control-ui';
import { useControlAuth } from '@/contexts/control-auth-context';
import { resolveCloudActionAvailability } from '@/features/cloud/cloud-action-availability';
import {
  formatDateTime,
  formatRelative,
  labelForAuditAction,
  labelForDataState,
  labelForRole,
  labelForSurfaceState,
  resolveActorIdentity,
  toneForDataState,
  toneForSurfaceState,
  type GspStatusTone,
} from '@/modules/gsp/presentation';
import { CLOUD_ROUTES } from '@/navigation/cloud-routes';
import {
  getControlAccessErrorMessage,
  listControlAccessUsers,
  type ControlAccessUser,
} from '@/services/control-access';
import {
  ControlGovernanceAuditError,
  getControlGovernanceAuditErrorMessage,
  listControlGovernanceAuditEvents,
  type ControlGovernanceAuditEvent,
} from '@/services/control-governance-audit';
import { cloudTheme } from '@/theme/cloud-components';

type LoadState = 'idle' | 'loading' | 'ready' | 'error' | 'forbidden';

function Badge({ label, tone }: { label: string; tone: GspStatusTone }) {
  return <StatusBadge label={label} tone={tone} />;
}

export function GspOverview() {
  const { can, status } = useControlAuth();
  const canManageAccess = can('control.access.manage');
  const canReadGovernance = can('control.governance.read');
  const accessWrite = resolveCloudActionAvailability({ action: 'access_write', can });

  const [accessState, setAccessState] = useState<LoadState>(canManageAccess ? 'loading' : 'idle');
  const [accessUsers, setAccessUsers] = useState<ControlAccessUser[]>([]);
  const [accessError, setAccessError] = useState<string | null>(null);

  const [auditState, setAuditState] = useState<LoadState>(canReadGovernance ? 'loading' : 'idle');
  const [auditEvents, setAuditEvents] = useState<ControlGovernanceAuditEvent[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAccess() {
      if (!canManageAccess) {
        setAccessState('idle');
        setAccessUsers([]);
        setAccessError(null);
        return;
      }
      setAccessState('loading');
      try {
        const users = await listControlAccessUsers();
        if (cancelled) return;
        setAccessUsers(users);
        setAccessError(null);
        setAccessState('ready');
        setLoadedAt(new Date().toISOString());
      } catch (error) {
        if (cancelled) return;
        const message = getControlAccessErrorMessage(error);
        setAccessUsers([]);
        setAccessError(message);
        setAccessState(message.toLowerCase().includes('proprietário') || message.toLowerCase().includes('forbidden')
          ? 'forbidden'
          : 'error');
      }
    }

    async function loadAudit() {
      if (!canReadGovernance) {
        setAuditState('idle');
        setAuditEvents([]);
        setAuditError(null);
        return;
      }
      setAuditState('loading');
      try {
        const events = await listControlGovernanceAuditEvents({ pageSize: 5, pageOffset: 0 });
        if (cancelled) return;
        setAuditEvents(events);
        setAuditError(null);
        setAuditState('ready');
        setLoadedAt((current) => current ?? new Date().toISOString());
      } catch (error) {
        if (cancelled) return;
        setAuditEvents([]);
        setAuditError(getControlGovernanceAuditErrorMessage(error));
        setAuditState(
          error instanceof ControlGovernanceAuditError && error.code === 'forbidden'
            ? 'forbidden'
            : 'error',
        );
      }
    }

    void loadAccess();
    void loadAudit();
    return () => {
      cancelled = true;
    };
  }, [canManageAccess, canReadGovernance]);

  const distribution = useMemo(() => {
    const counts = { SaaS_Owner: 0, SaaS_Editor: 0, SaaS_Viewer: 0 };
    for (const user of accessUsers) {
      if (user.role in counts) counts[user.role] += 1;
    }
    return counts;
  }, [accessUsers]);

  const authorizedCount =
    accessState === 'ready' ? String(accessUsers.length) : canManageAccess ? (accessState === 'loading' ? '…' : '—') : '—';

  const sensitiveEventsValue =
    auditState === 'ready'
      ? String(auditEvents.length)
      : auditState === 'loading'
        ? '…'
        : 'Em preparação';

  return (
    <View style={styles.page}>
      <PageHeader
        eyebrow="GSP"
        title="Postura de governança"
        description="Leitura institucional da identidade, auditoria e controles aplicados no Control — sem indicadores inventados."
      />

      <ControlCard style={styles.stripCard}>
        <View style={styles.strip}>
          <StripCell
            label="Risco geral"
            value="Não calculado"
            badgeLabel={labelForDataState('not_calculated')}
            badgeTone={toneForDataState('not_calculated')}
          />
          <StripCell
            label="Pessoas autorizadas"
            value={authorizedCount}
            badgeLabel={
              canManageAccess
                ? accessState === 'ready'
                  ? labelForSurfaceState('available')
                  : accessState === 'loading'
                    ? 'Carregando'
                    : labelForSurfaceState('unavailable')
                : 'Fonte em preparação'
            }
            badgeTone={
              canManageAccess
                ? accessState === 'ready'
                  ? toneForSurfaceState('available')
                  : accessState === 'loading'
                    ? 'info'
                    : toneForSurfaceState('unavailable')
                : 'info'
            }
            hint={!canManageAccess ? 'Disponível para Proprietário' : undefined}
          />
          <StripCell
            label="Revisões pendentes"
            value="Em preparação"
            badgeLabel="Fonte em preparação"
            badgeTone="info"
          />
          <StripCell
            label="Eventos sensíveis"
            value={sensitiveEventsValue}
            badgeLabel={
              auditState === 'ready'
                ? labelForSurfaceState('available')
                : auditState === 'loading'
                  ? 'Carregando'
                  : 'Fonte em preparação'
            }
            badgeTone={
              auditState === 'ready'
                ? toneForSurfaceState('available')
                : 'info'
            }
          />
          <StripCell
            label="Última atualização"
            value={loadedAt ? formatRelative(loadedAt) : '—'}
            badgeLabel={loadedAt ? labelForDataState('updated') : labelForSurfaceState('unavailable')}
            badgeTone={loadedAt ? toneForDataState('updated') : toneForSurfaceState('unavailable')}
          />
        </View>
      </ControlCard>

      <View style={styles.grid}>
        <ControlCard style={styles.panel}>
          <Text style={styles.panelTitle}>Composição do risco</Text>
          <Text style={styles.panelHint}>
            O índice agregado ainda não é calculado. Abaixo estão apenas fatores com fonte verificável ou estado honesto.
          </Text>
          <View style={styles.table}>
            <View style={styles.tableHead}>
              <Text style={[styles.th, styles.colFactor]}>Fator</Text>
              <Text style={[styles.th, styles.colState]}>Estado</Text>
              <Text style={[styles.th, styles.colSource]}>Fonte</Text>
            </View>
            {[
              {
                factor: 'Acessos privilegiados',
                label: canManageAccess && accessState === 'ready'
                  ? labelForSurfaceState('available')
                  : 'Fonte em preparação',
                tone: canManageAccess && accessState === 'ready'
                  ? toneForSurfaceState('available')
                  : ('info' as const),
                source: canManageAccess ? 'list_control_users' : 'Requer control.access.manage',
              },
              {
                factor: 'Revisões de acesso atrasadas',
                label: 'Fonte em preparação',
                tone: 'info' as const,
                source: 'Ciclos de revisão ainda sem backend dedicado',
              },
              {
                factor: 'Eventos sensíveis recentes',
                label: auditState === 'ready'
                  ? labelForSurfaceState('available')
                  : 'Fonte em preparação',
                tone: auditState === 'ready'
                  ? toneForSurfaceState('available')
                  : ('info' as const),
                source: auditState === 'ready' ? 'list_governance_audit_events' : 'Auditoria de governança',
              },
              {
                factor: 'Exceções de política',
                label: labelForDataState('not_calculated'),
                tone: toneForDataState('not_calculated'),
                source: 'Sem motor de exceções neste console',
              },
            ].map((row) => (
              <View key={row.factor} style={styles.tableRow}>
                <Text style={[styles.td, styles.colFactor]}>{row.factor}</Text>
                <View style={[styles.colState, styles.cellCenter]}>
                  <Badge label={row.label} tone={row.tone} />
                </View>
                <Text style={[styles.td, styles.colSource]}>{row.source}</Text>
              </View>
            ))}
          </View>
        </ControlCard>

        <ControlCard style={styles.panel}>
          <Text style={styles.panelTitle}>Distribuição de acesso</Text>
          {canManageAccess && accessState === 'ready' ? (
            <View style={styles.distList}>
              {(
                [
                  ['SaaS_Owner', distribution.SaaS_Owner],
                  ['SaaS_Editor', distribution.SaaS_Editor],
                  ['SaaS_Viewer', distribution.SaaS_Viewer],
                ] as const
              ).map(([role, count]) => (
                <View key={role} style={styles.distRow}>
                  <Text style={styles.distLabel}>{labelForRole(role)}</Text>
                  <Text style={styles.distValue}>{count}</Text>
                </View>
              ))}
              <Link href={CLOUD_ROUTES.gsp.acessos} asChild>
                <Pressable style={styles.linkBtn}>
                  <Text style={styles.linkBtnText}>Abrir acessos</Text>
                </Pressable>
              </Link>
            </View>
          ) : canManageAccess && accessState === 'loading' ? (
            <FeedbackState
              kind="partial"
              title="Carregando distribuição"
              message="Consultando papéis autorizados."
            />
          ) : canManageAccess && (accessState === 'error' || accessState === 'forbidden') ? (
            <FeedbackState
              kind="error"
              title="Distribuição indisponível"
              message={accessError ?? 'Não foi possível carregar acessos.'}
            />
          ) : (
            <View style={styles.distFallback}>
              <Text style={styles.panelHint}>
                A distribuição por papel exige permissão de gestão de acesso (Proprietário).
              </Text>
              <Link href={CLOUD_ROUTES.gsp.acessos} asChild>
                <Pressable style={styles.linkBtn}>
                  <Text style={styles.linkBtnText}>Consultar acessos</Text>
                </Pressable>
              </Link>
            </View>
          )}
        </ControlCard>
      </View>

      <View style={styles.grid}>
        <ControlCard style={styles.panel}>
          <Text style={styles.panelTitle}>Atenção necessária</Text>
          <View style={styles.attentionList}>
            {!accessWrite.enabled && accessWrite.visible ? (
              <AttentionRow
                title="Escrita de acessos bloqueada"
                detail={accessWrite.reason ?? 'Concessões e revogações aguardam homologação.'}
                label={labelForSurfaceState('partial')}
                tone={toneForSurfaceState('partial')}
              />
            ) : null}
            {!canManageAccess ? (
              <AttentionRow
                title="Distribuição completa restrita"
                detail="Contagem por papel disponível apenas para Proprietário."
                label="Fonte em preparação"
                tone="info"
              />
            ) : null}
            {accessState === 'error' || accessState === 'forbidden' ? (
              <AttentionRow
                title="Falha ao carregar acessos"
                detail={accessError ?? 'Erro na consulta de acessos.'}
                label={labelForSurfaceState('error')}
                tone={toneForSurfaceState('error')}
              />
            ) : null}
            {auditState === 'error' ? (
              <AttentionRow
                title="Falha ao carregar auditoria"
                detail={auditError ?? 'Erro na consulta de eventos.'}
                label={labelForSurfaceState('error')}
                tone={toneForSurfaceState('error')}
              />
            ) : null}
            <AttentionRow
              title="Ciclos de revisão de acesso"
              detail="Fonte institucional ainda em preparação — nenhum ciclo simulado."
              label="Fonte em preparação"
              tone="info"
            />
            {canManageAccess
            && accessState === 'ready'
            && (auditState === 'ready' || auditState === 'idle')
            && accessWrite.enabled ? (
              <Text style={styles.panelHint}>Nenhuma pendência operacional adicional neste momento.</Text>
            ) : null}
          </View>
        </ControlCard>

        <ControlCard style={styles.panel}>
          <View style={styles.panelHead}>
            <Text style={styles.panelTitle}>Auditoria recente</Text>
            <Link href={CLOUD_ROUTES.gsp.auditoria} asChild>
              <Pressable>
                <Text style={styles.textLink}>Ver tudo</Text>
              </Pressable>
            </Link>
          </View>
          {auditState === 'loading' ? (
            <FeedbackState
              kind="partial"
              title="Carregando eventos"
              message="Consultando auditoria de governança."
            />
          ) : auditState === 'error' ? (
            <FeedbackState
              kind="error"
              title="Auditoria indisponível"
              message={auditError ?? 'Não foi possível carregar eventos.'}
            />
          ) : auditState === 'forbidden' || auditState === 'idle' ? (
            <FeedbackState
              kind="partial"
              title="Auditoria em preparação"
              message={
                auditState === 'forbidden'
                  ? (auditError ?? 'É necessário control.governance.read.')
                  : 'A consulta de eventos depende de permissão de governança.'
              }
            />
          ) : auditEvents.length === 0 ? (
            <FeedbackState
              kind="empty"
              title="Nenhum evento recente"
              message="A fonte está disponível, mas não há registros no recorte atual."
            />
          ) : (
            <View style={styles.eventList}>
              {auditEvents.map((event) => {
                const actor = resolveActorIdentity(event.actorName);
                return (
                  <View key={String(event.id)} style={styles.eventRow}>
                    <View style={styles.eventMain}>
                      <Text style={styles.eventAction}>{labelForAuditAction(event.action)}</Text>
                      <Text style={styles.eventMeta}>
                        {actor.primary} · {formatDateTime(event.createdAt) ?? formatRelative(event.createdAt)}
                      </Text>
                    </View>
                    <Badge label={labelForSurfaceState('available')} tone={toneForSurfaceState('available')} />
                  </View>
                );
              })}
            </View>
          )}
        </ControlCard>
      </View>

      <ControlCard style={styles.panel}>
        <Text style={styles.panelTitle}>Saúde dos controles</Text>
        <View style={styles.healthGrid}>
          <HealthItem
            label="MFA administrativo"
            badgeLabel={status === 'ready' ? 'Ativo' : 'Indeterminado'}
            badgeTone={status === 'ready' ? 'success' : 'neutral'}
          />
          <HealthItem label="Sessão em memória" badgeLabel="Ativo" badgeTone="success" />
          <HealthItem
            label="Inventário de acessos"
            badgeLabel={
              canManageAccess && accessState === 'ready'
                ? labelForSurfaceState('available')
                : canManageAccess
                  ? labelForSurfaceState('partial')
                  : labelForSurfaceState('unavailable')
            }
            badgeTone={
              canManageAccess && accessState === 'ready'
                ? toneForSurfaceState('available')
                : canManageAccess
                  ? toneForSurfaceState('partial')
                  : toneForSurfaceState('unavailable')
            }
          />
          <HealthItem
            label="Auditoria de governança"
            badgeLabel={
              auditState === 'ready'
                ? labelForSurfaceState('available')
                : auditState === 'loading'
                  ? 'Carregando'
                  : 'Fonte em preparação'
            }
            badgeTone={auditState === 'ready' ? toneForSurfaceState('available') : 'info'}
          />
          <HealthItem
            label="Revisões de acesso"
            badgeLabel="Fonte em preparação"
            badgeTone="info"
          />
          <HealthItem
            label="Políticas do sistema"
            badgeLabel={labelForSurfaceState('available')}
            badgeTone={toneForSurfaceState('available')}
          />
        </View>
      </ControlCard>
    </View>
  );
}

function StripCell({
  label,
  value,
  badgeLabel,
  badgeTone,
  hint,
}: {
  label: string;
  value: string;
  badgeLabel: string;
  badgeTone: GspStatusTone;
  hint?: string;
}) {
  return (
    <View style={styles.stripCell}>
      <Text style={styles.stripLabel}>{label}</Text>
      <Text style={styles.stripValue}>{value}</Text>
      <Badge label={badgeLabel} tone={badgeTone} />
      {hint ? <Text style={styles.stripHint}>{hint}</Text> : null}
    </View>
  );
}

function AttentionRow({
  title,
  detail,
  label,
  tone,
}: {
  title: string;
  detail: string;
  label: string;
  tone: GspStatusTone;
}) {
  return (
    <View style={styles.attentionRow}>
      <View style={styles.attentionMain}>
        <Text style={styles.attentionTitle}>{title}</Text>
        <Text style={styles.attentionDetail}>{detail}</Text>
      </View>
      <Badge label={label} tone={tone} />
    </View>
  );
}

function HealthItem({
  label,
  badgeLabel,
  badgeTone,
}: {
  label: string;
  badgeLabel: string;
  badgeTone: GspStatusTone;
}) {
  return (
    <View style={styles.healthItem}>
      <Text style={styles.healthLabel}>{label}</Text>
      <Badge label={badgeLabel} tone={badgeTone} />
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
  stripCard: {
    paddingVertical: cloudTheme.spacing.sm,
  },
  strip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: cloudTheme.spacing.md,
  },
  stripCell: {
    flexGrow: 1,
    flexBasis: 140,
    minWidth: 130,
    gap: 6,
    paddingVertical: cloudTheme.spacing.sm,
    paddingHorizontal: cloudTheme.spacing.sm,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: cloudTheme.colors.border,
  },
  stripLabel: {
    ...cloudTheme.type.caption,
    color: cloudTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  stripValue: {
    ...cloudTheme.type.sectionTitle,
    color: cloudTheme.colors.text,
  },
  stripHint: {
    ...cloudTheme.type.small,
    color: cloudTheme.colors.textSecondary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: cloudTheme.spacing.md,
  },
  panel: {
    flexGrow: 1,
    flexBasis: 320,
    gap: cloudTheme.spacing.sm,
  },
  panelHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: cloudTheme.spacing.sm,
  },
  panelTitle: {
    ...cloudTheme.type.sectionTitle,
    color: cloudTheme.colors.text,
  },
  panelHint: {
    ...cloudTheme.type.body,
    color: cloudTheme.colors.textSecondary,
  },
  table: {
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: cloudTheme.radii.md,
    overflow: 'hidden',
  },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: cloudTheme.colors.surfaceMuted,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
    paddingHorizontal: cloudTheme.spacing.sm,
    paddingVertical: cloudTheme.spacing.sm,
    gap: cloudTheme.spacing.sm,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cloudTheme.colors.border,
    paddingHorizontal: cloudTheme.spacing.sm,
    paddingVertical: cloudTheme.spacing.sm,
    gap: cloudTheme.spacing.sm,
    alignItems: 'center',
  },
  th: {
    ...cloudTheme.type.caption,
    color: cloudTheme.colors.textMuted,
    textTransform: 'uppercase',
  },
  td: {
    ...cloudTheme.type.small,
    color: cloudTheme.colors.text,
  },
  colFactor: { flex: 1.2, minWidth: 120 },
  colState: { flex: 1, minWidth: 110 },
  colSource: { flex: 1.4, minWidth: 140 },
  cellCenter: { justifyContent: 'center' },
  distList: { gap: cloudTheme.spacing.sm },
  distRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: cloudTheme.spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cloudTheme.colors.border,
  },
  distLabel: {
    ...cloudTheme.type.bodyStrong,
    color: cloudTheme.colors.text,
  },
  distValue: {
    ...cloudTheme.type.sectionTitle,
    color: cloudTheme.colors.text,
  },
  distFallback: { gap: cloudTheme.spacing.sm },
  linkBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: cloudTheme.colors.borderStrong,
    borderRadius: cloudTheme.radii.md,
    paddingHorizontal: cloudTheme.spacing.md,
    paddingVertical: cloudTheme.spacing.sm,
    backgroundColor: cloudTheme.colors.surface,
  },
  linkBtnText: {
    ...cloudTheme.type.button,
    color: cloudTheme.colors.text,
  },
  textLink: {
    ...cloudTheme.type.smallStrong,
    color: cloudTheme.colors.accent,
  },
  attentionList: { gap: cloudTheme.spacing.sm },
  attentionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: cloudTheme.spacing.sm,
    alignItems: 'flex-start',
    paddingVertical: cloudTheme.spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cloudTheme.colors.border,
  },
  attentionMain: { flex: 1, gap: 2 },
  attentionTitle: {
    ...cloudTheme.type.smallStrong,
    color: cloudTheme.colors.text,
  },
  attentionDetail: {
    ...cloudTheme.type.small,
    color: cloudTheme.colors.textSecondary,
  },
  eventList: { gap: cloudTheme.spacing.sm },
  eventRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: cloudTheme.spacing.sm,
    alignItems: 'flex-start',
    paddingVertical: cloudTheme.spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cloudTheme.colors.border,
  },
  eventMain: { flex: 1, gap: 2 },
  eventAction: {
    ...cloudTheme.type.smallStrong,
    color: cloudTheme.colors.text,
  },
  eventMeta: {
    ...cloudTheme.type.small,
    color: cloudTheme.colors.textSecondary,
  },
  healthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: cloudTheme.spacing.sm,
  },
  healthItem: {
    flexBasis: '30%',
    flexGrow: 1,
    minWidth: 160,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: cloudTheme.radii.md,
    padding: cloudTheme.spacing.sm,
    gap: cloudTheme.spacing.xs,
    backgroundColor: cloudTheme.colors.surfaceMuted,
  },
  healthLabel: {
    ...cloudTheme.type.smallStrong,
    color: cloudTheme.colors.text,
  },
});
