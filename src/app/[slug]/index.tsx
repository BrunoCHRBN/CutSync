import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, Modal, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ArrowRight, Clock3, Coins, Instagram, MapPin, Phone, Scissors, Store, UsersRound, X } from 'lucide-react-native';
import { useEstablishment } from '../../hooks/useEstablishment';
import { useServices } from '../../hooks/useServices';
import { usePublicTeam } from '../../hooks/usePublicTeam';
import { ProfileRecord } from '../../types/database';
import { AppButton } from '../../components/ui/AppButton';
import { EmptyState } from '../../components/ui/EmptyState';
import { ScreenBackground } from '../../components/ui/ScreenBackground';
import { SectionHeading } from '../../components/ui/SectionHeading';
import { atmosphericShadow, colors, glassSurface, layout, radii, typography } from '../../theme/tokens';
import { initialsOf, readableForeground } from '../../theme/color';
import { tapLight } from '../../utils/haptics';

function BarbershopProfileSkeleton() {
  return (
    <ScreenBackground testID="barbershop-profile-skeleton" style={{ backgroundColor: colors.canvas }}>
      <View style={[styles.topbar, { opacity: 0.6 }]}>
        <View style={[styles.backButton, { backgroundColor: colors.surfaceRaised, borderWidth: 0 }]} />
        <View style={{ width: 140, height: 18, backgroundColor: colors.surfaceRaised, borderRadius: 4 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} scrollEnabled={false}>
        <View style={[styles.heroContainer, { backgroundColor: colors.surfaceRaised }]} />
        <View style={styles.heroCopy}>
          <View style={styles.brandContainer}>
            <View style={[styles.logoCircle, { backgroundColor: colors.surfaceRaised }]} />
            <View style={[styles.titleInfo, { gap: 8 }]}>
              <View style={{ width: 220, height: 26, backgroundColor: colors.surfaceRaised, borderRadius: 4 }} />
              <View style={{ width: 150, height: 14, backgroundColor: colors.surfaceRaised, borderRadius: 4 }} />
              <View style={{ width: '100%', height: 40, backgroundColor: colors.surfaceRaised, borderRadius: 6, marginTop: 4 }} />
            </View>
          </View>
        </View>
        <View style={styles.infoGrid}>
          <View style={[styles.infoItem, { height: 60, backgroundColor: colors.surfaceRaised }]} />
          <View style={[styles.infoItem, { height: 60, backgroundColor: colors.surfaceRaised }]} />
          <View style={[styles.infoItem, { height: 60, backgroundColor: colors.surfaceRaised }]} />
        </View>
        <View style={styles.section}>
          <View style={{ width: 100, height: 20, backgroundColor: colors.surfaceRaised, borderRadius: 4 }} />
          <View style={styles.cardsGrid}>
            <View style={[styles.serviceCard, { height: 120, backgroundColor: colors.surfaceRaised }]} />
            <View style={[styles.serviceCard, { height: 120, backgroundColor: colors.surfaceRaised }]} />
            <View style={[styles.serviceCard, { height: 120, backgroundColor: colors.surfaceRaised }]} />
          </View>
        </View>
      </ScrollView>
    </ScreenBackground>
  );
}

export default function BarbershopSlugScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const router = useRouter();

  const { establishment: barbershop, loading } = useEstablishment(slug, 'slug');
  const { services } = useServices(barbershop?.id, true);
  const { team: barbers } = usePublicTeam(barbershop?.id);
  const [selectedTeamMember, setSelectedTeamMember] = useState<ProfileRecord | null>(null);

  // Parse da galeria personalizada cadastrada pelo dono
  const galleryPhotos = useMemo(() => {
    if (!barbershop?.galleryUrls) return [];
    try {
      const parsed = JSON.parse(barbershop.galleryUrls);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return String(barbershop.galleryUrls).split(',').map(s => s.trim()).filter(Boolean);
    }
  }, [barbershop?.galleryUrls]);

  const goBack = () => router.canGoBack() ? router.back() : router.replace('/(client)');
  
  const currency = (value: number) => new Intl.NumberFormat('pt-BR', { 
    style: 'currency', 
    currency: barbershop?.currency || 'BRL' 
  }).format(value);

  // Cálculo de Status em Tempo Real
  const statusInfo = useMemo(() => {
    if (!barbershop?.openingHours) return { isOpen: false, text: '' };
    try {
      const schedule = JSON.parse(barbershop.openingHours);
      const now = new Date();
      const day = now.getDay();
      const todaySchedule = schedule.find((s: any) => s.day === day);

      if (!todaySchedule || !todaySchedule.isOpen) {
        let nextDay = (day + 1) % 7;
        let nextSchedule = schedule.find((s: any) => s.day === nextDay);
        let daysCount = 1;
        while ((!nextSchedule || !nextSchedule.isOpen) && daysCount < 7) {
          nextDay = (nextDay + 1) % 7;
          nextSchedule = schedule.find((s: any) => s.day === nextDay);
          daysCount++;
        }
        if (nextSchedule && nextSchedule.isOpen) {
          const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
          const dayLabel = daysCount === 1 ? 'amanhã' : `na ${dayNames[nextDay]}`;
          return { isOpen: false, text: `Abre ${dayLabel} às ${nextSchedule.open}` };
        }
        return { isOpen: false, text: 'Fechado hoje' };
      }

      const [openH, openM] = todaySchedule.open.split(':').map(Number);
      const [closeH, closeM] = todaySchedule.close.split(':').map(Number);

      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const openMinutes = openH * 60 + openM;
      const closeMinutes = closeH * 60 + closeM;

      if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
        return { isOpen: true, text: `Até às ${todaySchedule.close}` };
      }
      
      if (currentMinutes < openMinutes) {
        return { isOpen: false, text: `Abre hoje às ${todaySchedule.open}` };
      }
      
      let nextDay = (day + 1) % 7;
      let nextSchedule = schedule.find((s: any) => s.day === nextDay);
      let daysCount = 1;
      while ((!nextSchedule || !nextSchedule.isOpen) && daysCount < 7) {
        nextDay = (nextDay + 1) % 7;
        nextSchedule = schedule.find((s: any) => s.day === nextDay);
        daysCount++;
      }
      if (nextSchedule && nextSchedule.isOpen) {
        const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
        const dayLabel = daysCount === 1 ? 'amanhã' : `na ${dayNames[nextDay]}`;
        return { isOpen: false, text: `Abre ${dayLabel} às ${nextSchedule.open}` };
      }

      return { isOpen: false, text: '' };
    } catch {
      return { isOpen: false, text: '' };
    }
  }, [barbershop?.openingHours]);

  if (loading) {
    return <BarbershopProfileSkeleton />;
  }

  if (!barbershop) {
    return (
      <ScreenBackground testID="barbershop-profile-not-found" style={styles.center}>
        <EmptyState 
          testID="barbershop-profile-error" 
          title="Estabelecimento não encontrado" 
          description="Este perfil pode ter sido removido ou o endereço está incorreto." 
          icon={<Store color={colors.textSecondary} size={22} strokeWidth={1.6} />} 
          action={<AppButton label="Voltar" testID="barbershop-profile-error-back-button" onPress={goBack} />} 
        />
      </ScreenBackground>
    );
  }

  const accent = barbershop.primaryColor || colors.accent;
  const accentFg = readableForeground(accent);
  const goBooking = () => { tapLight(); router.push(`/salon/${slug}/booking` as never); };

  return (
    <ScreenBackground testID="barbershop-profile-screen">
      <View style={styles.topbar}>
        <Pressable testID="barbershop-profile-back-button" onPress={goBack} style={({ pressed }) => [styles.backButton, pressed && styles.pressedScale]}>
          <ArrowLeft color={colors.text} size={18} strokeWidth={1.8} />
        </Pressable>
        <Text testID="barbershop-profile-topbar-title" numberOfLines={1} style={styles.topbarTitle}>
          {barbershop.name}
        </Text>
        {!!statusInfo.text && (
          <View style={styles.topbarStatus}>
            <View style={[styles.statusDot, { backgroundColor: statusInfo.isOpen ? colors.success : colors.danger }]} />
            <Text style={[styles.topbarStatusText, { color: statusInfo.isOpen ? colors.success : colors.danger }]}>{statusInfo.isOpen ? 'Aberto' : 'Fechado'}</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Banner Hero com máscara de gradiente */}
        <View style={styles.heroContainer}>
          <Image 
            source={{ uri: barbershop.bannerUrl || 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&q=80&w=1200' }} 
            style={styles.bannerImage} 
            resizeMode="cover"
          />
          <LinearGradient
            colors={['rgba(244,244,245,0)', 'rgba(244,244,245,0.55)', '#F4F4F5']}
            locations={[0, 0.62, 1]}
            style={styles.bannerFade}
            pointerEvents="none"
          />
        </View>

        {/* Informações Principais */}
        <View style={[styles.heroCopy, isWide && styles.heroCopyWide]}>
          <View style={styles.brandContainer}>
            <View style={styles.logoCircle}>
              {barbershop.logoUrl ? (
                <Image testID="barbershop-profile-logo" source={{ uri: barbershop.logoUrl }} style={styles.logoImage} />
              ) : (
                <Text style={styles.logoLetter}>{initialsOf(barbershop.name)}</Text>
              )}
            </View>
            <View style={styles.titleInfo}>
              <View style={styles.titleRow}>
                <Text testID="barbershop-profile-name" style={styles.title}>{barbershop.name}</Text>
                {!!barbershop.instagram && (
                  <Pressable 
                    onPress={() => Linking.openURL(`https://instagram.com/${barbershop.instagram}`)}
                    style={({ pressed }) => [styles.instagramBadge, pressed && styles.pressedScale]}
                  >
                    <Instagram color={colors.textSecondary} size={12} strokeWidth={1.8} />
                    <Text style={styles.instagramBadgeText}>@{barbershop.instagram}</Text>
                  </Pressable>
                )}
              </View>
              {!!barbershop.slogan && <Text style={styles.slogan}>“{barbershop.slogan}”</Text>}
              <Text testID="barbershop-profile-description" style={styles.description}>
                {barbershop.description || 'Este estabelecimento ainda não publicou uma descrição.'}
              </Text>
            </View>
          </View>
        </View>

        {/* Informações Rápidas */}
        <View style={styles.infoGrid}>
          <View style={styles.infoItem}>
            <View style={styles.infoIcon}><Clock3 color={colors.textSecondary} size={15} strokeWidth={1.6} /></View>
            <View style={styles.infoCopyText}>
              <Text style={styles.infoLabel}>Funcionamento</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: statusInfo.isOpen ? colors.success : colors.danger }]} />
                <Text style={[styles.statusLabelText, { color: statusInfo.isOpen ? colors.success : colors.danger }]}>
                  {statusInfo.isOpen ? 'Aberto' : 'Fechado'}
                </Text>
                {!!statusInfo.text && (
                  <Text style={styles.infoValue}>· {statusInfo.text}</Text>
                )}
              </View>
            </View>
          </View>
          <View style={styles.infoItem}>
            <View style={styles.infoIcon}><Phone color={colors.textSecondary} size={15} strokeWidth={1.6} /></View>
            <View style={styles.infoCopyText}>
              <Text style={styles.infoLabel}>Contato</Text>
              <Text style={styles.infoValue}>{barbershop.phone || 'Telefone não informado'}</Text>
            </View>
          </View>
          <View style={styles.infoItem}>
            <View style={styles.infoIcon}><Coins color={colors.textSecondary} size={15} strokeWidth={1.6} /></View>
            <View style={styles.infoCopyText}>
              <Text style={styles.infoLabel}>Moeda oficial</Text>
              <Text style={styles.infoValue}>{barbershop.currency || 'BRL'}</Text>
            </View>
          </View>
        </View>

        {/* Mapa Estético Integrado */}
        {!!barbershop.address && (
          <View style={styles.mapCard}>
            <View style={{ flex: 1, height: 180 }}>
              {Platform.OS === 'web' ? (
                React.createElement('iframe', {
                  src: `https://maps.google.com/maps?q=${encodeURIComponent(barbershop.address)}&t=&z=15&ie=UTF8&iwloc=&output=embed`,
                  width: '100%',
                  height: '100%',
                  style: { border: 0 },
                  loading: 'lazy',
                  title: 'Mapa do Estabelecimento'
                })
              ) : (
                <Image 
                  source={{ uri: 'https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=600' }} 
                  style={styles.mapThumbnail} 
                  resizeMode="cover"
                />
              )}
            </View>
            <View style={styles.mapInfoBar}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={styles.mapInfoAddress} numberOfLines={1}>
                  {barbershop.address}
                </Text>
              </View>
              <AppButton 
                testID="barbershop-profile-route-button"
                label="Como chegar" 
                onPress={() => {
                  const address = barbershop.address || '';
                  const url = Platform.select({
                    ios: `maps:0,0?q=${encodeURIComponent(address)}`,
                    android: `geo:0,0?q=${encodeURIComponent(address)}`,
                    default: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
                  });
                  Linking.openURL(url);
                }}
                variant="secondary"
                style={styles.routeBtn}
                icon={<MapPin color={colors.textSecondary} size={13} strokeWidth={1.6} />}
              />
            </View>
          </View>
        )}

        {/* Serviços */}
        <View style={styles.section}>
          <SectionHeading testID="barbershop-services-heading" eyebrow="Catálogo" title="Serviços" description="" />
          {services.length === 0 ? (
            <EmptyState testID="barbershop-services-empty" title="Catálogo" description="O estabelecimento ainda não publicou serviços ativos." icon={<Scissors color={colors.textSecondary} size={22} strokeWidth={1.6} />} />
          ) : (
            <View testID="barbershop-services-grid" style={styles.cardsGrid}>
              {services.map((service) => (
                <View key={service.id} testID={`barbershop-service-${service.id}`} style={styles.serviceCard}>
                  <View style={styles.cardIcon}>
                    <Scissors color={colors.textSecondary} size={14} strokeWidth={1.6} />
                  </View>
                  <Text style={styles.serviceName}>{service.name}</Text>
                  <Text style={styles.servicePrice}>{currency(service.price)}</Text>
                  <Text style={styles.serviceDuration}>{service.durationMinutes} min</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Galeria de Inspirações / Referências do Dono */}
        <View style={styles.section}>
          <SectionHeading testID="barbershop-gallery-heading" eyebrow="Galeria" title="Inspirações & cortes" description="" />
          {galleryPhotos.length === 0 ? (
            <EmptyState testID="barbershop-gallery-empty" title="Galeria" description="As fotos do estabelecimento aparecerão aqui em breve." icon={<Store color={colors.textSecondary} size={22} strokeWidth={1.6} />} />
          ) : (
            <FlatList
              data={galleryPhotos}
              keyExtractor={(url, idx) => `${url}-${idx}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12 }}
              renderItem={({ item }) => (
                <Image source={{ uri: item }} style={styles.galleryImage} />
              )}
            />
          )}
        </View>

        {/* Equipe (LGPD Safe) */}
        <View style={styles.section}>
          <SectionHeading testID="barbershop-team-heading" eyebrow="Profissionais" title="Nossa equipe" description="" />
          {barbers.length === 0 ? (
            <EmptyState testID="barbershop-team-empty" title="Nossa equipe" description="Os profissionais aparecerão aqui em breve." icon={<UsersRound color={colors.textSecondary} size={22} strokeWidth={1.6} />} />
          ) : (
            <FlatList
              data={barbers}
              keyExtractor={(barber) => barber.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12, paddingVertical: 4 }}
              renderItem={({ item }) => (
                <Pressable onPress={() => { tapLight(); setSelectedTeamMember(item); }} style={({ pressed }) => [pressed && styles.pressedScale]}>
                  <View testID={`barbershop-professional-${item.id}`} style={styles.professionalCard}>
                    <View style={styles.avatarCircleSmall}>
                      {item.avatarUrl ? (
                        <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} />
                      ) : (
                        <Text style={styles.avatarInitials}>{initialsOf(item.name)}</Text>
                      )}
                    </View>
                    <Text style={styles.professionalName}>{item.name}</Text>
                    <Text style={styles.professionalRole}>{item.tituloProfissional || 'Especialista'}</Text>
                    {!!item.specialties && <Text numberOfLines={2} style={styles.professionalSpecialties}>{item.specialties}</Text>}
                    {!!item.instagram && (
                      <View style={styles.barberInstaBtn}>
                        <Instagram color={colors.textMuted} size={11} strokeWidth={1.6} />
                        <Text style={styles.barberInstaText}>@{item.instagram}</Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              )}
            />
          )}
        </View>

        {/* Modal de Detalhes do Profissional (Bottom Sheet - LGPD Safe) */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={!!selectedTeamMember}
          onRequestClose={() => setSelectedTeamMember(null)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setSelectedTeamMember(null)}>
            <View style={styles.bottomSheetContainer}>
              {selectedTeamMember && (
                <View style={styles.bottomSheetContent}>
                  <View style={styles.bottomSheetDragIndicator} />

                  <View style={styles.bottomSheetHeader}>
                    <Text style={styles.bottomSheetTitle}>Perfil profissional</Text>
                    <Pressable style={styles.bottomSheetCloseBtn} onPress={() => setSelectedTeamMember(null)}>
                      <X color={colors.textSecondary} size={18} strokeWidth={1.8} />
                    </Pressable>
                  </View>

                  <View style={styles.bottomSheetBody}>
                    <View style={styles.bottomSheetAvatarCircle}>
                      {selectedTeamMember.avatarUrl ? (
                        <Image source={{ uri: selectedTeamMember.avatarUrl }} style={styles.bottomSheetAvatarImage} />
                      ) : (
                        <Text style={styles.bottomSheetAvatarInitials}>{initialsOf(selectedTeamMember.name)}</Text>
                      )}
                    </View>

                    <Text style={styles.bottomSheetName}>{selectedTeamMember.name}</Text>
                    <Text style={styles.bottomSheetRole}>
                      {selectedTeamMember.role === 'admin' ? 'Proprietário' : 'Profissional'}
                    </Text>

                    {!!selectedTeamMember.specialties && (
                      <View style={styles.bottomSheetSection}>
                        <Text style={styles.bottomSheetSectionLabel}>Especialidades & portfólio</Text>
                        <Text style={styles.bottomSheetSectionValue}>{selectedTeamMember.specialties}</Text>
                      </View>
                    )}

                    {!!selectedTeamMember.instagram && (
                      <TouchableOpacity 
                        onPress={() => Linking.openURL(`https://instagram.com/${selectedTeamMember.instagram}`)}
                        style={styles.bottomSheetInstagramBtn}
                      >
                        <Instagram color={colors.text} size={15} strokeWidth={1.8} />
                        <Text style={styles.bottomSheetInstagramText}>Ver Instagram @{selectedTeamMember.instagram}</Text>
                      </TouchableOpacity>
                    )}

                    {!!selectedTeamMember.workHours && (
                      <View style={styles.bottomSheetSection}>
                        <Text style={styles.bottomSheetSectionLabel}>Horários de trabalho</Text>
                        <Text style={styles.bottomSheetSectionValue}>
                          {selectedTeamMember.workHours}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )}
            </View>
          </Pressable>
        </Modal>
      </ScrollView>

      {/* Barra de ação flutuante (glassmorphism) */}
      <View style={styles.floatingWrap} pointerEvents="box-none">
        <View testID="barbershop-booking-cta" style={styles.floatingBar}>
          <View style={styles.floatingCopy}>
            <Text style={styles.floatingEyebrow}>Pronto para o próximo corte?</Text>
            <Text numberOfLines={1} style={styles.floatingTitle}>Garanta seu horário na agenda</Text>
          </View>
          <Pressable
            testID="barbershop-profile-book-button"
            onPress={goBooking}
            style={({ pressed }) => [styles.floatingButton, { backgroundColor: accent }, pressed && styles.pressedScale]}
          >
            <Text style={[styles.floatingButtonText, { color: accentFg }]}>Agendar agora</Text>
            <ArrowRight color={accentFg} size={15} strokeWidth={2} />
          </Pressable>
        </View>
      </View>
    </ScreenBackground>
  );
}

const hairlineW = Platform.OS === 'web' ? (0.5 as number) : StyleSheet.hairlineWidth;

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  topbar: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, borderBottomWidth: hairlineW, borderBottomColor: colors.hairline, zIndex: 3, ...glassSurface },
  backButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: hairlineW, borderColor: colors.hairline, borderRadius: radii.pill },
  topbarTitle: { flex: 1, color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12 },
  topbarStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  topbarStatusText: { fontFamily: typography.bodyStrong, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', paddingBottom: 150 },
  // Hero
  heroContainer: { width: '100%', height: 250, position: 'relative' },
  bannerImage: { width: '100%', height: '100%' },
  bannerFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 130 },
  heroCopy: { paddingHorizontal: 20, marginTop: -48, zIndex: 2 },
  heroCopyWide: { paddingHorizontal: 40 },
  brandContainer: { flexDirection: 'row', gap: 18, flexWrap: 'wrap', alignItems: 'flex-end' },
  logoCircle: { width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: colors.surface, backgroundColor: '#FAFAF8', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...atmosphericShadow },
  logoImage: { width: '100%', height: '100%' },
  logoLetter: { fontFamily: typography.serif, fontSize: 30, color: '#52525B', letterSpacing: 1 },
  titleInfo: { flex: 1, minWidth: 260, justifyContent: 'flex-end' },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 28, letterSpacing: -1 },
  slogan: { color: colors.textSecondary, fontFamily: typography.serif, fontSize: 13, marginTop: 5, fontStyle: 'italic' },
  instagramBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.surface, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 5, borderWidth: hairlineW, borderColor: colors.border },
  instagramBadgeText: { fontSize: 10, fontFamily: typography.bodyStrong, color: colors.textSecondary },
  description: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, lineHeight: 19, marginTop: 8 },
  // Info Grid
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 20, marginTop: 24 },
  infoItem: { flex: 1, minWidth: 200, flexDirection: 'row', gap: 11, backgroundColor: colors.surface, borderWidth: hairlineW, borderColor: colors.hairline, borderRadius: radii.lg, padding: 15, ...atmosphericShadow },
  infoIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas, borderRadius: radii.pill },
  infoCopyText: { flex: 1 },
  infoLabel: { color: colors.labelSoft, fontFamily: typography.bodyStrong, fontSize: 8, textTransform: 'uppercase', letterSpacing: 1.6 },
  infoValue: { color: colors.text, fontFamily: typography.body, fontSize: 11, marginTop: 3 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabelText: { fontSize: 11, fontFamily: typography.bodyStrong },
  // Mapa
  mapCard: { marginHorizontal: 20, marginTop: 24, borderRadius: radii.xl, borderWidth: hairlineW, borderColor: colors.hairline, overflow: 'hidden', backgroundColor: colors.surface, ...atmosphericShadow },
  mapThumbnail: { width: '100%', height: '100%' },
  mapInfoBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: colors.surface, borderTopWidth: hairlineW, borderTopColor: colors.hairline },
  mapInfoAddress: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 11 },
  routeBtn: { minHeight: 34, paddingVertical: 6, paddingHorizontal: 12 },
  section: { marginTop: 44, paddingHorizontal: 20, gap: 16 },
  cardsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  serviceCard: { flex: 1, minWidth: 160, maxWidth: 260, backgroundColor: colors.surface, borderWidth: hairlineW, borderColor: colors.hairline, borderRadius: radii.lg, padding: 18, ...atmosphericShadow },
  cardIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, backgroundColor: colors.canvas, borderWidth: hairlineW, borderColor: colors.hairline },
  serviceName: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12, marginTop: 16 },
  servicePrice: { color: colors.text, fontFamily: typography.display, fontSize: 16, letterSpacing: -0.4, marginTop: 8 },
  serviceDuration: { color: colors.labelSoft, fontFamily: typography.body, fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, marginTop: 5 },
  // Equipe
  professionalCard: { width: 180, alignItems: 'center', gap: 6, padding: 18, backgroundColor: colors.surface, borderWidth: hairlineW, borderColor: colors.hairline, borderRadius: radii.lg, ...atmosphericShadow },
  avatarCircleSmall: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.canvas },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitials: { fontFamily: typography.serif, fontSize: 20, color: '#52525B', letterSpacing: 1 },
  professionalName: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12, textAlign: 'center', marginTop: 6 },
  professionalRole: { color: colors.labelSoft, fontFamily: typography.bodyStrong, fontSize: 8, textTransform: 'uppercase', letterSpacing: 1.4 },
  professionalSpecialties: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 9, textAlign: 'center', marginTop: 2 },
  barberInstaBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, paddingVertical: 4, paddingHorizontal: 9, borderRadius: radii.pill, backgroundColor: colors.canvas, borderWidth: hairlineW, borderColor: colors.hairline },
  barberInstaText: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 9 },
  galleryImage: { width: 200, height: 260, borderRadius: radii.lg, resizeMode: 'cover' },
  // Barra flutuante
  floatingWrap: { position: 'absolute', left: 16, right: 16, bottom: 16, alignItems: 'center', zIndex: 10 },
  floatingBar: {
    width: '100%',
    maxWidth: 680,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: hairlineW,
    borderColor: colors.hairline,
    borderRadius: radii.xl,
    paddingVertical: 13,
    paddingHorizontal: 18,
    ...glassSurface,
    ...Platform.select({
      web: { boxShadow: '0 16px 44px rgba(0,0,0,0.10)' } as any,
      default: { elevation: 9, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
    }),
  },
  floatingCopy: { flex: 1, minWidth: 0 },
  floatingEyebrow: { color: colors.labelSoft, fontFamily: typography.bodyStrong, fontSize: 8, letterSpacing: 1.8, textTransform: 'uppercase' },
  floatingTitle: { color: colors.text, fontFamily: typography.display, fontSize: 13, letterSpacing: -0.3, marginTop: 3 },
  floatingButton: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44, paddingHorizontal: 18, borderRadius: radii.pill },
  floatingButtonText: { fontFamily: typography.bodyStrong, fontSize: 12 },
  pressedScale: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  // Modal de Detalhes do Profissional
  modalOverlay: { flex: 1, backgroundColor: 'rgba(9,9,11,0.35)', justifyContent: 'flex-end', alignItems: 'center' },
  bottomSheetContainer: { width: '100%', maxWidth: 540, backgroundColor: colors.surface, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, overflow: 'hidden' },
  bottomSheetContent: { padding: 24, paddingBottom: 40, gap: 20 },
  bottomSheetDragIndicator: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 },
  bottomSheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bottomSheetTitle: { fontFamily: typography.display, fontSize: 17, color: colors.text, letterSpacing: -0.4 },
  bottomSheetCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  bottomSheetBody: { alignItems: 'center', gap: 14, marginTop: 10, width: '100%' },
  bottomSheetAvatarCircle: { width: 92, height: 92, borderRadius: 46, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
  bottomSheetAvatarImage: { width: '100%', height: '100%' },
  bottomSheetAvatarInitials: { fontFamily: typography.serif, fontSize: 30, color: '#52525B', letterSpacing: 1 },
  bottomSheetName: { fontFamily: typography.display, fontSize: 20, color: colors.text, letterSpacing: -0.5 },
  bottomSheetRole: { fontFamily: typography.bodyStrong, fontSize: 9, color: colors.labelSoft, textTransform: 'uppercase', letterSpacing: 1.8 },
  bottomSheetSection: { width: '100%', backgroundColor: colors.canvasSoft, borderWidth: hairlineW, borderColor: colors.hairline, borderRadius: radii.md, padding: 16, gap: 6 },
  bottomSheetSectionLabel: { fontFamily: typography.bodyStrong, fontSize: 9, color: colors.labelSoft, textTransform: 'uppercase', letterSpacing: 1.4 },
  bottomSheetSectionValue: { fontFamily: typography.body, fontSize: 13, color: colors.text, lineHeight: 18 },
  bottomSheetInstagramBtn: { width: '100%', height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, marginTop: 6, backgroundColor: colors.surface },
  bottomSheetInstagramText: { fontFamily: typography.bodyStrong, fontSize: 12, color: colors.text },
});
