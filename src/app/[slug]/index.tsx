import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Q } from '@nozbe/watermelondb';
import { ArrowLeft, ArrowRight, Clock3, Coins, MapPin, Phone, Scissors, Store, UserRound, UsersRound } from 'lucide-react-native';
import { database } from '../../database';
import { Barbershop, Profile, Service } from '../../database/models';
import { AppButton } from '../../components/ui/AppButton';
import { AppCard } from '../../components/ui/AppCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { ScreenBackground } from '../../components/ui/ScreenBackground';
import { SectionHeading } from '../../components/ui/SectionHeading';
import { colors, layout, radii, typography } from '../../theme/tokens';

const portfolioPhotos = [
  'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&q=80&w=400',
  'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&q=80&w=400',
  'https://images.unsplash.com/photo-1605497746444-ac9dbd324d48?auto=format&fit=crop&q=80&w=400',
  'https://images.unsplash.com/photo-1599351431247-f5094087e842?auto=format&fit=crop&q=80&w=400'
];

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

  useEffect(() => {
    if (!slug) { 
      setLoading(false); 
      return; 
    }

    const loadBySlug = async () => {
      try {
        const shops = await database.collections.get<Barbershop>('barbershops')
          .query(Q.where('slug', slug))
          .fetch();

        if (shops.length > 0) {
          const shop = shops[0];
          setBarbershop(shop);

          const [serviceList, barberList] = await Promise.all([
            database.collections.get<Service>('services')
              .query(Q.where('barbershop_id', shop.id), Q.where('is_active', true))
              .fetch(),
            database.collections.get<Profile>('profiles')
              .query(Q.where('barbershop_id', shop.id), Q.where('role', Q.oneOf(['barber', 'admin'])))
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

  if (loading) {
    return (
      <ScreenBackground testID="barbershop-profile-loading" style={styles.center}>
        <ActivityIndicator color={colors.brand} size="large" />
      </ScreenBackground>
    );
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
        {/* Banner Hero */}
        <View style={[styles.hero, isWide && styles.heroWide]}>
          <View style={[styles.heroVisual, { backgroundColor: `${accent}16`, borderColor: `${accent}44` }]}>
            {barbershop.logoUrl ? (
              <Image testID="barbershop-profile-logo" source={{ uri: barbershop.logoUrl }} resizeMode="cover" style={styles.heroLogo} />
            ) : (
              <Text style={[styles.heroMonogram, { color: accent }]}>{barbershop.name.charAt(0).toUpperCase()}</Text>
            )}
            <View style={[styles.heroAccent, { backgroundColor: accent }]} />
          </View>
          <View style={styles.heroCopy}>
            <Text testID="barbershop-profile-eyebrow" style={[styles.eyebrow, { color: accent }]}>{t('slug.partner')}</Text>
            <Text testID="barbershop-profile-name" style={styles.title}>{barbershop.name}</Text>
            <Text testID="barbershop-profile-description" style={styles.description}>
              {barbershop.description || t('slug.description_empty')}
            </Text>
            <View style={styles.infoGrid}>
              <InfoItem testID="barbershop-profile-address" icon={<MapPin color={accent} size={17} />} label="Endereço" value={barbershop.address || 'Não informado'} />
              <InfoItem testID="barbershop-profile-phone" icon={<Phone color={accent} size={17} />} label="Telefone" value={barbershop.phone || 'Não informado'} />
              <InfoItem testID="barbershop-profile-hours" icon={<Clock3 color={accent} size={17} />} label="Funcionamento" value={barbershop.openingHours || 'Não informado'} />
              <InfoItem testID="barbershop-profile-currency" icon={<Coins color={accent} size={17} />} label="Moeda" value={barbershop.currency || 'BRL'} />
            </View>
          </View>
        </View>

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

        {/* Galeria de Estilos e Fotos */}
        <View style={styles.section}>
          <SectionHeading eyebrow="Galeria" title="Estilos & Inspirações" description="" />
          <FlatList
            data={portfolioPhotos}
            keyExtractor={(url) => url}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12 }}
            renderItem={({ item }) => (
              <Image source={{ uri: item }} style={styles.galleryImage} />
            )}
          />
        </View>

        {/* Equipe */}
        <View style={styles.section}>
          <SectionHeading testID="barbershop-team-heading" eyebrow={t('booking.step_barber')} title={t('slug.about')} description="" />
          {barbers.length === 0 ? (
            <EmptyState testID="barbershop-team-empty" title={t('slug.about')} description={t('slug.team_empty')} icon={<UsersRound color={accent} size={22} />} />
          ) : (
            <View testID="barbershop-team-grid" style={styles.cardsGrid}>
              {barbers.map((barber) => (
                <AppCard key={barber.id} testID={`barbershop-professional-${barber.id}`} style={styles.professionalCard}>
                  <View style={[styles.avatar, { backgroundColor: `${accent}18` }]}>
                    {barber.avatarUrl ? <Image source={{ uri: barber.avatarUrl }} style={styles.avatarImage} /> : <UserRound color={accent} size={22} />}
                  </View>
                  <Text style={styles.professionalName}>{barber.name}</Text>
                  <Text style={styles.professionalRole}>{barber.role === 'admin' ? 'Proprietário' : 'Barbeiro'}</Text>
                </AppCard>
              ))}
            </View>
          )}
        </View>

        {/* CTA */}
        <View testID="barbershop-booking-cta" style={[styles.cta, { borderColor: colors.border, backgroundColor: '#1C1C1EE6' }]}>
          <View style={styles.ctaCopy}>
            <Text style={styles.ctaEyebrow}>{t('slug.cta')}</Text>
            <Text style={styles.ctaTitle}>Escolha serviço, profissional e horário.</Text>
          </View>
          <AppButton 
            label={t('slug.cta_button')} 
            testID="barbershop-profile-book-button" 
            onPress={() => router.push(`/${slug}/booking`)} 
            icon={<ArrowRight color={colors.ink} size={17} />} 
            style={{ backgroundColor: accent, borderColor: accent }} 
          />
        </View>
      </ScrollView>
    </ScreenBackground>
  );
}

const InfoItem = ({ icon, label, value, testID }: { icon: React.ReactNode; label: string; value: string; testID: string }) => (
  <View testID={testID} style={styles.infoItem}>
    <View style={styles.infoIcon}>{icon}</View>
    <View style={styles.infoCopy}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  topbar: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, backgroundColor: '#0F0F12F2', borderBottomWidth: 1, borderBottomColor: colors.border, zIndex: 3 },
  backButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md },
  topbarTitle: { flex: 1, color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12 },
  topbarBook: { minHeight: 38, paddingVertical: 7 },
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 20, paddingTop: 30, paddingBottom: 60 },
  hero: { gap: 26 },
  heroWide: { flexDirection: 'row', alignItems: 'stretch' },
  heroVisual: { minHeight: 270, flex: 0.85, borderWidth: 1, borderRadius: radii.xl, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  heroLogo: { width: '100%', height: '100%' },
  heroMonogram: { fontFamily: typography.display, fontSize: 76 },
  heroAccent: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 5 },
  heroCopy: { flex: 1.15, justifyContent: 'center', paddingVertical: 12 },
  eyebrow: { fontFamily: typography.bodyStrong, fontSize: 10, letterSpacing: 2 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 39, lineHeight: 44, letterSpacing: -1.8, marginTop: 10 },
  description: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, lineHeight: 20, maxWidth: 570, marginTop: 12 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 22 },
  infoItem: { width: '48%', minWidth: 190, flexGrow: 1, flexDirection: 'row', gap: 9, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: 12 },
  infoIcon: { width: 31, height: 31, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas, borderRadius: radii.sm },
  infoCopy: { flex: 1 },
  infoLabel: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.7 },
  infoValue: { color: colors.text, fontFamily: typography.body, fontSize: 10, lineHeight: 15, marginTop: 4 },
  section: { marginTop: 48, gap: 18 },
  cardsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  serviceCard: { flex: 1, minWidth: 160, maxWidth: 260 },
  cardIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md },
  serviceName: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12, marginTop: 16 },
  servicePrice: { fontFamily: typography.display, fontSize: 16, marginTop: 8 },
  serviceDuration: { color: colors.textMuted, fontFamily: typography.body, fontSize: 9, marginTop: 4 },
  professionalCard: { width: 170, alignItems: 'center' },
  avatar: { width: 58, height: 58, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  professionalName: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12, textAlign: 'center', marginTop: 12 },
  professionalRole: { color: colors.textMuted, fontFamily: typography.body, fontSize: 9, marginTop: 4 },
  galleryImage: { width: 200, height: 260, borderRadius: radii.lg, resizeMode: 'cover', borderWidth: 1, borderColor: colors.border },
  cta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 18, borderWidth: 1, borderRadius: radii.xl, padding: 24, marginTop: 52 },
  ctaCopy: { flex: 1, minWidth: 240 },
  ctaEyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 9, letterSpacing: 1.7 },
  ctaTitle: { color: colors.text, fontFamily: typography.display, fontSize: 20, lineHeight: 25, letterSpacing: -0.6, marginTop: 7 },
});
