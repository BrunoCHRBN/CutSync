import type { MobileSyncStatus } from '@cutsync/database';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useBusinessOperational } from '@/contexts/business-operational-context';
import { useBusinessSession } from '@/contexts/business-session';
import { hasBusinessDecisionsNavigation } from '@/features/access/business-access';
import { createBusinessQueryKey } from '@/features/connectivity/business-query';
import { businessApi, BusinessApiError } from '@/services/business-api';

import {
  enqueueBusinessDecisionCommand,
  executeBusinessDecisionCommand,
  markBusinessDecisionCommand,
  removeBusinessDecisionCommand,
  replayBusinessDecisionOutbox,
} from './business-decision-outbox';

export type BusinessDecisionCommand =
  | { action: 'validate'; expectedVersion: number; requestId: string; correlationId: string }
  | { action: 'apply'; expectedVersion: number; requestId: string; correlationId: string }
  | { action: 'propose'; expectedVersion: number; requestId: string; correlationId: string; professionalId: string }
  | { action: 'withdraw'; expectedVersion: number; requestId: string; correlationId: string; reason: string };

export type BusinessDecisionCommandIntent =
  | { action: 'validate' }
  | { action: 'apply' }
  | { action: 'propose'; professionalId: string }
  | { action: 'withdraw'; reason: string };

export function useBusinessDecisionQueue() {
  const { user } = useBusinessSession();
  const { activeContext } = useBusinessOperational();
  const userId = user?.id ?? 'signed-out';
  const establishmentId = activeContext?.establishmentId ?? 'none';
  const canView = hasBusinessDecisionsNavigation(activeContext?.capabilities);

  return useQuery({
    queryKey: createBusinessQueryKey(userId, establishmentId, 'decisions', 'queue'),
    enabled: Boolean(user && activeContext && canView),
    queryFn: () => businessApi.listDecisionQueue(establishmentId),
  });
}

export function useBusinessReassignmentDetail(reassignmentRequestId: string) {
  const { user } = useBusinessSession();
  const { activeContext } = useBusinessOperational();
  const userId = user?.id ?? 'signed-out';
  const establishmentId = activeContext?.establishmentId ?? 'none';
  const canView = hasBusinessDecisionsNavigation(activeContext?.capabilities);

  return useQuery({
    queryKey: createBusinessQueryKey(
      userId, establishmentId, 'decisions', 'detail', reassignmentRequestId,
    ),
    enabled: Boolean(user && activeContext && canView && reassignmentRequestId),
    queryFn: () => businessApi.getReassignmentDetail(establishmentId, reassignmentRequestId),
  });
}

export function useBusinessReassignmentCandidates(
  reassignmentRequestId: string,
  enabled: boolean,
) {
  const { user } = useBusinessSession();
  const { activeContext, hasCapability } = useBusinessOperational();
  const userId = user?.id ?? 'signed-out';
  const establishmentId = activeContext?.establishmentId ?? 'none';

  return useQuery({
    queryKey: createBusinessQueryKey(
      userId, establishmentId, 'decisions', 'candidates', reassignmentRequestId,
    ),
    enabled: Boolean(
      enabled && user && activeContext && hasCapability('apply_appointment_reassignment'),
    ),
    queryFn: () => businessApi.listReassignmentCandidates(
      establishmentId,
      reassignmentRequestId,
    ),
  });
}

export function useBusinessDecisionCommand(reassignmentRequestId: string) {
  const queryClient = useQueryClient();
  const { user } = useBusinessSession();
  const { activeContext } = useBusinessOperational();
  const userId = user?.id ?? 'signed-out';
  const establishmentId = activeContext?.establishmentId ?? 'none';
  const [syncStatus, setSyncStatus] = useState<MobileSyncStatus>('local_draft');

  const invalidateDecisionReads = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: createBusinessQueryKey(userId, establishmentId, 'decisions'),
      }),
      queryClient.invalidateQueries({
        queryKey: createBusinessQueryKey(userId, establishmentId, 'agenda'),
      }),
    ]);
  }, [establishmentId, queryClient, userId]);

  const mutation = useMutation({
    mutationFn: async (command: BusinessDecisionCommand) => {
      if (!user || !activeContext) throw new BusinessApiError('unauthorized');
      const entry = await enqueueBusinessDecisionCommand({
        userId: user.id,
        establishmentId: activeContext.establishmentId,
        reassignmentRequestId,
        action: command.action,
        professionalId: command.action === 'propose' ? command.professionalId : null,
        reason: command.action === 'withdraw' ? command.reason.trim() : null,
        expectedVersion: command.expectedVersion,
        requestId: command.requestId,
        correlationId: command.correlationId,
      });
      setSyncStatus('syncing');
      try {
        const receipt = await executeBusinessDecisionCommand(entry);
        await removeBusinessDecisionCommand(user.id, entry.requestId);
        setSyncStatus(receipt.status === 'manual_review' ? 'manual_review' : 'server_confirmed');
        return receipt;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível confirmar a ação.';
        const offline = error instanceof BusinessApiError && error.code === 'network_error';
        const conflict = error instanceof BusinessApiError && [
          'decision_conflict',
          'decision_invalid_transition',
          'decision_candidate_unavailable',
          'decision_idempotency_conflict',
        ].includes(error.code);
        if (offline) {
          await markBusinessDecisionCommand(
            user.id, entry.requestId, 'offline_pending', entry.attempts + 1, message,
          );
        } else if (conflict) {
          await removeBusinessDecisionCommand(user.id, entry.requestId);
          await invalidateDecisionReads();
        } else {
          await markBusinessDecisionCommand(
            user.id, entry.requestId, 'manual_review', entry.attempts + 1, message,
          );
        }
        setSyncStatus(offline ? 'offline_pending' : conflict ? 'conflict' : 'manual_review');
        throw error;
      }
    },
    onSuccess: invalidateDecisionReads,
  });

  const replayPending = useCallback(async () => {
    if (!user || !activeContext) return null;
    const result = await replayBusinessDecisionOutbox(
      user.id,
      activeContext.establishmentId,
      reassignmentRequestId,
    );
    if (result.pendingRequestIds.includes(reassignmentRequestId)) setSyncStatus('offline_pending');
    else if (result.conflictRequestIds.includes(reassignmentRequestId)) setSyncStatus('conflict');
    else if (result.manualReviewRequestIds.includes(reassignmentRequestId)) setSyncStatus('manual_review');
    else if (result.confirmedRequestIds.includes(reassignmentRequestId)) setSyncStatus('server_confirmed');
    if (result.confirmed > 0 || result.conflicts > 0) await invalidateDecisionReads();
    return result;
  }, [activeContext, invalidateDecisionReads, reassignmentRequestId, user]);

  useFocusEffect(useCallback(() => {
    if (user && activeContext) void replayPending();
  }, [activeContext, replayPending, user]));

  useEffect(() => {
    if (!user || !activeContext) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void replayPending();
    });
    return () => subscription.remove();
  }, [activeContext, replayPending, user]);

  return { ...mutation, syncStatus, replayPending };
}
