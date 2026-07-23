import { sharedBrand } from '@cutsync/brand';
import { formatBookingDateLong, getBookingDateOptions } from '@cutsync/domain';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  DiscoveryLoading,
  DiscoveryMessage,
  discoveryColors,
  formatDiscoveryPrice,
} from '@/components/discovery/client-discovery-ui';
import {
  type ClientAvailableSlot,
  type ClientBookingOptions,
  createClientAppointment,
  loadClientBookingOptions,
  resolveClientBookingOffer,
} from '@/features/booking/client-booking-service';
import { useClientAvailability } from '@/features/booking/use-client-availability';

type BookingStep = 1 | 2 | 3 | 4;

const stepLabels: { step: BookingStep; label: string }[] = [
  { step: 1, label: 'Serviço' },
  { step: 2, label: 'Profissional' },
  { step: 3, label: 'Horário' },
  { step: 4, label: 'Revisão' },
];

const initialsOf = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'CS';
  return (parts[0][0] + (parts.at(-1)?.[0] ?? '')).toUpperCase();
};

export function ClientBookingScreen() {
  const params = useLocalSearchParams<{ slug?: string | string[]; serviceId?: string | string[] }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const initialServiceId = Array.isArray(params.serviceId) ? params.serviceId[0] : params.serviceId;
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [options, setOptions] = useState<ClientBookingOptions | null>(null);
  const [step, setStep] = useState<BookingStep>(1);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string | null>(null);
  const [selectedLocalDate, setSelectedLocalDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<ClientAvailableSlot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [isBooking, setIsBooking] = useState(false);
  const [bookingResult, setBookingResult] = useState<{ appointmentId: string; status: 'pending' | 'confirmed' } | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!slug) {
        setLoadError('Este estabelecimento não está disponível para agendamento.');
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setLoadError(null);
      try {
        const result = await loadClientBookingOptions(slug);
        if (!active) return;
        setOptions(result);
        if (result && initialServiceId && result.services.some((service) => service.id === initialServiceId)) {
          setSelectedServiceId(initialServiceId);
          setStep(2);
        }
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : 'Não foi possível preparar o agendamento.');
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [initialServiceId, slug]);

  const dateOptions = useMemo(
    () => options ? getBookingDateOptions(options.timezone, 14) : [],
    [options],
  );

  const eligibleProfessionals = useMemo(() => {
    if (!options || !selectedServiceId) return [];
    return options.professionals.filter((professional) => (
      resolveClientBookingOffer(options, selectedServiceId, professional.id) !== null
    ));
  }, [options, selectedServiceId]);

  const selectedOffer = useMemo(() => (
    options && selectedServiceId && selectedProfessionalId
      ? resolveClientBookingOffer(options, selectedServiceId, selectedProfessionalId)
      : null
  ), [options, selectedProfessionalId, selectedServiceId]);

  const availability = useClientAvailability({
    establishmentId: options?.establishmentId ?? null,
    professionalId: selectedProfessionalId,
    serviceId: selectedServiceId,
    localDate: bookingResult ? null : selectedLocalDate,
  });

  const moveTo = (nextStep: BookingStep) => {
    setStep(nextStep);
    setBookingError(null);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
  };

  const selectService = (serviceId: string) => {
    setSelectedServiceId(serviceId);
    setSelectedProfessionalId(null);
    setSelectedLocalDate(null);
    setSelectedSlot(null);
    moveTo(2);
  };

  const selectProfessional = (professionalId: string) => {
    setSelectedProfessionalId(professionalId);
    setSelectedLocalDate(dateOptions[0]?.localDate ?? null);
    setSelectedSlot(null);
    moveTo(3);
  };

  const selectDate = (localDate: string) => {
    setSelectedLocalDate(localDate);
    setSelectedSlot(null);
    setBookingError(null);
  };

  const selectTime = (slot: ClientAvailableSlot) => {
    setSelectedSlot(slot);
    moveTo(4);
  };

  const confirmBooking = async () => {
    if (!options || !selectedOffer || !selectedLocalDate || !selectedSlot) return;
    setBookingError(null);
    setIsBooking(true);
    try {
      const latestSlots = await availability.refresh();
      if (!latestSlots) throw new Error('Não foi possível confirmar a disponibilidade. Tente novamente.');
      const freshSlot = latestSlots.find((slot) => slot.startsAt === selectedSlot.startsAt);
      if (!freshSlot) {
        setSelectedSlot(null);
        moveTo(3);
        throw new Error('Este horário acabou de ser reservado. Escolha outro horário.');
      }
      const result = await createClientAppointment({
        establishmentId: options.establishmentId,
        professionalId: selectedOffer.professional.id,
        serviceId: selectedOffer.service.id,
        startsAt: freshSlot.startsAt,
      });
      setBookingResult(result);
    } catch (error) {
      setBookingError(error instanceof Error ? error.message : 'Não foi possível concluir o agendamento.');
    } finally {
      setIsBooking(false);
    }
  };

  if (isLoading) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.centeredContent} style={styles.page}>
        <StatusBar style="dark" />
        <DiscoveryLoading label="Preparando o agendamento…" />
      </ScrollView>
    );
  }

  if (loadError || !options) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.centeredContent} style={styles.page}>
        <StatusBar style="dark" />
        <DiscoveryMessage
          testID="client-booking-load-error"
          title="Agendamento indisponível"
          description={loadError || 'Este estabelecimento não está disponível para agendamento.'}
        />
      </ScrollView>
    );
  }

  if (bookingResult && selectedOffer && selectedLocalDate && selectedSlot) {
    const confirmed = bookingResult.status === 'confirmed';
    return (
      <ScrollView
        testID="client-booking-success"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.successContent}
        style={styles.page}
      >
        <StatusBar style="dark" />
        <View style={styles.successMark}><Text style={styles.successMarkText}>OK</Text></View>
        <View style={styles.successCopy}>
          <Text style={styles.eyebrow}>{confirmed ? 'HORÁRIO CONFIRMADO' : 'SOLICITAÇÃO ENVIADA'}</Text>
          <Text style={styles.successTitle}>{confirmed ? 'Seu horário está reservado.' : 'Seu pedido está em análise.'}</Text>
          <Text style={styles.description}>
            {confirmed
              ? 'O estabelecimento já confirmou este atendimento.'
              : 'Você verá a confirmação assim que o estabelecimento aceitar o pedido.'}
          </Text>
        </View>
        <View style={styles.summaryCard}>
          <SummaryRow label="Local" value={options.establishmentName} />
          <View style={styles.divider} />
          <SummaryRow label="Serviço" value={selectedOffer.service.name} />
          <View style={styles.divider} />
          <SummaryRow label="Profissional" value={selectedOffer.professional.name} />
          <View style={styles.divider} />
          <SummaryRow label="Data" value={formatBookingDateLong(selectedLocalDate)} />
          <View style={styles.divider} />
          <SummaryRow label="Horário" value={selectedSlot.localTime} />
        </View>
        <Text selectable testID="client-booking-appointment-id" style={styles.protocol}>
          Protocolo {bookingResult.appointmentId}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/')}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.primaryButtonText}>Voltar para o início</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      testID="client-booking-screen"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.page}
    >
      <StatusBar style="dark" />
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>NOVO AGENDAMENTO</Text>
        <Text style={styles.title}>{options.establishmentName}</Text>
        {!!options.establishmentAddress && <Text style={styles.description}>{options.establishmentAddress}</Text>}
      </View>

      <View accessibilityRole="tablist" style={styles.stepper}>
        {stepLabels.map((item) => {
          const enabled = item.step <= step;
          return (
            <Pressable
              key={item.step}
              accessibilityRole="tab"
              accessibilityState={{ selected: step === item.step, disabled: !enabled }}
              disabled={!enabled}
              onPress={() => moveTo(item.step)}
              style={[styles.step, step === item.step && styles.stepActive]}
            >
              <Text style={[styles.stepNumber, step === item.step && styles.stepNumberActive]}>{item.step}</Text>
              <Text numberOfLines={1} style={[styles.stepLabel, step === item.step && styles.stepLabelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {step === 1 && (
        <View style={styles.section}>
          <SectionHeading eyebrow="ETAPA 1 DE 4" title="Escolha o serviço" description="Preço e duração podem variar conforme o profissional." />
          {options.services.length === 0 ? (
            <DiscoveryMessage title="Serviços indisponíveis" description="Este estabelecimento ainda não possui serviços ativos." />
          ) : (
            <View testID="client-booking-services" style={styles.choiceList}>
              {options.services.map((service) => (
                <Pressable
                  key={service.id}
                  testID={'client-booking-service-' + service.id}
                  accessibilityRole="button"
                  onPress={() => selectService(service.id)}
                  style={({ pressed }) => [styles.choiceCard, pressed && styles.pressed]}
                >
                  <View style={styles.choiceCopy}>
                    <Text style={styles.choiceTitle}>{service.name}</Text>
                    <Text style={styles.choiceSubtitle}>{service.durationMinutes} minutos</Text>
                  </View>
                  <Text style={styles.choiceValue}>{formatDiscoveryPrice(service.price, options.currency)}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}

      {step === 2 && selectedServiceId && (
        <View style={styles.section}>
          <SectionHeading eyebrow="ETAPA 2 DE 4" title="Escolha o profissional" description="Mostramos somente quem atende o serviço selecionado." />
          {eligibleProfessionals.length === 0 ? (
            <DiscoveryMessage
              title="Nenhum profissional disponível"
              description="Volte e escolha outro serviço para continuar."
              actionLabel="Escolher outro serviço"
              onAction={() => moveTo(1)}
            />
          ) : (
            <View testID="client-booking-professionals" style={styles.choiceList}>
              {eligibleProfessionals.map((professional) => {
                const offer = resolveClientBookingOffer(options, selectedServiceId, professional.id);
                if (!offer) return null;
                return (
                  <Pressable
                    key={professional.id}
                    testID={'client-booking-professional-' + professional.id}
                    accessibilityRole="button"
                    onPress={() => selectProfessional(professional.id)}
                    style={({ pressed }) => [styles.choiceCard, pressed && styles.pressed]}
                  >
                    {professional.avatarUrl ? (
                      <Image accessibilityLabel={'Foto de ' + professional.name} contentFit="cover" source={{ uri: professional.avatarUrl }} style={styles.avatar} />
                    ) : (
                      <View style={styles.avatarFallback}><Text style={styles.avatarInitials}>{initialsOf(professional.name)}</Text></View>
                    )}
                    <View style={styles.choiceCopy}>
                      <Text style={styles.choiceTitle}>{professional.name}</Text>
                      <Text style={styles.choiceSubtitle}>{professional.title || professional.specialties || 'Profissional da equipe'}</Text>
                    </View>
                    <View style={styles.offerMeta}>
                      <Text style={styles.choiceValue}>{formatDiscoveryPrice(offer.price, options.currency)}</Text>
                      <Text style={styles.offerDuration}>{offer.durationMinutes} min</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      )}

      {step === 3 && selectedOffer && (
        <View style={styles.section}>
          <SectionHeading eyebrow="ETAPA 3 DE 4" title="Escolha data e horário" description="Os horários são consultados em tempo real na agenda do profissional." />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateList}>
            {dateOptions.map((date) => {
              const selected = date.localDate === selectedLocalDate;
              return (
                <Pressable
                  key={date.localDate}
                  testID={'client-booking-date-' + date.localDate}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => selectDate(date.localDate)}
                  style={[styles.dateCard, selected && styles.dateCardSelected]}
                >
                  <Text style={[styles.dateWeekday, selected && styles.dateTextSelected]}>{date.isToday ? 'Hoje' : date.weekdayLabel}</Text>
                  <Text style={[styles.dateDay, selected && styles.dateTextSelected]}>{date.dayLabel}</Text>
                  <Text style={[styles.dateMonth, selected && styles.dateTextSelected]}>{date.monthLabel}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View testID="client-booking-availability" style={styles.availabilityCard}>
            {!selectedLocalDate ? (
              <Text style={styles.helperText}>Escolha uma data para consultar a agenda.</Text>
            ) : availability.isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={sharedBrand.colors.forest} />
                <Text style={styles.helperText}>Atualizando horários…</Text>
              </View>
            ) : availability.error ? (
              <DiscoveryMessage
                testID="client-booking-availability-error"
                title="A agenda não carregou"
                description={availability.error}
                actionLabel="Tentar novamente"
                onAction={() => { void availability.refresh(); }}
              />
            ) : availability.slots.length === 0 ? (
              <Text testID="client-booking-availability-empty" style={styles.helperText}>{availability.emptyMessage}</Text>
            ) : (
              <SlotGroups slots={availability.slots} onSelect={selectTime} />
            )}
          </View>
          {!!bookingError && <Text testID="client-booking-error" accessibilityLiveRegion="polite" style={styles.errorText}>{bookingError}</Text>}
        </View>
      )}

      {step === 4 && selectedOffer && selectedLocalDate && selectedSlot && (
        <View testID="client-booking-review" style={styles.section}>
          <SectionHeading eyebrow="ETAPA 4 DE 4" title="Revise seu agendamento" description="A disponibilidade será conferida novamente ao confirmar." />
          <View style={styles.summaryCard}>
            <SummaryRow label="Local" value={options.establishmentName} />
            <View style={styles.divider} />
            <SummaryRow label="Serviço" value={selectedOffer.service.name} action="Alterar" onAction={() => moveTo(1)} />
            <View style={styles.divider} />
            <SummaryRow label="Profissional" value={selectedOffer.professional.name} action="Alterar" onAction={() => moveTo(2)} />
            <View style={styles.divider} />
            <SummaryRow label="Data" value={formatBookingDateLong(selectedLocalDate)} action="Alterar" onAction={() => moveTo(3)} />
            <View style={styles.divider} />
            <SummaryRow label="Horário" value={selectedSlot.localTime} />
            <View style={styles.divider} />
            <SummaryRow label="Duração" value={selectedOffer.durationMinutes + ' minutos'} />
            <View style={styles.divider} />
            <SummaryRow label="Total" value={formatDiscoveryPrice(selectedOffer.price, options.currency)} strong />
          </View>
          <View style={styles.statusNotice}>
            <Text style={styles.statusNoticeTitle}>
              {options.instantBookingEnabled ? 'Confirmação imediata' : 'Confirmação pelo estabelecimento'}
            </Text>
            <Text style={styles.statusNoticeText}>
              {options.instantBookingEnabled
                ? 'Ao confirmar, o horário será reservado imediatamente.'
                : 'Ao confirmar, o estabelecimento receberá uma solicitação para aprovar.'}
            </Text>
          </View>
          {!!bookingError && <Text testID="client-booking-error" accessibilityLiveRegion="polite" style={styles.errorText}>{bookingError}</Text>}
          <Pressable
            testID="client-booking-confirm"
            accessibilityRole="button"
            disabled={isBooking}
            onPress={() => { void confirmBooking(); }}
            style={({ pressed }) => [styles.primaryButton, isBooking && styles.disabled, pressed && !isBooking && styles.pressed]}
          >
            {isBooking ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Confirmar agendamento</Text>}
          </Pressable>
          <Text style={styles.safetyText}>Nenhuma cobrança é realizada pelo aplicativo nesta etapa.</Text>
        </View>
      )}
    </ScrollView>
  );
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionDescription}>{description}</Text>
    </View>
  );
}

function SummaryRow({ label, value, action, onAction, strong = false }: {
  label: string;
  value: string;
  action?: string;
  onAction?: () => void;
  strong?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <View style={styles.summaryCopy}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text selectable style={[styles.summaryValue, strong && styles.summaryValueStrong]}>{value}</Text>
      </View>
      {action && onAction && (
        <Pressable accessibilityRole="button" onPress={onAction} style={({ pressed }) => pressed && styles.pressed}>
          <Text style={styles.summaryAction}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

function SlotGroups({ slots, onSelect }: { slots: ClientAvailableSlot[]; onSelect: (slot: ClientAvailableSlot) => void }) {
  const groups = [
    { label: 'Manhã', slots: slots.filter((slot) => Number(slot.localTime.slice(0, 2)) < 12) },
    { label: 'Tarde', slots: slots.filter((slot) => {
      const hour = Number(slot.localTime.slice(0, 2));
      return hour >= 12 && hour < 18;
    }) },
    { label: 'Noite', slots: slots.filter((slot) => Number(slot.localTime.slice(0, 2)) >= 18) },
  ].filter((group) => group.slots.length > 0);

  return (
    <View testID="client-booking-slots" style={styles.slotGroups}>
      {groups.map((group) => (
        <View key={group.label} style={styles.slotGroup}>
          <Text style={styles.slotGroupLabel}>{group.label}</Text>
          <View style={styles.slotGrid}>
            {group.slots.map((slot) => (
              <Pressable
                key={slot.startsAt}
                testID={'client-booking-slot-' + slot.localTime}
                accessibilityRole="button"
                accessibilityLabel={'Selecionar ' + slot.localTime}
                onPress={() => onSelect(slot)}
                style={({ pressed }) => [styles.slotButton, pressed && styles.pressed]}
              >
                <Text style={styles.slotButtonText}>{slot.localTime}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: discoveryColors.background },
  centeredContent: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 52, gap: 22 },
  hero: { gap: 7 },
  eyebrow: { color: sharedBrand.colors.forest, fontSize: 9, fontWeight: '800', letterSpacing: 1.35, textTransform: 'uppercase' },
  title: { color: discoveryColors.text, fontSize: 29, lineHeight: 35, fontWeight: '700', letterSpacing: -0.7 },
  description: { color: discoveryColors.secondary, fontSize: 13, lineHeight: 20 },
  stepper: { flexDirection: 'row', gap: 6, backgroundColor: '#E7E3D8', borderRadius: 18, borderCurve: 'continuous', padding: 5 },
  step: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 14, borderCurve: 'continuous', paddingHorizontal: 4, paddingVertical: 8 },
  stepActive: { backgroundColor: '#FFFFFF', boxShadow: '0 3px 10px rgba(44, 67, 52, 0.08)' },
  stepNumber: { color: '#8B867B', fontSize: 10, fontWeight: '800' },
  stepNumberActive: { color: sharedBrand.colors.forest },
  stepLabel: { color: '#8B867B', fontSize: 9, fontWeight: '600' },
  stepLabelActive: { color: discoveryColors.text },
  section: { gap: 16 },
  sectionHeading: { gap: 6, paddingHorizontal: 2 },
  sectionTitle: { color: discoveryColors.text, fontSize: 25, lineHeight: 31, fontWeight: '700', letterSpacing: -0.5 },
  sectionDescription: { color: discoveryColors.secondary, fontSize: 13, lineHeight: 20 },
  choiceList: { gap: 11 },
  choiceCard: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#FFFFFF', borderRadius: 20, borderCurve: 'continuous', padding: 16, boxShadow: '0 7px 20px rgba(44, 67, 52, 0.06)' },
  choiceCopy: { flex: 1, gap: 5 },
  choiceTitle: { color: discoveryColors.text, fontSize: 15, fontWeight: '700' },
  choiceSubtitle: { color: discoveryColors.secondary, fontSize: 11, lineHeight: 16 },
  choiceValue: { color: sharedBrand.colors.forest, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  avatar: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#D9DDCF' },
  avatarFallback: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: sharedBrand.colors.forest },
  avatarInitials: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  offerMeta: { alignItems: 'flex-end', gap: 4 },
  offerDuration: { color: discoveryColors.muted, fontSize: 10 },
  dateList: { gap: 9, paddingRight: 8 },
  dateCard: { minWidth: 68, alignItems: 'center', gap: 3, borderWidth: 1, borderColor: discoveryColors.border, borderRadius: 18, borderCurve: 'continuous', backgroundColor: '#FFFFFF', paddingHorizontal: 11, paddingVertical: 12 },
  dateCardSelected: { borderColor: sharedBrand.colors.forest, backgroundColor: sharedBrand.colors.forest },
  dateWeekday: { color: discoveryColors.secondary, fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  dateDay: { color: discoveryColors.text, fontSize: 21, fontWeight: '800', fontVariant: ['tabular-nums'] },
  dateMonth: { color: discoveryColors.muted, fontSize: 10, textTransform: 'capitalize' },
  dateTextSelected: { color: '#FFFFFF' },
  availabilityCard: { minHeight: 110, gap: 16, backgroundColor: '#FFFFFF', borderRadius: 22, borderCurve: 'continuous', padding: 18 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18 },
  helperText: { color: discoveryColors.secondary, fontSize: 12, lineHeight: 19, textAlign: 'center', paddingVertical: 12 },
  slotGroups: { gap: 20 },
  slotGroup: { gap: 10 },
  slotGroupLabel: { color: '#7C7564', fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  slotButton: { minWidth: 72, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#CCD5C8', borderRadius: 14, borderCurve: 'continuous', backgroundColor: '#F4F7F1', paddingHorizontal: 13 },
  slotButtonText: { color: sharedBrand.colors.forest, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  summaryCard: { gap: 0, backgroundColor: '#FFFFFF', borderRadius: 24, borderCurve: 'continuous', paddingHorizontal: 18, boxShadow: '0 8px 24px rgba(44, 67, 52, 0.06)' },
  summaryRow: { minHeight: 67, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
  summaryCopy: { flex: 1, gap: 4 },
  summaryLabel: { color: discoveryColors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  summaryValue: { color: discoveryColors.text, fontSize: 13, lineHeight: 19 },
  summaryValueStrong: { color: sharedBrand.colors.forest, fontSize: 17, fontWeight: '800' },
  summaryAction: { color: sharedBrand.colors.forest, fontSize: 11, fontWeight: '800' },
  divider: { height: 1, backgroundColor: discoveryColors.border },
  statusNotice: { gap: 5, borderWidth: 1, borderColor: '#CBD7C8', borderRadius: 18, borderCurve: 'continuous', backgroundColor: '#E9EFE5', padding: 15 },
  statusNoticeTitle: { color: sharedBrand.colors.forest, fontSize: 13, fontWeight: '800' },
  statusNoticeText: { color: '#586558', fontSize: 11, lineHeight: 17 },
  primaryButton: { minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderCurve: 'continuous', backgroundColor: sharedBrand.colors.forest, paddingHorizontal: 18 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  errorText: { color: '#9A3D34', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  safetyText: { color: discoveryColors.muted, fontSize: 10, lineHeight: 16, textAlign: 'center' },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.65 },
  successContent: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 42, paddingBottom: 52, gap: 22 },
  successMark: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', borderRadius: 24, borderCurve: 'continuous', backgroundColor: sharedBrand.colors.forest },
  successMarkText: { color: '#FFFFFF', fontSize: 19, fontWeight: '800', letterSpacing: 1 },
  successCopy: { gap: 9 },
  successTitle: { color: discoveryColors.text, fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -0.9 },
  protocol: { color: discoveryColors.muted, fontSize: 10, lineHeight: 16, textAlign: 'center' },
});
