import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, Modal, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Q } from '@nozbe/watermelondb';
import { ArrowLeft, ArrowRight, Clock3, Coins, Instagram, MapPin, Phone, Scissors, Store, UserRound, UsersRound, X } from 'lucide-react-native';
import { database } from '../../database';
import { Barbershop, Profile, Service } from '../../database/models';
import { AppButton } from '../../components/ui/AppButton';
import { AppCard } from '../../components/ui/AppCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { ScreenBackground } from '../../components/ui/ScreenBackground';
import { SectionHeading } from '../../components/ui/SectionHeading';
import { colors, layout, radii, typography } from '../../theme/tokens';

// portfolioPhotos é agora um fallback opcional de galeria vazia se não configurado
const fallbackPhotos = [
  'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&q=80&w=400',
  'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&q=80&w=400',
];

function BarbershopProfileSkeleton() {
  return (
    <ScreenBackground testID="barbershop-profile-skeleton" style={{ backgroundColor: colors.canvas }}>
      {/* Skeleton Topbar */}
      <View style={[styles.topbar, { opacity: 0.6, backgroundColor: colors.surface }]}>
        <View style={[styles.backButton, { backgroundColor: colors.surfaceRaised, borderWidth: 0 }]} />
        <View style={{ width: 140, height: 18, backgroundColor: colors.surfaceRaised, borderRadius: 4 }} />
        <View style={{ width: 80, height: 38, backgroundColor: colors.surfaceRaised, borderRadius: 8, marginLeft: 'auto' }} />
      </View>
      
      <ScrollView contentContainerStyle={styles.scroll} scrollEnabled={false}>
        {/* Skeleton Hero */}
        <View style={[styles.heroContainer, { backgroundColor: colors.surfaceRaised }]} />
        
        {/* Skeleton Profile Details */}
        <View style={styles.heroCopy}>
          <View style={styles.brandContainer}>
            <View style={[styles.logoCircle, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1 }]} />
            <View style={[styles.titleInfo, { gap: 8 }]}>
              <View style={{ width: 220, height: 26, backgroundColor: colors.surfaceRaised, borderRadius: 4 }} />
              <View style={{ width: 150, height: 14, backgroundColor: colors.surfaceRaised, borderRadius: 4 }} />
              <View style={{ width: '100%', height: 40, backgroundColor: colors.surfaceRaised, borderRadius: 6, marginTop: 4 }} />
            </View>
          </View>
        </View>

        {/* Skeleton Info Grid */}
        <View style={styles.infoGrid}>
          <View style={[styles.infoItem, { height: 60, backgroundColor: colors.surfaceRaised, borderColor: colors.border }]} />
          <View style={[styles.infoItem, { height: 60, backgroundColor: colors.surfaceRaised, borderColor: colors.border }]} />
          <View style={[styles.infoItem, { height: 60, backgroundColor: colors.surfaceRaised, borderColor: colors.border }]} />
        </View>

        {/* Skeleton Services Section */}
        <View style={styles.section}>
          <View style={{ width: 100, height: 20, backgroundColor: colors.surfaceRaised, borderRadius: 4 }} />
          <View style={styles.cardsGrid}>
            <View style={[styles.serviceCard, { height: 120, backgroundColor: colors.surfaceRaised, borderColor: colors.border }]} />
            <View style={[styles.serviceCard, { height: 120, backgroundColor: colors.surfaceRaised, borderColor: colors.border }]} />
            <View style={[styles.serviceCard, { height: 120, backgroundColor: colors.surfaceRaised, borderColor: colors.border }]} />
          </View>
        </View>
      </ScrollView>
    </ScreenBackground>
  );
}

