import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '@/services/supabase';

export type ControlLiveScope =
  | 'appointments'
  | 'establishments'
  | 'onboarding'
  | 'support';

export type ControlLiveSubscriptionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting';

export interface ControlLiveAppointments {
  todayTotal: number;
  pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  next60Minutes: number;
}

export interface ControlLiveEstablishments {
  active: number;
  pendingRequests: number;
}

export interface ControlLiveSupport {
  runtimeEnabled: boolean;
  syncEnabled: boolean;
  openQueue: number;
  waitingUser: number;
  criticalOpen: number;
  slaAtRisk: number;
  syncFailed: number;
  pendingOperations: number;
  oldestPendingMinutes: number | null;
}

export interface ControlLiveSnapshot {
  generatedAt: string;
  timezone: string;
  appointments: ControlLiveAppointments;
  establishments: ControlLiveEstablishments;
  support: ControlLiveSupport | null;
}

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('control_live_invalid');
  }
  return value as JsonRecord;
};

const asTimestamp = (value: unknown): string => {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error('control_live_invalid');
  }
  return value;
};

const asString = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('control_live_invalid');
  }
  return value;
};

const asCount = (value: unknown): number => {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error('control_live_invalid');
  }
  return value as number;
};

const asBoolean = (value: unknown): boolean => {
  if (typeof value !== 'boolean') throw new Error('control_live_invalid');
  return value;
};

const asNullableCount = (value: unknown): number | null => (
  value === null || value === undefined ? null : asCount(value)
);

export function parseControlLiveSnapshot(value: unknown): ControlLiveSnapshot {
  const payload = asRecord(value);
  const appointments = asRecord(payload.appointments);
  const establishments = asRecord(payload.establishments);
  const support = payload.support === null ? null : asRecord(payload.support);

  return {
    generatedAt: asTimestamp(payload.generated_at),
    timezone: asString(payload.timezone),
    appointments: {
      todayTotal: asCount(appointments.today_total),
      pending: asCount(appointments.pending),
      confirmed: asCount(appointments.confirmed),
      completed: asCount(appointments.completed),
      cancelled: asCount(appointments.cancelled),
      next60Minutes: asCount(appointments.next_60_minutes),
    },
    establishments: {
      active: asCount(establishments.active),
      pendingRequests: asCount(establishments.pending_requests),
    },
    support: support
      ? {
          runtimeEnabled: asBoolean(support.runtime_enabled),
          syncEnabled: asBoolean(support.sync_enabled),
          openQueue: asCount(support.open_queue),
          waitingUser: asCount(support.waiting_user),
          criticalOpen: asCount(support.critical_open),
          slaAtRisk: asCount(support.sla_at_risk),
          syncFailed: asCount(support.sync_failed),
          pendingOperations: asCount(support.pending_operations),
          oldestPendingMinutes: asNullableCount(support.oldest_pending_minutes),
        }
      : null,
  };
}

export async function loadControlLiveSnapshot(): Promise<ControlLiveSnapshot> {
  const result = await supabase.rpc('get_control_live_snapshot');
  if (result.error) throw new Error('control_live_unavailable');
  return parseControlLiveSnapshot(result.data);
}

const parseScope = (value: unknown): ControlLiveScope | null => {
  if (
    value === 'appointments'
    || value === 'establishments'
    || value === 'onboarding'
    || value === 'support'
  ) {
    return value;
  }
  return null;
};

export async function subscribeToControlLive({
  onInvalidate,
  onStateChange,
}: {
  onInvalidate: (scope: ControlLiveScope | null) => void;
  onStateChange?: (state: ControlLiveSubscriptionState) => void;
}): Promise<() => void> {
  onStateChange?.('connecting');
  const sessionResult = await supabase.auth.getSession();
  const accessToken = sessionResult.data.session?.access_token;
  if (sessionResult.error || !accessToken) {
    throw new Error('control_live_authentication_required');
  }

  await supabase.realtime.setAuth(accessToken);
  let channel: RealtimeChannel | null = supabase
    .channel('control:live', { config: { private: true } })
    .on('broadcast', { event: 'invalidate' }, (message) => {
      const payload = message?.payload;
      const scope = payload && typeof payload === 'object'
        ? parseScope((payload as JsonRecord).scope)
        : null;
      onInvalidate(scope);
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        onStateChange?.('connected');
      } else if (
        status === 'CHANNEL_ERROR'
        || status === 'TIMED_OUT'
        || status === 'CLOSED'
      ) {
        onStateChange?.('reconnecting');
      }
    });

  return () => {
    if (!channel) return;
    const subscribedChannel = channel;
    channel = null;
    void supabase.removeChannel(subscribedChannel);
  };
}
