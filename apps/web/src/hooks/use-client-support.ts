import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { supabase } from '../services/supabase';
import {
  type ClientSupportCapabilities,
  type ClientSupportTicket,
  type ClientSupportTicketDetail,
  listClientSupportTickets,
  loadClientSupportCapabilities,
  loadClientSupportTicket,
} from '../services/client-support';

export const useClientSupportCapabilities = () => {
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
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
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
};

export const useClientSupportTickets = (userId: string | null) => {
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const sequence = useRef(0);
  const [tickets, setTickets] = useState<ClientSupportTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    setError(null);
    try {
      const result = await listClientSupportTickets();
      if (current === sequence.current) setTickets(result);
      return result;
    } catch (cause) {
      if (current === sequence.current) {
        setError(cause instanceof Error ? cause.message : 'Não foi possível carregar seus chamados.');
      }
      return null;
    } finally {
      if (current === sequence.current) setIsLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    if (userId) void refresh();
  }, [refresh, userId]));

  useEffect(() => {
    if (!userId) return undefined;
    const channel = supabase
      .channel(`web-client-support-${userId}-${instanceId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'support_tickets',
      }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [instanceId, refresh, userId]);

  return { tickets, isLoading, error, refresh };
};

export const useClientSupportTicket = (
  ticketId: string | null,
  userId: string | null,
) => {
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const sequence = useRef(0);
  const [detail, setDetail] = useState<ClientSupportTicketDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!ticketId) {
      setDetail(null);
      setIsLoading(false);
      return null;
    }
    const current = ++sequence.current;
    setError(null);
    try {
      const result = await loadClientSupportTicket(ticketId);
      if (current === sequence.current) setDetail(result);
      return result;
    } catch (cause) {
      if (current === sequence.current) {
        setError(cause instanceof Error ? cause.message : 'Não foi possível carregar este chamado.');
      }
      return null;
    } finally {
      if (current === sequence.current) setIsLoading(false);
    }
  }, [ticketId]);

  useFocusEffect(useCallback(() => {
    if (ticketId && userId) void refresh();
  }, [refresh, ticketId, userId]));

  useEffect(() => {
    if (!ticketId || !userId) return undefined;
    const channel = supabase
      .channel(`web-client-support-ticket-${ticketId}-${instanceId}`)
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
    return () => { void supabase.removeChannel(channel); };
  }, [instanceId, refresh, ticketId, userId]);

  useEffect(() => {
    if (!ticketId || !userId) return undefined;
    const timer = setInterval(() => { void refresh(); }, 30_000);
    return () => clearInterval(timer);
  }, [refresh, ticketId, userId]);

  return {
    detail,
    ticket: detail?.ticket ?? null,
    messages: detail?.messages ?? [],
    isLoading,
    error,
    refresh,
  };
};
