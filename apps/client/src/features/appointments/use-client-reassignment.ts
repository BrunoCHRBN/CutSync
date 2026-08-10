import type {
  BusinessReassignmentCandidate,
  ClientReassignmentDecision,
  ClientReassignmentDetail,
  MobileSyncStatus,
} from '@cutsync/database';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { createMobileRequestId } from '@/lib/mobile-request-id';

import {
  ClientReassignmentApiError,
  decideClientReassignment,
  listClientReassignmentCandidates,
  listClientReassignmentDecisions,
  loadClientReassignmentDetail,
  type ClientDecisionAction,
} from './client-reassignment-service';
import {
  enqueueClientReassignmentCommand,
  loadClientReassignmentOutbox,
  markClientReassignmentCommand,
  removeClientReassignmentCommand,
  replayClientReassignmentOutbox,
} from './client-reassignment-outbox';

const messageFrom = (error: unknown) => (
  error instanceof Error ? error.message : 'Não foi possível carregar esta decisão.'
);

export function useClientReassignmentDecisions(clientId: string | null) {
  const sequence = useRef(0);
  const loaded = useRef(false);
  const [decisions, setDecisions] = useState<ClientReassignmentDecision[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (manual = false) => {
    const current = ++sequence.current;
    if (manual) setIsRefreshing(true);
    else if (!loaded.current) setIsLoading(true);
    setError(null);
    try {
      if (clientId) await replayClientReassignmentOutbox(clientId);
      const result = await listClientReassignmentDecisions();
      if (current === sequence.current) setDecisions(result);
      return result;
    } catch (nextError) {
      if (current === sequence.current) setError(messageFrom(nextError));
      return null;
    } finally {
      if (current === sequence.current) {
        loaded.current = true;
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [clientId]);

  useFocusEffect(useCallback(() => {
    if (clientId) void refresh();
  }, [clientId, refresh]));

  useEffect(() => {
    if (!clientId) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [clientId, refresh]);

  return { decisions, isLoading, isRefreshing, error, refresh };
}

export function useClientReassignmentDetail(
  appointmentId: string | null,
  clientId: string | null,
) {
  const sequence = useRef(0);
  const [detail, setDetail] = useState<ClientReassignmentDetail | null>(null);
  const [candidates, setCandidates] = useState<BusinessReassignmentCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<MobileSyncStatus>('local_draft');

  const refreshOutboxStatus = useCallback(async () => {
    if (!clientId || !appointmentId) return null;
    const entries = await loadClientReassignmentOutbox(clientId);
    const pending = entries.find((entry) => entry.appointmentId === appointmentId);
    if (pending) setSyncStatus(pending.status);
    return pending ?? null;
  }, [appointmentId, clientId]);

  const refresh = useCallback(async () => {
    if (!appointmentId) {
      setDetail(null);
      setIsLoading(false);
      return null;
    }
    const current = ++sequence.current;
    setError(null);
    setIsLoading(true);
    try {
      const result = await loadClientReassignmentDetail(appointmentId);
      if (current === sequence.current) setDetail(result);
      return result;
    } catch (nextError) {
      if (current === sequence.current) setError(messageFrom(nextError));
      return null;
    } finally {
      if (current === sequence.current) setIsLoading(false);
    }
  }, [appointmentId]);

  const loadCandidates = useCallback(async () => {
    if (!detail) return [];
    setIsLoadingCandidates(true);
    setCommandError(null);
    try {
      const result = await listClientReassignmentCandidates(detail.reassignmentRequestId);
      setCandidates(result);
      return result;
    } catch (nextError) {
      setCommandError(messageFrom(nextError));
      return [];
    } finally {
      setIsLoadingCandidates(false);
    }
  }, [detail]);

  const submitDecision = useCallback(async (
    decision: ClientDecisionAction,
    chosenProfessionalId?: string,
  ) => {
    if (!clientId || !detail || !detail.allowedActions.includes(decision)) return null;
    const entry = await enqueueClientReassignmentCommand({
      userId: clientId,
      appointmentId: detail.appointmentId,
      reassignmentRequestId: detail.reassignmentRequestId,
      decision,
      chosenProfessionalId,
      expectedVersion: detail.version,
      requestId: createMobileRequestId(),
      correlationId: detail.correlationId,
    });
    setCommandError(null);
    setSyncStatus('syncing');
    try {
      const receipt = await decideClientReassignment({
        reassignmentRequestId: entry.reassignmentRequestId,
        decision: entry.decision,
        chosenProfessionalId: entry.chosenProfessionalId,
        expectedVersion: entry.expectedVersion,
        requestId: entry.requestId,
      });
      await removeClientReassignmentCommand(clientId, entry.requestId);
      setSyncStatus(receipt.status === 'manual_review' ? 'manual_review' : 'server_confirmed');
      await refresh();
      return receipt;
    } catch (nextError) {
      const conflict = nextError instanceof ClientReassignmentApiError
        && nextError.code === 'conflict';
      const offline = nextError instanceof ClientReassignmentApiError
        && nextError.code === 'network';
      if (offline) {
        await markClientReassignmentCommand(
          clientId, entry.requestId, 'offline_pending', entry.attempts + 1, messageFrom(nextError),
        );
      } else if (conflict) {
        await removeClientReassignmentCommand(clientId, entry.requestId);
      } else {
        await markClientReassignmentCommand(
          clientId, entry.requestId, 'manual_review', entry.attempts + 1, messageFrom(nextError),
        );
      }
      setSyncStatus(offline ? 'offline_pending' : conflict ? 'conflict' : 'manual_review');
      setCommandError(messageFrom(nextError));
      if (conflict) await refresh();
      return null;
    }
  }, [clientId, detail, refresh]);

  const replayPending = useCallback(async () => {
    if (!clientId) return null;
    const result = await replayClientReassignmentOutbox(clientId);
    if (result.pending > 0) setSyncStatus('offline_pending');
    else if (result.conflicts > 0) setSyncStatus('conflict');
    else if (result.manualReview > 0) setSyncStatus('manual_review');
    else if (result.confirmed > 0) setSyncStatus('server_confirmed');
    await refresh();
    await refreshOutboxStatus();
    return result;
  }, [clientId, refresh, refreshOutboxStatus]);

  useFocusEffect(useCallback(() => {
    if (clientId && appointmentId) void replayPending();
  }, [appointmentId, clientId, replayPending]));

  useEffect(() => {
    if (!clientId || !appointmentId) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void replayPending();
    });
    return () => subscription.remove();
  }, [appointmentId, clientId, replayPending]);

  return {
    detail,
    candidates,
    isLoading,
    isLoadingCandidates,
    error,
    commandError,
    syncStatus,
    refresh,
    replayPending,
    loadCandidates,
    submitDecision,
  };
}
