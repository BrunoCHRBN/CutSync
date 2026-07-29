import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { supabase } from '@/lib/supabase';
import {
  type ClientSupportCapabilities,
  type ClientSupportTicket,
  type ClientSupportTicketDetail,
  listClientSupportTickets,
  loadClientSupportCapabilities,
  loadClientSupportTicket,
} from './client-support-service';

export function useClientSupportCapabilities() {
  const [capabilities, setCapabilities] = useState<ClientSupportCapabilities | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await loadClientSupportCapabilities();
      setCapabilities(result);
      return result;
    } catch (nextError) {
      setError(nextError instanceof Error
        ? nextError.message
        : 'Não foi possível consultar a disponibilidade do suporte.');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  return { capabilities, isLoading, error, refresh };
}

export function useClientSupportTickets(userId: string | null) {
  const channelInstanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const requestSequence = useRef(0);
  const hasLoaded = useRef(false);
  const [tickets, setTickets] = useState<ClientSupportTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (manual = false) => {
    const sequence = ++requestSequence.current;
    if (manual) setIsRefreshing(true);
    else if (!hasLoaded.current) setIsLoading(true);
    setError(null);
    try {
      const result = await listClientSupportTickets();
      if (sequence === requestSequence.current) setTickets(result);
      return result;
    } catch (nextError) {
      if (sequence === requestSequence.current) {
        setError(nextError instanceof Error
          ? nextError.message
          : 'Não foi possível carregar seus chamados.');
      }
      return null;
    } finally {
      if (sequence === requestSequence.current) {
        hasLoaded.current = true;
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(useCallback(() => {
    if (userId) void refresh();
  }, [refresh, userId]));

  useEffect(() => {
    if (!userId || !supabase) return undefined;
    const channel = supabase
      .channel(`client-support-tickets-${userId}-${channelInstanceId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'support_tickets',
      }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [channelInstanceId, refresh, userId]);

  useEffect(() => {
    if (!userId) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh, userId]);

  return { tickets, isLoading, isRefreshing, error, refresh };
}

export function useClientSupportTicket(
  ticketId: string | null,
  userId: string | null,
) {
  const channelInstanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const requestSequence = useRef(0);
  const hasLoaded = useRef(false);
  const [detail, setDetail] = useState<ClientSupportTicketDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (manual = false) => {
    if (!ticketId) {
      setDetail(null);
      setIsLoading(false);
      return null;
    }
    const sequence = ++requestSequence.current;
    if (manual) setIsRefreshing(true);
    else if (!hasLoaded.current) setIsLoading(true);
    setError(null);
    try {
      const result = await loadClientSupportTicket(ticketId);
      if (sequence === requestSequence.current) setDetail(result);
      return result;
    } catch (nextError) {
      if (sequence === requestSequence.current) {
        setError(nextError instanceof Error
          ? nextError.message
          : 'Não foi possível carregar este chamado.');
      }
      return null;
    } finally {
      if (sequence === requestSequence.current) {
        hasLoaded.current = true;
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [ticketId]);

  useFocusEffect(useCallback(() => {
    if (ticketId && userId) void refresh();
  }, [refresh, ticketId, userId]));

  useEffect(() => {
    if (!ticketId || !userId || !supabase) return undefined;
    const channel = supabase
      .channel(`client-support-ticket-${ticketId}-${channelInstanceId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'support_tickets',
        filter: `id=eq.${ticketId}`,
      }, () => { void refresh(); })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'support_messages',
        filter: `ticket_id=eq.${ticketId}`,
      }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [channelInstanceId, refresh, ticketId, userId]);

  useEffect(() => {
    if (!ticketId || !userId) return undefined;
    const timer = setInterval(() => { void refresh(); }, 30_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [refresh, ticketId, userId]);

  return {
    detail,
    ticket: detail?.ticket ?? null,
    messages: detail?.messages ?? [],
    isLoading,
    isRefreshing,
    error,
    refresh,
  };
}
