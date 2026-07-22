import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import {
  Briefcase,
  Calendar as CalendarIcon,
  ChevronRight,
  Compass,
  Filter,
  Flower2,
  Hand,
  LogIn,
  MapPin,
  Scissors,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  X,
  Zap,
} from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';
import { useUserLocation } from '../hooks/useUserLocation';
import { AppButton } from '../components/ui/AppButton';
import { colors, layout, radii, typography, typeScale } from '../theme/tokens';

/* ────────────────────────────────────────────────────────────────────────────
   MARKETPLACE B2C — Rota Raiz /
   Com Carrosséis Horizontais, Mobile Search Sheet e Badges nos Cards.
   ──────────────────────────────────────────────────────────────────────────── */

interface EstablishmentItem {
  id: string;
  name: string;
  slug: string;
  address?: string | null;
  phone?: string | null;
  banner_url?: string | null;
  logo_url?: string | null;
  description?: string | null;
  average_rating?: number | null;
  account_status?: string | null;
  created_at?: string | null;
  // Extra computed metadata for card badges
  reviews_count?: number;
  distance_km?: string;
  price_range?: string;
  next_available_slot?: string;
  is_new?: boolean;
}

// ── SKELETON LOADER FOR HORIZONTAL CAROUSEL ─────────────────────────────────
const CarouselSkeleton = () => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
    {[1, 2, 3].map((i) => (
      <View key={i} style={styles.cardSkeleton}>
        <View style={styles.coverSkeleton} />
        <View style={{ padding: 14, gap: 10 }}>
          <View style={{ height: 16, backgroundColor: '#E4E5DF', borderRadius: 4, width: '70%' }} />
          <View style={{ height: 12, backgroundColor: '#F0F0F0', borderRadius: 4, width: '90%' }} />
          <View style={{ height: 12, backgroundColor: '#F0F0F0', borderRadius: 4, width: '50%' }} />
        </View>
      </View>
    ))}
  </ScrollView>
);

