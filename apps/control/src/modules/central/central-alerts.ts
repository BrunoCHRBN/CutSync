import { CLOUD_ROUTES } from '@/navigation/cloud-routes';
import type { CloudAreaId } from '@/navigation/cloud-area-registry';
import { getControlBillingSnapshot } from '@/services/control-billing';
import { loadControlLiveSnapshot } from '@/services/control-live';
import { getControlSupportOverview } from '@/services/control-support';
import type { ControlPermission } from '@/types/control';

export type CloudActionableAlert = {
  id: string;
  area: Exclude<CloudAreaId, 'central'>;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description?: string;
  href: string;
  occurredAt?: string;
  count: number;
};

export type CloudAlertSummary = {
  total: number;
  byArea: Partial<Record<Exclude<CloudAreaId, 'central'>, number>>;
  alerts: CloudActionableAlert[];
  error: string | null;
};

const emptySummary = (): CloudAlertSummary => ({
  total: 0,
  byArea: {},
  alerts: [],
  error: null,
});

function pushAlert(
  alerts: CloudActionableAlert[],
  alert: CloudActionableAlert,
) {
  if (alert.count > 0) alerts.push(alert);
}

export async function loadCloudActionableAlerts(
  can: (permission: ControlPermission) => boolean,
): Promise<CloudAlertSummary> {
  const alerts: CloudActionableAlert[] = [];
  const errors: string[] = [];

  const tasks: Promise<void>[] = [];

  if (can('control.support.read')) {
    tasks.push((async () => {
      try {
        const overview = await getControlSupportOverview({
          status: null,
          priority: null,
          category: null,
          limit: 1,
        });
        const critical = overview.counts.critical;
        const slaAtRisk = overview.counts.slaAtRisk;
        const syncFailed = overview.counts.syncFailed;
        pushAlert(alerts, {
          id: 'support-critical',
          area: 'support',
          severity: 'critical',
          title: 'Chamados críticos abertos',
          href: CLOUD_ROUTES.suporte.atendimentos,
          count: critical,
        });
        pushAlert(alerts, {
          id: 'support-sla',
          area: 'support',
          severity: 'high',
          title: 'Atendimentos fora do SLA',
          href: CLOUD_ROUTES.suporte.atendimentos,
          count: slaAtRisk,
        });
        pushAlert(alerts, {
          id: 'support-sync',
          area: 'support',
          severity: 'high',
          title: 'Falhas de sincronização',
          href: CLOUD_ROUTES.suporte.atendimentos,
          count: syncFailed,
        });
      } catch {
        errors.push('suporte');
      }
    })());
  }

  if (can('control.live.read') || can('control.dashboard.read')) {
    tasks.push((async () => {
      try {
        const live = await loadControlLiveSnapshot();
        const support = live.support;
        if (!support) return;
        // Prefer live only when support overview was not loaded (avoid double-count).
        if (!can('control.support.read')) {
          pushAlert(alerts, {
            id: 'operation-critical',
            area: 'operation',
            severity: 'critical',
            title: 'Chamados críticos em tempo real',
            href: CLOUD_ROUTES.operacao.tempoReal,
            count: support.criticalOpen,
          });
          pushAlert(alerts, {
            id: 'operation-sla',
            area: 'operation',
            severity: 'high',
            title: 'SLA em risco',
            href: CLOUD_ROUTES.operacao.tempoReal,
            count: support.slaAtRisk,
          });
        }
        if (can('control.support.manage')) {
          pushAlert(alerts, {
            id: 'support-pending-ops',
            area: 'support',
            severity: 'medium',
            title: 'Operações assistidas pendentes',
            href: CLOUD_ROUTES.suporte.operacoesAssistidas,
            count: support.pendingOperations,
          });
        }
      } catch {
        errors.push('operação');
      }
    })());
  }

  if (can('control.billing.read')) {
    tasks.push((async () => {
      try {
        const snapshot = await getControlBillingSnapshot();
        const attention = snapshot.accounts.filter((account) => (
          account.subscriptionStatus === 'past_due'
          || account.subscriptionStatus === 'suspended'
        )).length;
        const pendingConflicts = snapshot.conflicts.filter((item) => item.status === 'pending').length;
        pushAlert(alerts, {
          id: 'finance-attention',
          area: 'finance',
          severity: 'high',
          title: 'Assinaturas em atraso ou suspensas',
          href: CLOUD_ROUTES.financeiro.cobrancas,
          count: attention,
        });
        pushAlert(alerts, {
          id: 'finance-cutovers',
          area: 'finance',
          severity: 'high',
          title: 'Conciliações pendentes',
          href: CLOUD_ROUTES.financeiro.conciliacao,
          count: snapshot.cutovers.length,
        });
        pushAlert(alerts, {
          id: 'finance-conflicts',
          area: 'finance',
          severity: 'medium',
          title: 'Conflitos cadastrais pendentes',
          href: CLOUD_ROUTES.financeiro.conciliacao,
          count: pendingConflicts,
        });
      } catch {
        errors.push('financeiro');
      }
    })());
  }

  // GSP: no dedicated actionable review/incident feed in Control yet — do not invent.

  await Promise.all(tasks);

  const byArea: CloudAlertSummary['byArea'] = {};
  for (const alert of alerts) {
    byArea[alert.area] = (byArea[alert.area] ?? 0) + alert.count;
  }

  const total = Object.values(byArea).reduce((sum, value) => sum + (value ?? 0), 0);
  const severityRank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || b.count - a.count);

  if (alerts.length === 0 && errors.length === 0) return emptySummary();

  return {
    total,
    byArea,
    alerts,
    error: errors.length > 0
      ? `Não foi possível atualizar os avisos (${errors.join(', ')}).`
      : null,
  };
}

export function formatAlertAreaBreakdown(
  byArea: CloudAlertSummary['byArea'],
): string {
  const labels: Record<Exclude<CloudAreaId, 'central'>, string> = {
    cases: 'Chamados',
    operation: 'Operação',
    support: 'Suporte',
    gsp: 'GSP',
    finance: 'Financeiro',
  };
  return (Object.entries(byArea) as [Exclude<CloudAreaId, 'central'>, number][])
    .filter(([, count]) => count > 0)
    .map(([area, count]) => `${count} em ${labels[area]}`)
    .join(' · ');
}
