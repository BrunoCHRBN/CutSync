import type { ControlPermission } from '@/types/control';
import {
  getCloudFeatureFlags,
  type CloudFeatureFlags,
} from '@/features/cloud/cloud-feature-flags';

export type CloudActionId =
  | 'open_incident'
  | 'create_support_ticket'
  | 'access_write'
  | 'finance_write';

export type CloudActionAvailability = {
  id: CloudActionId;
  visible: boolean;
  enabled: boolean;
  reason: string | null;
};

export function resolveCloudActionAvailability(input: {
  action: CloudActionId;
  can: (permission: ControlPermission) => boolean;
  allowNewTickets?: boolean;
  flags?: CloudFeatureFlags;
}): CloudActionAvailability {
  const flags = input.flags ?? getCloudFeatureFlags();

  switch (input.action) {
    case 'open_incident': {
      const permitted = input.can('control.dashboard.read');
      if (!permitted) {
        return {
          id: input.action,
          visible: false,
          enabled: false,
          reason: 'Sem permissão operacional.',
        };
      }
      if (!flags.incidentWriteEnabled) {
        return {
          id: input.action,
          visible: true,
          enabled: false,
          reason: 'Abertura de incidentes aguarda homologação da RPC e permissão dedicada.',
        };
      }
      return { id: input.action, visible: true, enabled: true, reason: null };
    }
    case 'create_support_ticket': {
      const permitted = input.can('control.support.manage');
      if (!permitted) {
        return {
          id: input.action,
          visible: false,
          enabled: false,
          reason: 'Somente quem gerencia suporte pode criar atendimentos.',
        };
      }
      if (!flags.supportCreateEnabled || input.allowNewTickets === false) {
        return {
          id: input.action,
          visible: true,
          enabled: false,
          reason: 'Novos atendimentos permanecem bloqueados até homologação ponta a ponta.',
        };
      }
      return { id: input.action, visible: true, enabled: true, reason: null };
    }
    case 'access_write': {
      const permitted = input.can('control.access.manage');
      if (!permitted) {
        return {
          id: input.action,
          visible: false,
          enabled: false,
          reason: 'Somente Owner pode mutar acessos.',
        };
      }
      if (!flags.accessWriteEnabled) {
        return {
          id: input.action,
          visible: true,
          enabled: false,
          reason: 'Convites e revogações aguardam homologação das RPCs.',
        };
      }
      return { id: input.action, visible: true, enabled: true, reason: null };
    }
    case 'finance_write': {
      const permitted = input.can('control.billing.manage');
      if (!permitted) {
        return {
          id: input.action,
          visible: false,
          enabled: false,
          reason: 'Sem permissão de gestão financeira.',
        };
      }
      if (!flags.financeWriteEnabled) {
        return {
          id: input.action,
          visible: true,
          enabled: false,
          reason: 'Escritas financeiras desativadas por feature flag.',
        };
      }
      return { id: input.action, visible: true, enabled: true, reason: null };
    }
    default: {
      const _exhaustive: never = input.action;
      return _exhaustive;
    }
  }
}