export default function BarbershopSlugScreen() {
  const { t, i18n } = useTranslation();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const router = useRouter();

  const [barbershop, setBarbershop] = useState<Barbershop | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeamMember, setSelectedTeamMember] = useState<Profile | null>(null);

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

  useEffect(() => {
    if (!slug) { 
      setLoading(false); 
      return; 
    }

    const loadBySlug = async () => {
      try {
        const shops = await database.collections.get<Barbershop>('establishments')
          .query(Q.where('slug', slug))
          .fetch();

        if (shops.length > 0) {
          const shop = shops[0];
          setBarbershop(shop);

          const [serviceList, barberList] = await Promise.all([
            database.collections.get<Service>('services')
              .query(Q.where('establishment_id', shop.id), Q.where('is_active', true))
              .fetch(),
            database.collections.get<Profile>('profiles')
              .query(Q.where('establishment_id', shop.id), Q.where('role', Q.oneOf(['professional', 'barber', 'admin'])))
              .fetch(),
          ]);

          setServices(serviceList);
          setBarbers(barberList);
        }
      } catch (err) {
        console.error('Erro ao carregar barbearia por slug:', err);
      } finally {
        setLoading(false);
      }
    };

    loadBySlug();
  }, [slug]);

  const goBack = () => router.canGoBack() ? router.back() : router.replace('/(client)');
  
  const currency = (value: number) => {
    const localeStr = i18n.language === 'en' ? 'en-US' : 'pt-BR';
    return new Intl.NumberFormat(localeStr, { 
      style: 'currency', 
      currency: barbershop?.currency || 'BRL' 
    }).format(value);
  };

  // Cálculo de Status em Tempo Real
  const statusInfo = useMemo(() => {
    if (!barbershop?.openingHours) return { isOpen: false, text: '' };
    try {
      const schedule = JSON.parse(barbershop.openingHours);
      const now = new Date();
      const day = now.getDay(); // 0 = Domingo, 1 = Segunda, etc.
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
          title={t('slug.not_found')} 
          description="Este perfil pode ter sido removido ou o endereço está incorreto." 
          icon={<Store color={colors.brand} size={22} />} 
          action={<AppButton label={t('common.back')} testID="barbershop-profile-error-back-button" onPress={goBack} />} 
        />
      </ScreenBackground>
    );
  }

  const accent = barbershop.primaryColor || colors.brand;

  return (
    <ScreenBackground testID="barbershop-profile-screen">
      <View style={styles.topbar}>
        <Pressable testID="barbershop-profile-back-button" onPress={goBack} style={styles.backButton}>
          <ArrowLeft color={colors.text} size={18} />
        </Pressable>
        <Text testID="barbershop-profile-topbar-title" numberOfLines={1} style={styles.topbarTitle}>
          {barbershop.name}
        </Text>
        <AppButton 
          label={t('client.book_button')} 
          testID="barbershop-profile-topbar-book-button" 
          onPress={() => router.push(`/${slug}/booking`)} 
          style={[styles.topbarBook, { backgroundColor: accent, borderColor: accent }]} 
        />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Banner Hero Premium */}
        <View style={styles.heroContainer}>
          <Image 
            source={{ uri: barbershop.bannerUrl || 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&q=80&w=1200' }} 
            style={styles.bannerImage} 
            resizeMode="cover"
          />
          <View style={styles.bannerOverlay} />
        </View>

        {/* Informações Principais */}
        <View style={[styles.heroCopy, isWide && styles.heroCopyWide]}>
          <View style={styles.brandContainer}>
            <View style={[styles.logoCircle, { borderColor: accent }]}>
              {barbershop.logoUrl ? (
                <Image testID="barbershop-profile-logo" source={{ uri: barbershop.logoUrl }} style={styles.logoImage} />
              ) : (
                <Text style={[styles.logoLetter, { color: accent }]}>{barbershop.name.charAt(0).toUpperCase()}</Text>
              )}
            </View>
            <View style={styles.titleInfo}>
              <View style={styles.titleRow}>
                <Text testID="barbershop-profile-name" style={styles.title}>{barbershop.name}</Text>
                {!!barbershop.instagram && (
                  <Pressable 
                    onPress={() => Linking.openURL(`https://instagram.com/${barbershop.instagram}`)}
                    style={styles.instagramBadge}
                  >
                    <Instagram color={accent} size={13} />
                    <Text style={[styles.instagramBadgeText, { color: accent }]}>@{barbershop.instagram}</Text>
                  </Pressable>
                )}
              </View>
              {!!barbershop.slogan && <Text style={styles.slogan}>“{barbershop.slogan}”</Text>}
              <Text testID="barbershop-profile-description" style={styles.description}>
                {barbershop.description || t('slug.description_empty')}
              </Text>
            </View>
          </View>
        </View>

        {/* Informações Rápidas */}
        <View style={styles.infoGrid}>
          <View style={styles.infoItem}>
            <View style={styles.infoIcon}><Clock3 color={accent} size={16} /></View>
            <View style={styles.infoCopyText}>
              <Text style={styles.infoLabel}>Funcionamento</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                <View style={[styles.statusDot, { backgroundColor: statusInfo.isOpen ? '#30d158' : '#ff453a' }]} />
                <Text style={[styles.statusLabelText, { color: statusInfo.isOpen ? '#30d158' : '#ff453a', fontWeight: 'bold' }]}>
                  {statusInfo.isOpen ? 'Aberto' : 'Fechado'}
                </Text>
                {!!statusInfo.text && (
                  <Text style={styles.infoValue}>· {statusInfo.text}</Text>
                )}
              </View>
            </View>
          </View>
          <View style={styles.infoItem}>
            <View style={styles.infoIcon}><Phone color={accent} size={16} /></View>
            <View style={styles.infoCopyText}>
              <Text style={styles.infoLabel}>Contato</Text>
              <Text style={styles.infoValue}>{barbershop.phone || 'Telefone não informado'}</Text>
            </View>
          </View>
          <View style={styles.infoItem}>
            <View style={styles.infoIcon}><Coins color={accent} size={16} /></View>
            <View style={styles.infoCopyText}>
              <Text style={styles.infoLabel}>Moeda Oficial</Text>
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
                  title: 'Mapa da Barbearia'
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
                label="Como Chegar (Rota)" 
                onPress={() => {
                  const query = encodeURIComponent(barbershop.address || '');
                  Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
                }}
                style={[styles.routeBtn, { backgroundColor: accent, borderColor: accent }]}
                icon={<MapPin color={colors.ink} size={13} />}
              />
            </View>
          </View>
        )}

        {/* Serviços */}
        <View style={styles.section}>
          <SectionHeading testID="barbershop-services-heading" eyebrow={t('services.title')} title={t('slug.catalog')} description="" />
          {services.length === 0 ? (
            <EmptyState testID="barbershop-services-empty" title={t('slug.catalog')} description={t('slug.services_empty')} icon={<Scissors color={accent} size={22} />} />
          ) : (
            <View testID="barbershop-services-grid" style={styles.cardsGrid}>
              {services.map((service) => (
                <AppCard key={service.id} testID={`barbershop-service-${service.id}`} style={styles.serviceCard}>
                  <View style={[styles.cardIcon, { backgroundColor: `${accent}18` }]}>
                    <Scissors color={accent} size={18} />
                  </View>
                  <Text style={styles.serviceName}>{service.name}</Text>
                  <Text style={[styles.servicePrice, { color: accent }]}>{currency(service.price)}</Text>
                  <Text style={styles.serviceDuration}>{service.durationMinutes} min</Text>
                </AppCard>
              ))}
            </View>
          )}
        </View>

        {/* Galeria de Inspirações / Referências do Dono */}
        <View style={styles.section}>
          <SectionHeading testID="barbershop-gallery-heading" eyebrow={t('slug.gallery')} title={t('slug.gallery_title')} description="" />
          {galleryPhotos.length === 0 ? (
            <EmptyState testID="barbershop-gallery-empty" title={t('slug.gallery_title')} description={t('slug.gallery_empty')} icon={<Store color={accent} size={22} />} />
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
          <SectionHeading testID="barbershop-team-heading" eyebrow={t('booking.professional_label')} title="Nossa Equipe" description="" />
          {barbers.length === 0 ? (
            <EmptyState testID="barbershop-team-empty" title={t('slug.about')} description={t('slug.team_empty')} icon={<UsersRound color={accent} size={22} />} />
          ) : (
            <FlatList
              data={barbers}
              keyExtractor={(barber) => barber.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12 }}
              renderItem={({ item }) => (
                <Pressable onPress={() => setSelectedTeamMember(item)}>
                  <AppCard testID={`barbershop-professional-${item.id}`} style={styles.professionalCard}>
                    <View style={[styles.avatarCircleSmall, { backgroundColor: `${accent}18` }]}>
                      {item.avatarUrl ? (
                        <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} />
                      ) : (
                        <UserRound color={accent} size={24} />
                      )}
                    </View>
                    <Text style={styles.professionalName}>{item.name}</Text>
                    <Text style={styles.professionalRole}>{item.role === 'admin' ? 'Proprietário' : 'Profissional'}</Text>
                    {!!item.specialties && <Text style={styles.professionalSpecialties}>{item.specialties}</Text>}
                    {!!item.instagram && (
                      <View style={styles.barberInstaBtn}>
                        <Instagram color={colors.textMuted} size={11} />
                        <Text style={styles.barberInstaText}>@{item.instagram}</Text>
                      </View>
                    )}
                  </AppCard>
                </Pressable>
              )}
            />
          )}
        </View>

        {/* CTA Barra Flutuante */}
        <View testID="barbershop-booking-cta" style={[styles.cta, { borderColor: colors.border, backgroundColor: 'rgba(255, 255, 255, 0.75)', ...({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' } as any) }]}>
          <View style={styles.ctaCopy}>
            <Text style={styles.ctaEyebrow}>{t('slug.cta')}</Text>
            <Text style={styles.ctaTitle}>Garanta o seu horário na agenda.</Text>
          </View>
          <AppButton 
            label={t('slug.cta_button')} 
            testID="barbershop-profile-book-button" 
            onPress={() => router.push(`/${slug}/booking`)} 
            icon={<ArrowRight color={colors.ink} size={17} />} 
            style={{ backgroundColor: accent, borderColor: accent }} 
          />
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
                    <Text style={styles.bottomSheetTitle}>Perfil Profissional</Text>
                    <Pressable style={styles.bottomSheetCloseBtn} onPress={() => setSelectedTeamMember(null)}>
                      <X color={colors.textSecondary} size={20} />
                    </Pressable>
                  </View>

                  <View style={styles.bottomSheetBody}>
                    <View style={[styles.bottomSheetAvatarCircle, { backgroundColor: `${accent}18` }]}>
                      {selectedTeamMember.avatarUrl ? (
                        <Image source={{ uri: selectedTeamMember.avatarUrl }} style={styles.bottomSheetAvatarImage} />
                      ) : (
                        <UserRound color={accent} size={48} />
                      )}
                    </View>

                    <Text style={styles.bottomSheetName}>{selectedTeamMember.name}</Text>
                    <Text style={styles.bottomSheetRole}>
                      {selectedTeamMember.role === 'admin' ? 'Proprietário' : 'Profissional'}
                    </Text>

                    {!!selectedTeamMember.specialties && (
                      <View style={styles.bottomSheetSection}>
                        <Text style={styles.bottomSheetSectionLabel}>Especialidades & Portfólio</Text>
                        <Text style={styles.bottomSheetSectionValue}>{selectedTeamMember.specialties}</Text>
                      </View>
                    )}

                    {!!selectedTeamMember.instagram && (
                      <TouchableOpacity 
                        onPress={() => Linking.openURL(`https://instagram.com/${selectedTeamMember.instagram}`)}
                        style={[styles.bottomSheetInstagramBtn, { borderColor: accent }]}
                      >
                        <Instagram color={accent} size={16} />
                        <Text style={[styles.bottomSheetInstagramText, { color: accent }]}>Ver Instagram @{selectedTeamMember.instagram}</Text>
                      </TouchableOpacity>
                    )}

                    {!!selectedTeamMember.workHours && (
                      <View style={styles.bottomSheetSection}>
                        <Text style={styles.bottomSheetSectionLabel}>Horários de Trabalho</Text>
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
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  topbar: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, backgroundColor: colors.surface + 'F2', borderBottomWidth: 1, borderBottomColor: colors.border, zIndex: 3 },
  backButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md },
  topbarTitle: { flex: 1, color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12 },
  topbarBook: { minHeight: 38, paddingVertical: 7 },
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', paddingBottom: 80 },
  // Hero Capa Styles
  heroContainer: { width: '100%', height: 260, position: 'relative' },
  bannerImage: { width: '100%', height: '100%' },
  bannerOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(255, 255, 255, 0.1)' },
  heroCopy: { paddingHorizontal: 20, marginTop: -40, zIndex: 2 },
  heroCopyWide: { paddingHorizontal: 40 },
  brandContainer: { flexDirection: 'row', gap: 18, flexWrap: 'wrap', alignItems: 'flex-end' },
  logoCircle: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoImage: { width: '100%', height: '100%' },
  logoLetter: { fontFamily: typography.display, fontSize: 36, fontWeight: 'bold' },
  titleInfo: { flex: 1, minWidth: 260, justifyContent: 'flex-end' },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 28, letterSpacing: -1, fontWeight: 'bold' },
  slogan: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  instagramBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${colors.brand}12`, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: `${colors.brand}44` },
  instagramBadgeText: { fontSize: 10, fontFamily: typography.bodyStrong },
  description: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, lineHeight: 18, marginTop: 8 },
  // Info Grid
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 20, marginTop: 20 },
  infoItem: { flex: 1, minWidth: 200, flexDirection: 'row', gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: 14 },
  infoIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas, borderRadius: radii.md },
  infoCopyText: { flex: 1 },
  infoLabel: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 9, textTransform: 'uppercase' },
  infoValue: { color: colors.text, fontFamily: typography.body, fontSize: 11, marginTop: 3 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabelText: { fontSize: 11 },
  // Mapa
  mapCard: { marginHorizontal: 20, marginTop: 24, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', backgroundColor: colors.surface },
  mapThumbnail: { width: '100%', height: '100%' },
  mapInfoBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: colors.surfaceRaised, borderTopWidth: 1, borderTopColor: colors.border },
  mapInfoAddress: { color: colors.text, fontFamily: typography.body, fontSize: 12 },
  routeBtn: { minHeight: 32, paddingVertical: 5, paddingHorizontal: 12 },
  section: { marginTop: 40, paddingHorizontal: 20, gap: 16 },
  cardsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  serviceCard: { flex: 1, minWidth: 160, maxWidth: 260 },
  cardIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md },
  serviceName: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12, marginTop: 16 },
  servicePrice: { fontFamily: typography.display, fontSize: 16, marginTop: 8 },
  serviceDuration: { color: colors.textMuted, fontFamily: typography.body, fontSize: 9, marginTop: 4 },
  // Equipe
  professionalCard: { width: 180, alignItems: 'center', gap: 6, padding: 16 },
  avatarCircleSmall: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  professionalName: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12, textAlign: 'center', marginTop: 4 },
  professionalRole: { color: colors.textMuted, fontFamily: typography.body, fontSize: 9, textTransform: 'uppercase' },
  professionalSpecialties: { color: colors.brand, fontFamily: typography.body, fontSize: 9, textAlign: 'center', marginTop: 2 },
  barberInstaBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, paddingVertical: 4, paddingHorizontal: 8, borderRadius: radii.md, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border },
  barberInstaText: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 9 },
  galleryImage: { width: 200, height: 260, borderRadius: radii.lg, resizeMode: 'cover', borderWidth: 1, borderColor: colors.border },
  cta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 18, borderWidth: 1, borderRadius: radii.xl, padding: 24, marginHorizontal: 20, marginTop: 40 },
  ctaCopy: { flex: 1, minWidth: 240 },
  ctaEyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 9, letterSpacing: 1.7 },
  ctaTitle: { color: colors.text, fontFamily: typography.display, fontSize: 18, lineHeight: 22, letterSpacing: -0.6, marginTop: 7 },
  // Modal de Detalhes do Profissional
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end', alignItems: 'center' },
  bottomSheetContainer: { width: '100%', maxWidth: 540, backgroundColor: colors.surface, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, overflow: 'hidden' },
  bottomSheetContent: { padding: 24, paddingBottom: 40, gap: 20 },
  bottomSheetDragIndicator: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 },
  bottomSheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bottomSheetTitle: { fontFamily: typography.display, fontSize: 18, color: colors.text, fontWeight: 'bold' },
  bottomSheetCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfacePressed, alignItems: 'center', justifyContent: 'center' },
  bottomSheetBody: { alignItems: 'center', gap: 14, marginTop: 10, width: '100%' },
  bottomSheetAvatarCircle: { width: 96, height: 96, borderRadius: 48, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  bottomSheetAvatarImage: { width: '100%', height: '100%' },
  bottomSheetName: { fontFamily: typography.display, fontSize: 20, color: colors.text, fontWeight: 'bold' },
  bottomSheetRole: { fontFamily: typography.body, fontSize: 12, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },
  bottomSheetSection: { width: '100%', backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: 16, gap: 6 },
  bottomSheetSectionLabel: { fontFamily: typography.bodyStrong, fontSize: 10, color: colors.textMuted, textTransform: 'uppercase' },
  bottomSheetSectionValue: { fontFamily: typography.body, fontSize: 13, color: colors.text, lineHeight: 18 },
  bottomSheetInstagramBtn: { width: '100%', height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: radii.md, marginTop: 6 },
  bottomSheetInstagramText: { fontFamily: typography.bodyStrong, fontSize: 13 },
});
