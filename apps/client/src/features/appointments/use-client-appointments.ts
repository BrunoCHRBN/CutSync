import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { supabase } from '@/lib/supabase';
import {
  type ClientAppointment,
  listClientAppointments,
  loadClientAppointment,
} from './client-appointments-service';

export function useClientAppointments(clientId: string | null) {
  const requestSequence = useRef(0);
  const hasLoaded = useRef(false);
  const [appointments, setAppointments] = useState<ClientAppointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (manual = false) => {
    const sequence = ++requestSequence.current;
    if (manual) setIsRefreshing(true);
    else if (!hasLoaded.current) setIsLoading(true);
    setError(null);
    try {
      const result = await listClientAppointments();
      if (sequence === requestSequence.current) setAppointments(result);
      return result;
    } catch (nextError) {
      if (sequence === requestSequence.current) {
        setError(nextError instanceof Error ? nextError.message : 'Não foi possível carregar seus agendamentos.');
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
    if (clientId) void refresh();
  }, [clientId, refresh]));

  useEffect(() => {
    if (!clientId || !supabase) return undefined;
    const channel = supabase
      .channel(`client-mobile-appointments-${clientId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'appointments',
        filter: `client_id=eq.${clientId}`,
      }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [clientId, refresh]);

  useEffect(() => {
    if (!clientId) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [clientId, refresh]);

  return { appointments, isLoading, isRefreshing, error, refresh };
}

export function useClientAppointment(appointmentId: string | null, clientId: string | null) {
  const requestSequence = useRef(0);
  const [appointment, setAppointment] = useState<ClientAppointment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!appointmentId) {
      setAppointment(null);
      setIsLoading(false);
      return null;
    }
    const sequence = ++requestSequence.current;
    setError(null);
    setIsLoading(true);
    try {
      const result = await loadClientAppointment(appointmentId);
      if (sequence === requestSequence.current) setAppointment(result);
      return result;
    } catch (nextError) {
      if (sequence === requestSequence.current) {
        setError(nextError instanceof Error ? nextError.message : 'Não foi possível carregar este atendimento.');
      }
      return null;
    } finally {
      if (sequence === requestSequence.current) setIsLoading(false);
    }
  }, [appointmentId]);

  useFocusEffect(useCallback(() => {
    if (clientId && appointmentId) void refresh();
  }, [appointmentId, clientId, refresh]));

  useEffect(() => {
    if (!appointmentId || !clientId || !supabase) return undefined;
    const channel = supabase
      .channel(`client-mobile-appointment-${appointmentId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'appointments',
        filter: `id=eq.${appointmentId}`,
      }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [appointmentId, clientId, refresh]);

  return { appointment, isLoading, error, refresh };
}
