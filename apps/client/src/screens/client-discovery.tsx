import { validateClientDiscoveryQuery } from '@cutsync/validation';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  CategoryChip,
  COMPACT_CARD_WIDTH,
  CompactEstablishmentCard,
  DiscoveryLoading,
  DiscoveryMessage,
  EstablishmentCard,
  FEATURED_CARD_WIDTH,
  FeaturedEstablishmentCard,
  discoveryColors,
} from '@/components/discovery/client-discovery-ui';
import { ClientBrand } from '@/components/settings/client-settings-ui';
import {
  type ClientDiscoveryEstablishment,
  listClientDiscoveryEstablishments,
} from '@/features/discovery/client-discovery-service';

type CategoryFilter = {
  id: string;
  label: string;
  keywords: string[];
};

const CATEGORIES: CategoryFilter[] = [
  { id: 'all', label: 'Todos', keywords: [] },
  { id: 'barber', label: 'Barbearia', keywords: ['barber', 'barbe', 'corte', 'masculin'] },
  { id: 'salon', label: 'Salão', keywords: ['salão', 'salao', 'cabelo', 'hair'] },
  { id: 'esthetics', label: 'Estética', keywords: ['estética', 'estetica', 'facial', 'skin', 'pele'] },
  { id: 'nails', label: 'Unhas', keywords: ['unha', 'nail', 'manicure', 'pedicure'] },
  { id: 'brows', label: 'Sobrancelha', keywords: ['sobrancelha', 'brow', 'design de sobra'] },
  { id: 'wellness', label: 'Bem-estar', keywords: ['massagem', 'spa', 'relax', 'wellness'] },
];

const CARD_SNAP_INTERVAL = COMPACT_CARD_WIDTH + 14;
const FEATURED_SNAP_INTERVAL = FEATURED_CARD_WIDTH + 14;

const matchesCategory = (item: ClientDiscoveryEstablishment, category: CategoryFilter) => {
  if (category.keywords.length === 0) return true;
  const bag = [
    item.name,
    item.slogan ?? '',
    item.description ?? '',
    ...item.serviceNames,
  ].join(' ').toLowerCase();
  return category.keywords.some((word) => bag.includes(word));
};

