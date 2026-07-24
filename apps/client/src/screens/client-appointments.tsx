import { sharedBrand } from '@cutsync/brand';
import { partitionClientAppointments } from '@cutsync/domain';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';

import {
  AppointmentStateCard,
  ClientAppointmentCard,
  appointmentColors,
} from '@/components/appointments/client-appointment-ui';
import { ClientBrand } from '@/components/settings/client-settings-ui';
import { ClientButton } from '@/components/ui/client-ui';
import { useSession } from '@/contexts/session-context';
import { useClientAppointments } from '@/features/appointments/use-client-appointments';
import { performClientHaptic } from '@/features/experience/client-haptics';
import { clientTheme } from '@/theme/client-theme';

type AppointmentTab = 'upcoming' | 'history';

export function ClientAppointmentsScreen() {
  const router = useRouter();
  const { user } = useSession();
  const [tab, setTab] = useState<AppointmentTab>('upcoming');
  const query = useClientAppointments(user?.id ?? null);
  const groups = useMemo(() => partitionClientAppointments(query.appointments), [query.appointments]);
  const visible = tab === 'upcoming' ? groups.upcoming : groups.history;
  const selectTab = (nextTab: AppointmentTab) => {
    if (nextTab === tab) return;
    void performClientHaptic('selection');
    setTab(nextTab);
  };

  return (
    <ScrollView
      testID="client-appointments-screen"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      refreshControl={(
        <RefreshControl
          refreshing={query.isRefreshing}
          onRefresh={() => { void query.refresh(true); }}
          tintColor={sharedBrand.colors.forest}
        />
      )}
      showsVerticalScrollIndicator={false}
      style={styles.page}
    >
      <StatusBar style="dark" />
      <ClientBrand />

      <Animated.View
        entering={FadeInUp.duration(clientTheme.motion.standard)}
        style={styles.hero}
      >
        <Text style={styles.eyebrow}>SUA AGENDA</Text>
        <Text style={styles.title}>Seus horários, sempre por perto.</Text>
        <Text style={styles.description}>Acompanhe confirmações, próximos atendimentos e seu histórico.</Text>
      </Animated.View>

      <Animated.View
        accessibilityRole="tablist"
        entering={FadeIn.delay(clientTheme.motion.stagger).duration(clientTheme.motion.standard)}
        testID="client-appointments-tabs"
        style={styles.tabs}
      >
        <Pressable
          testID="client-appointments-upcoming-tab"
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'upcoming' }}
          onPress={() => selectTab('upcoming')}
          style={[styles.tab, tab === 'upcoming' && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === 'upcoming' && styles.tabTextActive]}>Próximos</Text>
          <Text style={[styles.tabCount, tab === 'upcoming' && styles.tabCountActive]}>{groups.upcoming.length}</Text>
        </Pressable>
        <Pressable
          testID="client-appointments-history-tab"
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'history' }}
          onPress={() => selectTab('history')}
          style={[styles.tab, tab === 'history' && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === 'history' && styles.tabTextActive]}>Histórico</Text>
          <Text style={[styles.tabCount, tab === 'history' && styles.tabCountActive]}>{groups.history.length}</Text>
        </Pressable>
      </Animated.View>

      {!!query.error && (
        <View testID="client-appointments-error" style={styles.errorNotice}>
          <Text selectable style={styles.errorText}>{query.error}</Text>
          <Pressable accessibilityRole="button" onPress={() => { void query.refresh(); }}>
            <Text style={styles.retryText}>Tentar novamente</Text>
          </Pressable>
        </View>
      )}

      {query.isLoading && query.appointments.length === 0 ? (
        <View testID="client-appointments-loading" style={styles.loadingCard}>
          <ActivityIndicator color={sharedBrand.colors.forest} />
          <Text style={styles.loadingText}>Carregando seus horários…</Text>
        </View>
      ) : visible.length === 0 ? (
        <View testID="client-appointments-empty">
          <AppointmentStateCard
            title={tab === 'upcoming' ? 'Nenhum horário marcado' : 'Seu histórico está vazio'}
            description={tab === 'upcoming'
              ? 'Encontre um estabelecimento e reserve seu próximo atendimento.'
              : 'Atendimentos concluídos e cancelados aparecerão aqui.'}
            action={tab === 'upcoming' ? (
              <ClientButton
                testID="client-appointments-explore"
                onPress={() => router.push('/explore')}
                label="Descobrir lugares"
                haptic="selection"
              />
            ) : undefined}
          />
        </View>
      ) : (
        <View testID="client-appointments-list" style={styles.list}>
          {visible.map((appointment, index) => (
            <ClientAppointmentCard
              key={appointment.id}
              appointment={appointment}
              featured={tab === 'upcoming' && index === 0}
              onPress={() => router.push({
                pathname: '/appointments/[id]',
                params: { id: appointment.id },
              })}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: appointmentColors.background },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 52, gap: 20 },
  hero: { gap: 10, paddingTop: 26 },
  eyebrow: { color: sharedBrand.colors.forest, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  title: { maxWidth: 520, color: appointmentColors.text, fontSize: 38, lineHeight: 42, fontWeight: '800', letterSpacing: -1.2 },
  description: { color: appointmentColors.secondary, fontSize: 14, lineHeight: 22 },
  tabs: { flexDirection: 'row', gap: 6, borderRadius: 18, borderCurve: 'continuous', backgroundColor: '#EFE9D9', padding: 5 },
  tab: { minHeight: 48, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, borderCurve: 'continuous' },
  tabActive: { backgroundColor: '#FFFFFF', boxShadow: '0 4px 10px rgba(20, 27, 23, 0.06)' },
  tabText: { color: appointmentColors.muted, fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: appointmentColors.text },
  tabCount: { minWidth: 22, color: appointmentColors.muted, fontSize: 10, fontWeight: '900', textAlign: 'center', borderRadius: 999, backgroundColor: '#E0DBCC', paddingHorizontal: 6, paddingVertical: 4, fontVariant: ['tabular-nums'] },
  tabCountActive: { color: '#FFFFFF', backgroundColor: sharedBrand.colors.forest },
  list: { gap: 14 },
  loadingCard: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 12, borderRadius: 26, backgroundColor: appointmentColors.card },
  loadingText: { color: appointmentColors.secondary, fontSize: 13 },
  errorNotice: { gap: 10, borderWidth: 1, borderColor: '#E8C4BE', borderRadius: 18, borderCurve: 'continuous', backgroundColor: '#FFF7F5', padding: 16 },
  errorText: { color: '#8E2F26', fontSize: 12, lineHeight: 18 },
  retryText: { color: sharedBrand.colors.forest, fontSize: 12, fontWeight: '800' },
});
