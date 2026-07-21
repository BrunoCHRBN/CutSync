import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
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
  LogIn,
  MapPin,
  Search,
  Scissors,
  Star,
} from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';
import { useUserLocation } from '../hooks/useUserLocation';
import { AppButton } from '../components/ui/AppButton';
import { colors, layout, radii, typography, typeScale } from '../theme/tokens';

/* ────────────────────────────────────────────────────────────────────────────
   MARKETPLACE B2C — Rota Raiz /
   Vitrine pública de estabelecimentos reais do Supabase.
   ──────────────────────────────────────────────────────────────────────────── */

export default function MarketplacePage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width >= layout.mobileBreakpoint;
  const columns = width >= 1280 ? 3 : width >= layout.mobileBreakpoint ? 2 : 1;
  const location = useUserLocation();

  // ── Search & Filter State ─────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [locationFilter, setLocationFilter] = useState('');

  // ── Establishments from Supabase ──────────────────────────────────────
  const [establishments, setEstablishments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('establishments')
          .select('id, name, slug, address, phone, banner_url, logo_url, description, primary_color, average_rating, account_status')
          .eq('account_status', 'active')
          .order('name');
        if (error) throw error;
        setEstablishments(data || []);
      } catch (err) {
        console.error('[Marketplace] Failed to fetch establishments:', err);
      } finally {
        setLoading(false);
      }
    };
    void fetch();
  }, []);

  // Pre-fill location filter from detected city
  useEffect(() => {
    if (location.city && !locationFilter) {
      setLocationFilter(location.city);
    }
  }, [location.city, locationFilter]);

  // ── Filtering ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return establishments.filter((shop) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        shop.name?.toLowerCase().includes(q) ||
        shop.description?.toLowerCase().includes(q) ||
        shop.address?.toLowerCase().includes(q);

      const loc = locationFilter.toLowerCase().trim();
      const matchesLocation =
        !loc || shop.address?.toLowerCase().includes(loc);

      // Category keywords (simple heuristic based on name/description)
      let matchesCategory = true;
      if (selectedCategory) {
        const text = `${shop.name} ${shop.description || ''}`.toLowerCase();
        const keywords: Record<string, string[]> = {
          barbearia: ['barber', 'barba', 'corte masculino', 'barbearia'],
          salao: ['salão', 'salao', 'beleza', 'cabelo', 'hair'],
          manicure: ['manicure', 'nails', 'unha', 'pedicure'],
          estetica: ['estética', 'estetica', 'pele', 'facial', 'depilação'],
        };
        const kws = keywords[selectedCategory] || [];
        matchesCategory = kws.some((kw) => text.includes(kw));
      }

      return matchesSearch && matchesLocation && matchesCategory;
    });
  }, [establishments, searchQuery, locationFilter, selectedCategory]);

  // ── Categories ────────────────────────────────────────────────────────
  const categories = [
    { id: 'barbearia', label: '💈 Barbearia' },
    { id: 'salao', label: '💇‍♀️ Salão de Beleza' },
    { id: 'manicure', label: '💅 Manicure' },
    { id: 'estetica', label: '🪒 Estética' },
  ];

  // ── Auth CTA ──────────────────────────────────────────────────────────
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
      {/* ─── HEADER ──────────────────────────────────────────────────── */}
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
        <View style={styles.content}>
          {/* ─── HERO ──────────────────────────────────────────────── */}
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>
              Seu horário agendado.{'\n'}
              <Text style={styles.heroHighlight}>Sem esperas. Sem atrito.</Text>
            </Text>
            <Text style={styles.heroSubtitle}>
              Encontre os melhores salões e barbearias perto de você com confirmação instantânea.
            </Text>
          </View>

          {/* ─── SEARCH BAR ────────────────────────────────────────── */}
          <View style={styles.searchBar}>
            <View style={styles.searchField}>
              <Search size={16} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Qual serviço? (ex: Barba, Degradê...)"
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
                placeholder={location.loading ? 'Detectando localização...' : 'Cidade / Bairro'}
                placeholderTextColor={colors.textMuted}
                value={locationFilter}
                onChangeText={setLocationFilter}
              />
            </View>

            {isDesktop && (
              <>
                <View style={styles.searchDivider} />
                <View style={styles.searchField}>
                  <CalendarIcon size={16} color={colors.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Qualquer data"
                    placeholderTextColor={colors.textMuted}
                    editable={false}
                  />
                </View>
              </>
            )}

            <AppButton
              label="Buscar"
              size="sm"
              style={styles.searchBtn}
              onPress={() => {}}
            />
          </View>

          {/* ─── CATEGORY CHIPS ─────────────────────────────────────── */}
          <View style={styles.chipsRow}>
            {categories.map((cat) => (
              <Pressable
                key={cat.id}
                style={[
                  styles.chip,
                  selectedCategory === cat.id && styles.chipActive,
                ]}
                onPress={() =>
                  setSelectedCategory(selectedCategory === cat.id ? null : cat.id)
                }
              >
                <Text
                  style={[
                    styles.chipText,
                    selectedCategory === cat.id && styles.chipTextActive,
                  ]}
                >
                  {cat.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* ─── ESTABLISHMENTS GRID ────────────────────────────────── */}
          <View style={styles.gridSection}>
            <Text style={styles.sectionTitle}>
              {location.city
                ? `Estabelecimentos em ${location.city}`
                : 'Estabelecimentos em Destaque'}
            </Text>

            {loading ? (
              <ActivityIndicator color={colors.brandPrimary} style={{ marginVertical: 40 }} />
            ) : filtered.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>
                  Nenhum estabelecimento encontrado com os filtros atuais. Tente ajustar sua busca.
                </Text>
              </View>
            ) : (
              <View style={[styles.grid, { gap: 16 }]}>
                {filtered.map((shop) => (
                  <Pressable
                    key={shop.id}
                    style={[
                      styles.shopCard,
                      {
                        width: columns === 1 ? '100%' : undefined,
                        flexBasis: columns === 1 ? undefined : `${(100 / columns) - 2}%`,
                        flexGrow: columns === 1 ? undefined : 1,
                      },
                    ]}
                    onPress={() => router.push(`/${shop.slug}/booking` as any)}
                  >
                    {/* Cover Image */}
                    <View style={styles.coverBox}>
                      {shop.banner_url || shop.logo_url ? (
                        <Image
                          source={{ uri: shop.banner_url || shop.logo_url }}
                          style={styles.coverImg}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={styles.coverFallback}>
                          <Scissors size={28} color={colors.brandPrimary} />
                        </View>
                      )}

                      {/* Rating Badge */}
                      <View style={styles.ratingBadge}>
                        <Star size={11} color="#F5A524" fill="#F5A524" />
                        <Text style={styles.ratingText}>
                          {shop.average_rating ? Number(shop.average_rating).toFixed(1) : '4.9'}
                        </Text>
                      </View>
                    </View>

                    {/* Card Body */}
                    <View style={styles.cardBody}>
                      <Text style={styles.shopName} numberOfLines={1}>
                        {shop.name}
                      </Text>
                      <Text style={styles.shopAddress} numberOfLines={1}>
                        {shop.address || 'Endereço não informado'}
                      </Text>
                      <Text style={styles.shopDesc} numberOfLines={2}>
                        {shop.description || 'Atendimento especializado com hora marcada.'}
                      </Text>

                      <View style={styles.cardFooter}>
                        <AppButton
                          label="Ver Horários"
                          size="sm"
                          icon={<ChevronRight size={14} color={colors.ink} />}
                          iconPosition="right"
                          onPress={() => router.push(`/${shop.slug}/booking` as any)}
                        />
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* ─── MOBILE B2B LINK ────────────────────────────────────── */}
          {!isDesktop && (
            <Pressable
              style={styles.mobileB2BLink}
              onPress={() => router.push('/para-estabelecimentos' as any)}
            >
              <Briefcase size={16} color={colors.brandPrimary} />
              <Text style={styles.mobileB2BText}>
                É proprietário de um salão? Conheça o CutSync para Negócios →
              </Text>
            </Pressable>
          )}

          {/* ─── FOOTER ─────────────────────────────────────────────── */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>© {new Date().getFullYear()} CutSync — Plataforma de Agendamento Universal</Text>
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
    gap: 24,
  },

  /* Hero */
  hero: {
    alignItems: 'center',
    gap: 12,
    paddingTop: 40,
    paddingBottom: 8,
  },
  heroTitle: {
    ...typeScale.displayLarge,
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -1.2,
  },
  heroHighlight: {
    color: colors.brandPrimary,
  },
  heroSubtitle: {
    ...typeScale.body,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 540,
  },

  /* Search Bar */
  searchBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 6,
    gap: 6,
    ...Platform.select({
      web: { boxShadow: '0 2px 8px rgba(0,0,0,0.04)' } as any,
      default: {},
    }),
  },
  searchField: {
    flex: 1,
    minWidth: 160,
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
    ...Platform.select({ web: { outlineStyle: 'none' } as any, default: {} }),
  },
  searchDivider: {
    width: 1,
    height: 22,
    backgroundColor: colors.border,
  },
  searchBtn: {
    minHeight: 42,
    paddingHorizontal: 20,
  },

  /* Category Chips */
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
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
    fontSize: 12,
    fontFamily: typography.bodyStrong,
    color: colors.text,
  },
  chipTextActive: {
    color: colors.ink,
  },

  /* Grid */
  gridSection: {
    gap: 16,
  },
  sectionTitle: {
    ...typeScale.sectionTitle,
    color: colors.text,
  },
  emptyBox: {
    padding: 32,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  emptyText: {
    ...typeScale.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  shopCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 2px 6px rgba(0,0,0,0.03)' } as any,
      default: {},
    }),
  },
  coverBox: {
    height: 140,
    width: '100%',
    position: 'relative',
    backgroundColor: colors.brandSecondarySoft,
  },
  coverImg: {
    width: '100%',
    height: '100%',
  },
  coverFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  ratingText: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: colors.text,
  },
  cardBody: {
    padding: 16,
    gap: 6,
  },
  shopName: {
    ...typeScale.cardTitle,
    color: colors.text,
  },
  shopAddress: {
    fontSize: 11,
    fontFamily: typography.body,
    color: colors.textMuted,
  },
  shopDesc: {
    ...typeScale.small,
    color: colors.textSecondary,
  },
  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
    marginTop: 6,
    alignItems: 'flex-end',
  },

  /* Mobile B2B Link */
  mobileB2BLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.brandSecondarySoft,
    borderRadius: radii.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.brandBorder,
  },
  mobileB2BText: {
    flex: 1,
    ...typeScale.small,
    fontFamily: typography.bodyStrong,
    color: colors.brandPrimary,
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
});