export function ClientDiscoveryScreen() {
  const router = useRouter();
  const requestSequence = useRef(0);
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [establishments, setEstablishments] = useState<ClientDiscoveryEstablishment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const load = useCallback(async (nextQuery: string, refresh = false) => {
    const sequence = ++requestSequence.current;
    setActiveQuery(nextQuery);
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const result = await listClientDiscoveryEstablishments(nextQuery);
      if (sequence !== requestSequence.current) return;
      setEstablishments(result);
    } catch (nextError) {
      if (sequence !== requestSequence.current) return;
      setError(nextError instanceof Error ? nextError.message : 'Não foi possível carregar a descoberta.');
    } finally {
      if (sequence === requestSequence.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void load('');
  }, [load]);

  const changeQuery = (nextValue: string) => {
    const validation = validateClientDiscoveryQuery(nextValue);
    if (!validation.ok) {
      setValidationError(validation.message);
      return;
    }
    setValidationError(null);
    setQuery(nextValue);
  };

  const submitSearch = () => {
    const validation = validateClientDiscoveryQuery(query);
    if (!validation.ok) {
      setValidationError(validation.message);
      return;
    }
    setQuery(validation.query);
    void load(validation.query);
  };

  const clearSearch = () => {
    setQuery('');
    setValidationError(null);
    void load('');
  };

  const openEstablishment = useCallback((slug: string) => {
    router.push({ pathname: '/establishments/[slug]', params: { slug } });
  }, [router]);

  // Client-side buckets for the carousels.
  const filtered = useMemo(() => {
    const category = CATEGORIES.find((entry) => entry.id === selectedCategory) ?? CATEGORIES[0];
    return establishments.filter((item) => matchesCategory(item, category));
  }, [establishments, selectedCategory]);

  const featured = useMemo(() => (
    [...filtered]
      .sort((a, b) => b.averageRating - a.averageRating || b.reviewCount - a.reviewCount)
      .slice(0, 6)
  ), [filtered]);

  const nearby = useMemo(() => (
    filtered.length <= 6 ? filtered : filtered.slice(0, 10)
  ), [filtered]);

  const popular = useMemo(() => (
    [...filtered]
      .sort((a, b) => b.reviewCount - a.reviewCount)
      .slice(0, 10)
  ), [filtered]);

  const isSearching = Boolean(activeQuery);
  const totalLabel = isLoading ? 'Carregando…' : filtered.length + (filtered.length === 1 ? ' lugar' : ' lugares');

  return (
    <SafeAreaView testID="client-discovery-screen" style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={(
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => { void load(activeQuery, true); }}
            tintColor={discoveryColors.accent}
          />
        )}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topbar}>
          <ClientBrand />
          <Pressable
            testID="client-discovery-open-account"
            accessibilityRole="button"
            accessibilityLabel="Abrir minha conta"
            onPress={() => router.replace('/')}
            style={({ pressed }) => [styles.accountButton, pressed && styles.pressed]}
          >
            <Text style={styles.accountButtonText}>Conta</Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>DESCUBRA PERTO DE VOCÊ</Text>
          <Text style={styles.title}>Seu próximo{'\n'}cuidado começa aqui.</Text>
          <Text style={styles.description}>
            Estabelecimentos, serviços, profissionais e regiões — tudo num lugar só.
          </Text>
        </View>

        <View style={[styles.searchField, validationError && styles.searchFieldError]}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            testID="client-discovery-search"
            accessibilityLabel="Buscar estabelecimentos e profissionais"
            autoCapitalize="words"
            autoCorrect={false}
            enterKeyHint="search"
            maxLength={80}
            onChangeText={changeQuery}
            onSubmitEditing={submitSearch}
            placeholder="Buscar nome, serviço ou região"
            placeholderTextColor={discoveryColors.muted}
            returnKeyType="search"
            style={styles.searchInput}
            value={query}
          />
          {!!query ? (
            <Pressable
              testID="client-discovery-clear-search"
              accessibilityRole="button"
              accessibilityLabel="Limpar busca"
              onPress={clearSearch}
              hitSlop={8}
              style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
            >
              <Text style={styles.clearButtonText}>×</Text>
            </Pressable>
          ) : (
            <Pressable
              testID="client-discovery-submit"
              accessibilityRole="button"
              accessibilityLabel="Buscar"
              onPress={submitSearch}
              hitSlop={8}
              style={({ pressed }) => [styles.searchGoButton, pressed && styles.pressed]}
            >
              <Text style={styles.searchGoButtonText}>Buscar</Text>
            </Pressable>
          )}
        </View>
        {!!validationError && (
          <Text testID="client-discovery-search-error" accessibilityLiveRegion="polite" style={styles.validationError}>
            {validationError}
          </Text>
        )}

        {!isSearching && !isLoading && !error && establishments.length > 0 && (
          <ScrollView
            testID="client-discovery-categories"
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoriesRow}
          >
            {CATEGORIES.map((category) => (
              <CategoryChip
                key={category.id}
                testID={'client-discovery-category-' + category.id}
                label={category.label}
                active={selectedCategory === category.id}
                onPress={() => setSelectedCategory(category.id)}
              />
            ))}
          </ScrollView>
        )}

        {isLoading ? (
          <View style={styles.paddedContent}>
            <DiscoveryLoading />
          </View>
        ) : error ? (
          <View style={styles.paddedContent}>
            <DiscoveryMessage
              testID="client-discovery-error"
              title="A busca não carregou"
              description={error}
              actionLabel="Tentar novamente"
              onAction={() => { void load(activeQuery); }}
            />
          </View>
        ) : establishments.length === 0 ? (
          <View style={styles.paddedContent}>
            <DiscoveryMessage
              testID="client-discovery-empty"
              title="Nenhum lugar encontrado"
              description="Tente buscar por outro nome, serviço, profissional ou região."
              actionLabel={activeQuery ? 'Limpar busca' : undefined}
              onAction={activeQuery ? clearSearch : undefined}
            />
          </View>
        ) : isSearching ? (
          <View style={styles.paddedContent}>
            <View style={styles.resultsHeader}>
              <View style={styles.resultsCopy}>
                <Text style={styles.resultsEyebrow}>RESULTADOS DA BUSCA</Text>
                <Text testID="client-discovery-result-count" style={styles.resultsTitle}>
                  {totalLabel}
                </Text>
              </View>
              <View style={styles.activeQueryPill}>
                <Text numberOfLines={1} style={styles.activeQueryText}>{activeQuery}</Text>
              </View>
            </View>
            <View testID="client-discovery-results" style={styles.searchResults}>
              {establishments.map((establishment) => (
                <EstablishmentCard
                  key={establishment.id}
                  establishment={establishment}
                  onPress={() => openEstablishment(establishment.slug)}
                />
              ))}
            </View>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.paddedContent}>
            <DiscoveryMessage
              testID="client-discovery-category-empty"
              title="Nada por aqui ainda"
              description="Nenhum lugar corresponde a esta categoria. Explore outra opção."
              actionLabel="Ver todos"
              onAction={() => setSelectedCategory('all')}
            />
          </View>
        ) : (
          <>
            {featured.length > 0 && (
              <View style={styles.carouselSection}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionCopy}>
                    <Text style={styles.sectionEyebrow}>DESTAQUES</Text>
                    <Text style={styles.sectionTitle}>Melhores avaliados</Text>
                  </View>
                  <Text style={styles.sectionCount}>{featured.length}</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  decelerationRate="fast"
                  snapToInterval={FEATURED_SNAP_INTERVAL}
                  snapToAlignment="start"
                  contentContainerStyle={styles.carouselContent}
                  testID="client-discovery-carousel-featured"
                >
                  {featured.map((item) => (
                    <FeaturedEstablishmentCard
                      key={item.id}
                      establishment={item}
                      onPress={() => openEstablishment(item.slug)}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            {nearby.length > 0 && (
              <View style={styles.carouselSection}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionCopy}>
                    <Text style={styles.sectionEyebrow}>PARA CONHECER</Text>
                    <Text style={styles.sectionTitle}>Lugares próximos a você</Text>
                  </View>
                  <Text style={styles.sectionCount}>{nearby.length}</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  decelerationRate="fast"
                  snapToInterval={CARD_SNAP_INTERVAL}
                  snapToAlignment="start"
                  contentContainerStyle={styles.carouselContent}
                  testID="client-discovery-carousel-nearby"
                >
                  {nearby.map((item) => (
                    <CompactEstablishmentCard
                      key={item.id}
                      establishment={item}
                      onPress={() => openEstablishment(item.slug)}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            {popular.length > 0 && (
              <View style={styles.carouselSection}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionCopy}>
                    <Text style={styles.sectionEyebrow}>QUERIDINHOS</Text>
                    <Text style={styles.sectionTitle}>Mais reservados</Text>
                  </View>
                  <Text style={styles.sectionCount}>{popular.length}</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  decelerationRate="fast"
                  snapToInterval={CARD_SNAP_INTERVAL}
                  snapToAlignment="start"
                  contentContainerStyle={styles.carouselContent}
                  testID="client-discovery-carousel-popular"
                >
                  {popular.map((item) => (
                    <CompactEstablishmentCard
                      key={item.id}
                      establishment={item}
                      onPress={() => openEstablishment(item.slug)}
                    />
                  ))}
                </ScrollView>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: discoveryColors.background },
  content: { paddingBottom: 56, gap: 22 },
  paddedContent: { paddingHorizontal: 20 },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingHorizontal: 20, paddingTop: 10 },
  accountButton: { minHeight: 40, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: discoveryColors.border, backgroundColor: discoveryColors.card, paddingHorizontal: 16 },
  accountButtonText: { color: discoveryColors.text, fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },

  hero: { gap: 12, paddingTop: 18, paddingHorizontal: 20 },
  eyebrow: { color: discoveryColors.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  title: { color: discoveryColors.text, fontSize: 40, lineHeight: 44, fontWeight: '800', letterSpacing: -1.4 },
  description: { color: discoveryColors.secondary, fontSize: 15, lineHeight: 23, maxWidth: 420 },

  searchField: {
    marginHorizontal: 20,
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: discoveryColors.border,
    borderRadius: 999,
    backgroundColor: discoveryColors.card,
    paddingLeft: 20,
    paddingRight: 6,
    boxShadow: '0 8px 22px rgba(20, 27, 23, 0.05)',
  },
  searchFieldError: { borderColor: '#C76D63', backgroundColor: '#FFF9F8' },
  searchIcon: { color: discoveryColors.muted, fontSize: 20, fontWeight: '700' },
  searchInput: { flex: 1, minHeight: 52, color: discoveryColors.text, fontSize: 15, paddingRight: 6 },
  clearButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: discoveryColors.accentSoft },
  clearButtonText: { color: discoveryColors.accent, fontSize: 22, fontWeight: '900', marginTop: -2 },
  searchGoButton: { minHeight: 44, justifyContent: 'center', borderRadius: 999, backgroundColor: discoveryColors.accent, paddingHorizontal: 20 },
  searchGoButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  validationError: { color: '#9A3D34', fontSize: 12, lineHeight: 18, paddingHorizontal: 24 },

  categoriesRow: { gap: 10, paddingHorizontal: 20, paddingRight: 32 },

  resultsHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, paddingBottom: 14 },
  resultsCopy: { gap: 4 },
  resultsEyebrow: { color: discoveryColors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  resultsTitle: { color: discoveryColors.text, fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.4 },
  activeQueryPill: { maxWidth: '52%', borderRadius: 999, backgroundColor: discoveryColors.accentSoft, paddingHorizontal: 12, paddingVertical: 8 },
  activeQueryText: { color: discoveryColors.accent, fontSize: 11, fontWeight: '800' },
  searchResults: { gap: 18 },

  carouselSection: { gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, paddingHorizontal: 20 },
  sectionCopy: { gap: 4, flex: 1 },
  sectionEyebrow: { color: discoveryColors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  sectionTitle: { color: discoveryColors.text, fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.4 },
  sectionCount: { color: discoveryColors.accent, fontSize: 12, fontWeight: '800', paddingBottom: 4 },
  carouselContent: { gap: 14, paddingHorizontal: 20, paddingRight: 32 },

  pressed: { opacity: 0.65 },
});