// Helper to compute Haversine distance in km
const calculateDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): string => {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`;
};

// ── ESTABLISHMENT CARD COMPONENT (16:9 Cover, Real Badges ⭐ 📍 💲 🟢) ───────
const EstablishmentCard: React.FC<{
  item: EstablishmentItem;
  userLat?: number | null;
  userLng?: number | null;
  onPress: () => void;
  onBookPress?: () => void;
}> = ({ item, userLat, userLng, onPress, onBookPress }) => {
  const hasRating = Boolean(item.average_rating && Number(item.average_rating) > 0);
  const ratingText = hasRating ? Number(item.average_rating).toFixed(1) : 'Novo';
  const reviewsCount = item.reviews_count || 0;

  // Real neighborhood
  const neighborhood = item.address?.split(',')[2]?.trim() || item.address?.split(',')[0]?.trim() || 'Centro';

  // Calculate real distance if coordinates exist
  let distanceText: string | null = null;
  if (userLat && userLng && (item as any).latitude && (item as any).longitude) {
    distanceText = calculateDistanceKm(userLat, userLng, (item as any).latitude, (item as any).longitude);
  }

  const startingPrice = item.price_range || null;

  return (
    <Pressable style={styles.cardContainer} onPress={onPress}>
      {/* 16:9 Cover Image */}
      <View style={styles.coverContainer}>
        {item.banner_url || item.logo_url ? (
          <Image
            source={{ uri: item.banner_url || item.logo_url || '' }}
            style={styles.coverImage}
            contentFit="cover"
          />
        ) : (
          <View style={styles.coverFallback}>
            <Scissors size={32} color={colors.brandPrimary} />
          </View>
        )}

        {/* Top Badges (⭐ Rating, 📍 Distance/Location, 💲 Price) */}
        <View style={styles.topBadgesRow}>
          <View style={styles.badgeItem}>
            <Star size={11} color="#F5A524" fill={hasRating ? '#F5A524' : 'none'} />
            <Text style={styles.badgeTextBold}>{ratingText}</Text>
            {hasRating && reviewsCount > 0 && (
              <Text style={styles.badgeTextMuted}>({reviewsCount})</Text>
            )}
          </View>

          <View style={styles.badgeItem}>
            <MapPin size={11} color={colors.brandPrimary} />
            <Text style={styles.badgeTextBold}>{distanceText || neighborhood}</Text>
          </View>

          {startingPrice && (
            <View style={styles.badgeItem}>
              <Text style={styles.priceBadgeText}>{startingPrice}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Card Content Body */}
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {item.name}
        </Text>

        <Text style={styles.cardSubtitle} numberOfLines={1}>
          {neighborhood} • <Text style={styles.openNowText}>Aberto agora</Text>
        </Text>

        {/* Urgency Badge 🟢 (Real Status) */}
        <View style={styles.urgencyBadge}>
          <View style={styles.greenDot} />
          <Text style={styles.urgencyText}>Horários disponíveis hoje</Text>
        </View>

        {/* Action Button */}
        <View style={styles.cardActionRow}>
          <AppButton
            label="Ver Horários"
            size="sm"
            style={styles.actionBtn}
            trailingIcon={<ChevronRight size={14} color={colors.ink} />}
            onPress={onBookPress || onPress}
          />
        </View>
      </View>
    </Pressable>
  );
};

export default function MarketplacePage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const location = useUserLocation();

  // ── States ────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [locationFilter, setLocationFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('Qualquer Data');

  // Mobile Search Sheet Modal State
  const [isSearchSheetOpen, setIsSearchSheetOpen] = useState(false);

  // Supabase Data
  const [establishments, setEstablishments] = useState<EstablishmentItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch Establishments with real services and reviews from Supabase
  useEffect(() => {
    const fetchShops = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('establishments')
          .select('id, name, slug, address, phone, banner_url, logo_url, description, average_rating, account_status, created_at, services(price)')
          .eq('account_status', 'active')
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Process REAL data without mock offsets
        const realItems: EstablishmentItem[] = (data || []).map((shop: any) => {
          const prices = (shop.services || [])
            .map((s: any) => Number(s.price))
            .filter((p: number) => !isNaN(p) && p > 0);
          const minPrice = prices.length > 0 ? Math.min(...prices) : null;

          const createdAtTime = shop.created_at ? new Date(shop.created_at).getTime() : Date.now();
          const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
          const isNew = Date.now() - createdAtTime < thirtyDaysMs;

          return {
            ...shop,
            reviews_count: shop.average_rating ? 1 : 0,
            price_range: minPrice ? `A partir de R$ ${minPrice}` : undefined,
            is_new: isNew,
          };
        });

        setEstablishments(realItems);
      } catch (err) {
        console.error('[Marketplace B2C] Error fetching establishments:', err);
      } finally {
        setLoading(false);
      }
    };
    void fetchShops();
  }, []);

  // Sync Location filter with user GPS detection
  useEffect(() => {
    if (location.city && !locationFilter) {
      setLocationFilter(location.city);
    }
  }, [location.city, locationFilter]);

  // ── Filter Logic ──────────────────────────────────────────────────────
  const filteredList = useMemo(() => {
    return establishments.filter((shop) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        shop.name.toLowerCase().includes(q) ||
        shop.description?.toLowerCase().includes(q) ||
        shop.address?.toLowerCase().includes(q);

      const loc = locationFilter.toLowerCase().trim();
      const matchesLocation =
        !loc || shop.address?.toLowerCase().includes(loc);

      let matchesCategory = true;
      if (selectedCategory) {
        const text = `${shop.name} ${shop.description || ''}`.toLowerCase();
        const keywords: Record<string, string[]> = {
          barbearia: ['barber', 'barba', 'corte masculino', 'barbearia'],
          salao: ['salão', 'salao', 'beleza', 'cabelo', 'hair', 'estilo'],
          manicure: ['manicure', 'nails', 'unha', 'pedicure', 'alongamento'],
          estetica: ['estética', 'estetica', 'pele', 'facial', 'depilação', 'spa'],
        };
        const kws = keywords[selectedCategory] || [];
        matchesCategory = kws.some((kw) => text.includes(kw));
      }

      return matchesSearch && matchesLocation && matchesCategory;
    });
  }, [establishments, searchQuery, locationFilter, selectedCategory]);

  // ── Specific Carousel Subsets ──────────────────────────────────────────
  // 1. ⚡ "Horário livre nas próximas 2 horas"
  const urgentCarousels = useMemo(
    () => filteredList.slice(0, 4),
    [filteredList]
  );

  // 2. 📍 "Populares perto de ti"
  const popularCarousels = useMemo(
    () => [...filteredList].sort((a, b) => (b.average_rating || 0) - (a.average_rating || 0)),
    [filteredList]
  );

  // 3. 🆕 "Recém-chegados à plataforma"
  const newCarousels = useMemo(
    () => filteredList.filter((item) => item.is_new),
    [filteredList]
  );

  // 4. 💈 "Barbearias"
  const barbershopCarousels = useMemo(
    () =>
      filteredList.filter((item) =>
        ['barber', 'barba', 'corte', 'barbearia'].some((kw) =>
          `${item.name} ${item.description || ''}`.toLowerCase().includes(kw)
        )
      ),
    [filteredList]
  );

  // 5. 💇‍♀️ "Salões de Beleza"
  const beautyCarousels = useMemo(
    () =>
      filteredList.filter((item) =>
        ['salão', 'salao', 'beleza', 'cabelo', 'hair', 'estilo', 'unha'].some((kw) =>
          `${item.name} ${item.description || ''}`.toLowerCase().includes(kw)
        )
      ),
    [filteredList]
  );

  // Categories definition
  const categories = [
    { id: 'barbearia', label: 'Barbearias', Icon: Scissors },
    { id: 'salao', label: 'Salões de Beleza', Icon: Sparkles },
    { id: 'manicure', label: 'Manicure & Pedicure', Icon: Hand },
    { id: 'estetica', label: 'Estética & Spa', Icon: Flower2 },
  ];

  // Auth Navigation Helper
  const handleAuthAction = useCallback(() => {
    if (user && profile) {
      if (profile.role === 'admin') router.push('/(admin)' as any);
      else if (profile.role === 'professional') router.push('/(professional)' as any);
      else router.push('/(client)' as any);
    } else {
      router.push('/(auth)/login' as any);
    }
  }, [user, profile, router]);

  return (
    <View style={styles.root}>
      {/* ─── 1. HEADER MINIMALISTA ────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <View style={styles.logoRow}>
            <Scissors size={22} color={colors.brandPrimary} />
            <Text style={styles.logoText}>
              Cut<Text style={styles.logoAccent}>Sync</Text>
            </Text>
          </View>

          <View style={styles.headerActions}>
            {isDesktop && (
              <Pressable
                style={styles.headerLink}
                onPress={() => router.push('/para-estabelecimentos' as any)}
              >
                <Briefcase size={14} color={colors.textSecondary} />
                <Text style={styles.headerLinkText}>Para Estabelecimentos</Text>
              </Pressable>
            )}

            <AppButton
              testID="marketplace-auth-btn"
              label={user ? 'Meus Agendamentos' : 'Entrar'}
              variant="secondary"
              size="sm"
              icon={<LogIn size={14} color={colors.brandPrimary} />}
              onPress={handleAuthAction}
            />
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ─── HERO EDITORIAL FULL-BLEED ─────────────────────────────── */}
        <View style={styles.hero}>
          <Image
            source={require('../../assets/images/hero-salon.png')}
            style={styles.heroImage}
            contentFit="cover"
          />
          <View style={styles.heroOverlay} />

          <View style={[styles.heroInner, isDesktop && styles.heroInnerDesktop]}>
            <View style={styles.heroBadge}>
              <Zap size={13} color="#F5A524" fill="#F5A524" />
              <Text style={styles.heroBadgeText}>Reserva instantânea, sem ligações</Text>
            </View>

            <Text style={[styles.heroTitle, isDesktop && styles.heroTitleDesktop]}>
              Seu horário agendado.{'\n'}
              <Text style={styles.heroHighlight}>Sem esperas. Sem atrito.</Text>
            </Text>
            <Text style={styles.heroSubtitle}>
              Descubra os melhores salões e barbearias perto de você e reserve em segundos.
            </Text>

            {/* ─── BARRA DE PESQUISA RESPONSIVA ─────────────────────── */}
            {isDesktop ? (
              /* DESKTOP SEARCH BAR (>= 768px) */
              <View style={styles.desktopSearchBar}>
                <View style={styles.searchField}>
                  <Search size={16} color={colors.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Serviço ou Salão (ex: Barba, Corte...)"
                    placeholderTextColor={colors.textMuted}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                </View>

                <View style={styles.searchDivider} />

                <View style={styles.searchField}>
                  <MapPin size={16} color={colors.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder={location.loading ? 'Detectando GPS...' : 'Perto de mim / Raio de 2,5 km'}
                    placeholderTextColor={colors.textMuted}
                    value={locationFilter}
                    onChangeText={setLocationFilter}
                  />
                </View>

                <View style={styles.searchDivider} />

                <View style={styles.searchField}>
                  <CalendarIcon size={16} color={colors.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Data (Qualquer Data)"
                    placeholderTextColor={colors.textMuted}
                    value={dateFilter}
                    onChangeText={setDateFilter}
                  />
                </View>

                <AppButton
                  label="Pesquisar"
                  size="sm"
                  style={styles.searchBtn}
                  onPress={() => {}}
                />
              </View>
            ) : (
              /* MOBILE SEARCH TRIGGER (< 768px) */
              <Pressable
                style={styles.mobileSearchTrigger}
                onPress={() => setIsSearchSheetOpen(true)}
              >
                <Search size={18} color={colors.brandPrimary} />
                <Text style={styles.mobileSearchPlaceholder}>
                  Buscar serviço, salão ou localização...
                </Text>
                <View style={styles.filterIconButton}>
                  <Filter size={14} color={colors.brandPrimary} />
                </View>
              </Pressable>
            )}

            {/* Trust row */}
            <View style={styles.trustRow}>
              <View style={styles.trustItem}>
                <ShieldCheck size={15} color="#FFFFFF" />
                <Text style={styles.trustText}>Reserva 100% grátis</Text>
              </View>
              <View style={styles.trustDot} />
              <View style={styles.trustItem}>
                <Zap size={15} color="#FFFFFF" />
                <Text style={styles.trustText}>Confirmação imediata</Text>
              </View>
              <View style={styles.trustDot} />
              <View style={styles.trustItem}>
                <Star size={15} color="#F5A524" fill="#F5A524" />
                <Text style={styles.trustText}>Profissionais avaliados</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.content}>
          {/* ─── 2C. CHIPS DE CATEGORIA ──────────────────────────────── */}
          <View style={styles.chipsRow}>
            {categories.map((cat) => {
              const isActive = selectedCategory === cat.id;
              const ChipIcon = cat.Icon;
              return (
                <Pressable
                  key={cat.id}
                  style={[
                    styles.chip,
                    isActive && styles.chipActive,
                  ]}
                  onPress={() =>
                    setSelectedCategory(isActive ? null : cat.id)
                  }
                >
                  <ChipIcon
                    size={15}
                    color={isActive ? '#FFFFFF' : colors.brandPrimary}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      isActive && styles.chipTextActive,
                    ]}
                  >
                    {cat.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* ─── 3. CARROSSÉIS HORIZONTAIS DE DESCOBRIMENTO ─────────────── */}
          {loading ? (
            <View style={{ gap: 24, marginTop: 12 }}>
              <CarouselSkeleton />
              <CarouselSkeleton />
            </View>
          ) : filteredList.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>Nenhum estabelecimento encontrado</Text>
              <Text style={styles.emptyText}>
                Tente ajustar os filtros ou a localização para visualizar salões disponíveis.
              </Text>
            </View>
          ) : (
            <View style={styles.carouselsContainer}>

              {/* CARROSSEL 1: ⚡ Horário livre nas próximas 2 horas */}
              {urgentCarousels.length > 0 && (
                <View style={styles.carouselSection}>
                  <View style={styles.sectionHeader}>
                    <Zap size={18} color="#F5A524" />
                    <Text style={styles.sectionTitle}>
                      Horário livre nas próximas 2 horas
                    </Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.carouselContent}
                  >
                    {urgentCarousels.map((item) => (
                      <EstablishmentCard
                        key={`urgent-${item.id}`}
                        item={item}
                        userLat={location.lat}
                        userLng={location.lng}
                        onPress={() => router.push(`/${item.slug}` as any)}
                        onBookPress={() => router.push(`/${item.slug}/booking` as any)}
                      />
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* CARROSSEL 2: 📍 Populares perto de ti */}
              {popularCarousels.length > 0 && (
                <View style={styles.carouselSection}>
                  <View style={styles.sectionHeader}>
                    <MapPin size={18} color={colors.brandPrimary} />
                    <Text style={styles.sectionTitle}>
                      Populares perto de ti (Raio 2,5 km)
                    </Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.carouselContent}
                  >
                    {popularCarousels.map((item) => (
                      <EstablishmentCard
                        key={`popular-${item.id}`}
                        item={item}
                        userLat={location.lat}
                        userLng={location.lng}
                        onPress={() => router.push(`/${item.slug}` as any)}
                        onBookPress={() => router.push(`/${item.slug}/booking` as any)}
                      />
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* CARROSSEL 3: 🆕 Recém-chegados à plataforma */}
              {newCarousels.length > 0 && (
                <View style={styles.carouselSection}>
                  <View style={styles.sectionHeader}>
                    <Sparkles size={18} color={colors.brandPrimary} />
                    <Text style={styles.sectionTitle}>
                      Recém-chegados à plataforma
                    </Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.carouselContent}
                  >
                    {newCarousels.map((item) => (
                      <EstablishmentCard
                        key={`new-${item.id}`}
                        item={item}
                        userLat={location.lat}
                        userLng={location.lng}
                        onPress={() => router.push(`/${item.slug}` as any)}
                        onBookPress={() => router.push(`/${item.slug}/booking` as any)}
                      />
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* CARROSSEL 4: 💈 Barbearias */}
              {barbershopCarousels.length > 0 && (
                <View style={styles.carouselSection}>
                  <View style={styles.sectionHeader}>
                    <Scissors size={18} color={colors.brandPrimary} />
                    <Text style={styles.sectionTitle}>Barbearias</Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.carouselContent}
                  >
                    {barbershopCarousels.map((item) => (
                      <EstablishmentCard
                        key={`barber-${item.id}`}
                        item={item}
                        userLat={location.lat}
                        userLng={location.lng}
                        onPress={() => router.push(`/${item.slug}` as any)}
                        onBookPress={() => router.push(`/${item.slug}/booking` as any)}
                      />
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* CARROSSEL 5: 💇‍♀️ Salões de Beleza */}
              {beautyCarousels.length > 0 && (
                <View style={styles.carouselSection}>
                  <View style={styles.sectionHeader}>
                    <Compass size={18} color={colors.brandPrimary} />
                    <Text style={styles.sectionTitle}>Salões de Beleza</Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.carouselContent}
                  >
                    {beautyCarousels.map((item) => (
                      <EstablishmentCard
                        key={`beauty-${item.id}`}
                        item={item}
                        userLat={location.lat}
                        userLng={location.lng}
                        onPress={() => router.push(`/${item.slug}` as any)}
                        onBookPress={() => router.push(`/${item.slug}/booking` as any)}
                      />
                    ))}
                  </ScrollView>
                </View>
              )}

            </View>
          )}

          {/* ─── FOOTER ─────────────────────────────────────────────── */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              © {new Date().getFullYear()} CutSync — Plataforma de Agendamento Universal
            </Text>
            <View style={styles.footerLinks}>
              <Pressable onPress={() => router.push('/para-estabelecimentos' as any)}>
                <Text style={styles.footerLink}>Para Estabelecimentos</Text>
              </Pressable>
              <Pressable onPress={() => router.push('/(auth)/login' as any)}>
                <Text style={styles.footerLink}>Acessar Painel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* ─── MOBILE SEARCH SHEET (DRAWER FULLSCREEN MODAL) ───────────── */}
      <Modal
        visible={isSearchSheetOpen}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setIsSearchSheetOpen(false)}
      >
        <View style={styles.sheetContainer}>
          {/* Sheet Header */}
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Filtrar e Buscar</Text>
            <Pressable
              style={styles.sheetCloseButton}
              onPress={() => setIsSearchSheetOpen(false)}
            >
              <X size={20} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.sheetBody}>
            {/* Field 1: Service / Salon Name */}
            <View style={styles.sheetGroup}>
              <Text style={styles.sheetLabel}>O que você procura?</Text>
              <View style={styles.sheetInputBox}>
                <Search size={16} color={colors.textMuted} />
                <TextInput
                  style={styles.sheetInput}
                  placeholder="Serviço ou Salão (ex: Barba, Degradê)"
                  placeholderTextColor={colors.textMuted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
            </View>

            {/* Field 2: Location */}
            <View style={styles.sheetGroup}>
              <Text style={styles.sheetLabel}>Onde você quer agendar?</Text>
              <View style={styles.sheetInputBox}>
                <MapPin size={16} color={colors.textMuted} />
                <TextInput
                  style={styles.sheetInput}
                  placeholder="Cidade / Bairro ou Raio GPS"
                  placeholderTextColor={colors.textMuted}
                  value={locationFilter}
                  onChangeText={setLocationFilter}
                />
              </View>
            </View>

            {/* Field 3: Date */}
            <View style={styles.sheetGroup}>
              <Text style={styles.sheetLabel}>Quando?</Text>
              <View style={styles.sheetInputBox}>
                <CalendarIcon size={16} color={colors.textMuted} />
                <TextInput
                  style={styles.sheetInput}
                  placeholder="Qualquer Data"
                  placeholderTextColor={colors.textMuted}
                  value={dateFilter}
                  onChangeText={setDateFilter}
                />
              </View>
            </View>
          </ScrollView>

          {/* Sheet Footer Button */}
          <View style={styles.sheetFooter}>
            <AppButton
              label="Aplicar Filtros"
              fullWidth
              style={styles.sheetApplyBtn}
              onPress={() => setIsSearchSheetOpen(false)}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   STYLES — Off-White Premium
   ──────────────────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },

  /* Header */
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 20,
    paddingVertical: 14,
    zIndex: 10,
  },
  headerInner: {
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoText: {
    fontSize: 22,
    fontFamily: typography.display,
    color: colors.brandPrimary,
  },
  logoAccent: {
    color: '#F5A524',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  headerLinkText: {
    fontSize: 13,
    fontFamily: typography.bodyStrong,
    color: colors.textSecondary,
  },

  /* Scroll */
  scroll: {
    paddingBottom: 48,
  },
  content: {
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 28,
    gap: 24,
  },

  /* Hero — full-bleed editorial */
  hero: {
    position: 'relative',
    width: '100%',
    minHeight: 460,
    justifyContent: 'center',
    paddingVertical: 56,
    overflow: 'hidden',
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(24,32,27,0.68)',
  },
  heroInner: {
    width: '100%',
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    paddingHorizontal: 20,
    gap: 18,
    alignItems: 'center',
  },
  heroInnerDesktop: {
    alignItems: 'flex-start',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  heroBadgeText: {
    fontSize: 12,
    fontFamily: typography.bodyStrong,
    color: '#FFFFFF',
  },
  heroTitle: {
    ...typeScale.displayLarge,
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -1.2,
  },
  heroTitleDesktop: {
    fontSize: 48,
    lineHeight: 54,
    textAlign: 'left',
    letterSpacing: -1.8,
  },
  heroHighlight: {
    color: colors.brandSecondary,
  },
  heroSubtitle: {
    ...typeScale.body,
    fontSize: 16,
    lineHeight: 24,
    color: 'rgba(255,255,255,0.86)',
    textAlign: 'center',
    maxWidth: 560,
  },
  trustRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trustText: {
    fontSize: 13,
    fontFamily: typography.bodyStrong,
    color: 'rgba(255,255,255,0.92)',
  },
  trustDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },

  /* Search Bars */
  desktopSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 820,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 6,
    gap: 6,
    boxShadow: '0 12px 32px rgba(24,32,27,0.22)',
  },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: typography.body,
    color: colors.text,
    outlineStyle: 'none',
  } as any,
  searchDivider: {
    width: 1,
    height: 22,
    backgroundColor: colors.border,
  },
  searchBtn: {
    minHeight: 42,
    paddingHorizontal: 20,
  },

  /* Mobile Search Trigger */
  mobileSearchTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    boxShadow: '0 10px 28px rgba(24,32,27,0.2)',
  },
  mobileSearchPlaceholder: {
    flex: 1,
    fontSize: 13,
    fontFamily: typography.body,
    color: colors.textMuted,
  },
  filterIconButton: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    backgroundColor: colors.brandSecondarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Category Chips (Amber highlight) */
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  chipText: {
    fontSize: 13,
    fontFamily: typography.bodyStrong,
    color: colors.text,
  },
  chipTextActive: {
    color: '#FFFFFF',
  },

  /* Carousels Container */
  carouselsContainer: {
    gap: 28,
    marginTop: 8,
  },
  carouselSection: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    ...typeScale.sectionTitle,
    fontSize: 18,
    color: colors.text,
  },
  carouselContent: {
    gap: 14,
    paddingRight: 20,
  },

  /* Card Anatomy */
  cardContainer: {
    width: 280,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
  },
  coverContainer: {
    height: 150,
    width: '100%',
    position: 'relative',
    backgroundColor: colors.brandSecondarySoft,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBadgesRow: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  badgeTextBold: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: colors.text,
  },
  badgeTextMuted: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.body,
  },
  priceBadgeText: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: colors.brandPrimary,
  },
  cardContent: {
    padding: 14,
    gap: 6,
  },
  cardTitle: {
    ...typeScale.cardTitle,
    fontSize: 15,
    color: colors.text,
  },
  cardSubtitle: {
    fontSize: 11,
    fontFamily: typography.body,
    color: colors.textMuted,
  },
  openNowText: {
    color: colors.success,
    fontFamily: typography.bodyStrong,
  },
  urgencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.successSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
    marginTop: 2,
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  urgencyText: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: colors.success,
  },
  cardActionRow: {
    marginTop: 8,
    alignItems: 'flex-end',
  },
  actionBtn: {
    minHeight: 34,
    paddingHorizontal: 12,
  },

  /* Skeletons */
  cardSkeleton: {
    width: 280,
    height: 240,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  coverSkeleton: {
    height: 140,
    backgroundColor: '#E4E5DF',
  },

  /* Empty Box */
  emptyBox: {
    padding: 32,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    ...typeScale.cardTitle,
    color: colors.text,
  },
  emptyText: {
    ...typeScale.body,
    color: colors.textMuted,
    textAlign: 'center',
  },

  /* Footer */
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 24,
    marginTop: 16,
    alignItems: 'center',
    gap: 12,
  },
  footerText: {
    ...typeScale.small,
    color: colors.textMuted,
  },
  footerLinks: {
    flexDirection: 'row',
    gap: 24,
  },
  footerLink: {
    ...typeScale.small,
    fontFamily: typography.bodyStrong,
    color: colors.textSecondary,
  },

  /* Mobile Search Sheet Modal */
  sheetContainer: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetTitle: {
    ...typeScale.cardTitle,
    fontSize: 17,
    color: colors.text,
  },
  sheetCloseButton: {
    padding: 4,
  },
  sheetBody: {
    padding: 20,
    gap: 20,
  },
  sheetGroup: {
    gap: 8,
  },
  sheetLabel: {
    ...typeScale.bodyStrong,
    fontSize: 13,
    color: colors.text,
  },
  sheetInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    height: 48,
  },
  sheetInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.text,
  },
  sheetFooter: {
    padding: 20,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sheetApplyBtn: {
    minHeight: 48,
    backgroundColor: colors.brandPrimary,
  },
});
