import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, Modal } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowUpRight, Clock3, MapPin, Search, Store } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabase';
import { Establishment, mapEstablishment } from '@cutsync/database';
import { ClientShell } from '../layout/ClientShell';
import { AppButton } from '../ui/AppButton';
import { EmptyState } from '../ui/EmptyState';
import { InlineNotice } from '../ui/InlineNotice';
import { SectionHeading } from '../ui/SectionHeading';
import { atmosphericShadow, colors, layout, radii, typography } from '../../theme/tokens';
import { initialsOf } from '../../theme/color';
import { tapLight } from '../../utils/haptics';
import { getOpeningStatus } from '@cutsync/domain';

const ShopCardSkeleton = () => {
  return (
    <View style={[styles.shopCard, styles.carouselSlide]}>
      <View style={[styles.visual, { backgroundColor: '#EBEBEB' }]} />
      <View style={styles.shopBody}>
        <View style={{ height: 16, backgroundColor: '#E5E5E5', borderRadius: 4, width: '60%' }} />
        <View style={{ height: 12, backgroundColor: '#F0F0F0', borderRadius: 4, width: '85%', marginTop: 12 }} />
        <View style={{ height: 12, backgroundColor: '#F0F0F0', borderRadius: 4, width: '45%', marginTop: 8 }} />
      </View>
    </View>
  );
};

const parseAddress = (address?: string | null) => {
  if (!address) return { estado: 'Outro', cidade: 'Geral', bairro: 'Geral' };
  const parts = address.split(',');
  let estado = 'Outro';
  let cidade = 'Geral';
  let bairro = 'Geral';

  if (parts.length >= 4) {
    bairro = parts[2].trim();
    const cityState = parts[3].trim().split('-');
    if (cityState.length >= 2) {
      cidade = cityState[0].trim();
      estado = cityState[1].trim();
    } else {
      cidade = cityState[0].trim();
    }
  } else if (parts.length === 3) {
    bairro = parts[1].trim();
    cidade = parts[2].trim();
  }
  return { estado, cidade, bairro };
};

/* ─── Carousel Component ────────────────────────────────────────────────── */
function ShopCarousel({
  shops,
  onOpen,
}: {
  shops: Establishment[];
  onOpen: (id: string) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const { width: winWidth } = useWindowDimensions();

  // Cards visible per page depending on window width
  const cardsPerPage = winWidth >= 1280 ? 3 : winWidth >= layout.mobileBreakpoint ? 2 : 1;
  const cardWidth = 320;
  const cardGap = 16;
  const pageWidth = cardsPerPage * (cardWidth + cardGap);
  const totalPages = Math.ceil(shops.length / cardsPerPage);

  const goTo = (page: number) => {
    const clamped = Math.max(0, Math.min(page, totalPages - 1));
    setCurrentPage(clamped);
    scrollRef.current?.scrollTo({ x: clamped * pageWidth, animated: true });
  };

  const handleScrollEnd = (e: any) => {
    const x = e.nativeEvent.contentOffset.x;
    const page = Math.round(x / pageWidth);
    setCurrentPage(Math.max(0, Math.min(page, totalPages - 1)));
  };

  const startIdx = currentPage * cardsPerPage;
  const endIdx = Math.min(startIdx + cardsPerPage, shops.length);

  return (
    <View testID="client-shops-grid" style={styles.carouselContainer}>
      {/* Navigation Row */}
      <View style={styles.carouselNavRow}>
        <Text style={styles.carouselPageInfo}>
          {startIdx + 1}–{endIdx} de {shops.length} estabelecimentos
        </Text>
        <View style={styles.carouselNavBtns}>
          <Pressable
            onPress={() => goTo(currentPage - 1)}
            disabled={currentPage === 0}
            style={[styles.carouselNavBtn, currentPage === 0 && styles.carouselNavBtnDisabled]}
            accessibilityLabel="Anterior"
          >
            <Text style={[styles.carouselNavBtnText, currentPage === 0 && styles.carouselNavBtnTextDisabled]}>‹</Text>
          </Pressable>
          <Pressable
            onPress={() => goTo(currentPage + 1)}
            disabled={currentPage >= totalPages - 1}
            style={[styles.carouselNavBtn, currentPage >= totalPages - 1 && styles.carouselNavBtnDisabled]}
            accessibilityLabel="Próximo"
          >
            <Text style={[styles.carouselNavBtnText, currentPage >= totalPages - 1 && styles.carouselNavBtnTextDisabled]}>›</Text>
          </Pressable>
        </View>
      </View>

      {/* Scrollable Track */}
      <ScrollView
        ref={scrollRef}
        horizontal
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        contentContainerStyle={styles.carouselTrack}
        style={styles.carouselScroll}
      >
        {shops.map((shop) => {
          const accent = shop.primaryColor || colors.accent;
          const opening = getOpeningStatus(shop.openingHours, shop.timezone);
          return (
            <Pressable
              key={shop.id}
              testID={`client-shop-card-${shop.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Ver ${shop.name}`}
              onPress={() => { tapLight(); onOpen(shop.id); }}
              style={({ pressed }) => [styles.shopCard, styles.carouselSlide, pressed && styles.pressed]}
            >
              <View style={styles.visual}>
                <Image
                  source={{ uri: shop.bannerUrl || 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&q=80&w=600' }}
                  style={styles.bannerVisualImage}
                  contentFit="cover"
                  transition={160}
                />
                <View style={[styles.visualLine, { backgroundColor: `${accent}59` }]} />
              </View>
              <View style={styles.shopBody}>
                <View style={styles.shopHeaderRow}>
                  <View style={styles.shopLogoCircle}>
                    {shop.logoUrl ? (
                      <Image source={{ uri: shop.logoUrl }} style={styles.shopLogoImage} contentFit="contain" />
                    ) : (
                      <Text style={styles.shopLogoLetter}>{initialsOf(shop.name)}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text testID={`client-shop-card-${shop.id}-name`} numberOfLines={1} style={styles.shopName}>{shop.name}</Text>
                    <View style={styles.ratingPriceRow}>
                      <Text style={styles.ratingText}>★ {shop.averageRating ? shop.averageRating.toFixed(1) : 'Novo'}</Text>
                      {!!shop.reviewCount && <Text style={styles.reviewCountText}>({shop.reviewCount})</Text>}
                      <Text style={styles.metaDivider}>·</Text>
                      <Text style={styles.priceLevelText}>{'$'.repeat(shop.priceLevel || 1)}</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.shopMeta}>
                  <MapPin color={colors.textSecondary} size={13} strokeWidth={1.6} />
                  <Text numberOfLines={2} style={styles.shopMetaText}>{shop.address || 'Endereço ainda não informado'}</Text>
                </View>
                <View style={styles.shopMeta}>
                  <Clock3 color={colors.textSecondary} size={13} strokeWidth={1.6} />
                  <View style={[styles.openDot, !opening.isOpen && styles.closedDot]} />
                  <Text numberOfLines={1} style={styles.shopMetaText}>{opening.isOpen ? `Aberto · ${opening.text}` : opening.text || 'Horários no perfil'}</Text>
                </View>
                <View style={styles.cardFooter}>
                  <Text style={styles.footerHint}>{shop.slug ? 'Agendar' : 'Ver perfil'}</Text>
                  <View style={styles.openButton}><ArrowUpRight color={colors.textSecondary} size={15} strokeWidth={1.8} /></View>
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Dot Indicators */}
      {totalPages > 1 && (
        <View style={styles.dotsRow}>
          {Array.from({ length: totalPages }).map((_, i) => (
            <Pressable key={i} onPress={() => goTo(i)} style={[styles.dot, i === currentPage && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

export const ExploreExperience = () => {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { search: searchParam } = useLocalSearchParams<{ search?: string }>();
  const { profile, signOut } = useAuth();
  const [barbershops, setBarbershops] = useState<Establishment[]>([]);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (searchParam) {
      setSearch(searchParam);
    }
  }, [searchParam]);
  const [openOnly, setOpenOnly] = useState(false);

  const [selectedEstado, setSelectedEstado] = useState('Todos');
  const [selectedCidade, setSelectedCidade] = useState('Todos');
  const [selectedBairro, setSelectedBairro] = useState('Todos');
  const [filterStep, setFilterStep] = useState<'estado' | 'cidade' | 'bairro'>('estado');
  const [selectedPriceLevel, setSelectedPriceLevel] = useState<number | null>(null);
  const [minRating, setMinRating] = useState<number | null>(null);

  const [bairroModalVisible, setBairroModalVisible] = useState(false);
  const [priceModalVisible, setPriceModalVisible] = useState(false);
  const [ratingModalVisible, setRatingModalVisible] = useState(false);

  const parsedLocations = useMemo(() => {
    return barbershops.map(shop => {
      const loc = parseAddress(shop.address);
      return { id: shop.id, ...loc };
    });
  }, [barbershops]);

  const uniqueEstados = useMemo(() => {
    const set = new Set<string>();
    parsedLocations.forEach(loc => set.add(loc.estado));
    return Array.from(set).sort();
  }, [parsedLocations]);

  const uniqueCidades = useMemo(() => {
    const set = new Set<string>();
    parsedLocations.forEach(loc => {
      if (selectedEstado === 'Todos' || loc.estado === selectedEstado) {
        set.add(loc.cidade);
      }
    });
    return Array.from(set).sort();
  }, [parsedLocations, selectedEstado]);

  const uniqueBairros = useMemo(() => {
    const set = new Set<string>();
    parsedLocations.forEach(loc => {
      if (
        (selectedEstado === 'Todos' || loc.estado === selectedEstado) &&
        (selectedCidade === 'Todos' || loc.cidade === selectedCidade)
      ) {
        set.add(loc.bairro);
      }
    });
    return Array.from(set).sort();
  }, [parsedLocations, selectedEstado, selectedCidade]);

  const locationLabel = useMemo(() => {
    if (selectedEstado === 'Todos') return 'Localização';
    if (selectedCidade === 'Todos') return selectedEstado;
    if (selectedBairro === 'Todos') return `${selectedCidade} - ${selectedEstado}`;
    return `${selectedBairro}, ${selectedCidade}`;
  }, [selectedEstado, selectedCidade, selectedBairro]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('establishments')
        .select('*')
        .eq('account_status', 'active')
        .order('name');
      if (queryError) throw queryError;
      setBarbershops((data || []).map(mapEstablishment));
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error('Não foi possível carregar os estabelecimentos.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const channel = supabase.channel(`explore-establishments-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'establishments' }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return barbershops.filter((shop) => {
      const matchesTerm = !term || [shop.name, shop.address, shop.slug].some((value) => value?.toLowerCase().includes(term));
      const matchesOpen = !openOnly || getOpeningStatus(shop.openingHours, shop.timezone).isOpen;
      
      const { estado, cidade, bairro } = parseAddress(shop.address);
      const matchesEstado = selectedEstado === 'Todos' || estado === selectedEstado;
      const matchesCidade = selectedCidade === 'Todos' || cidade === selectedCidade;
      const matchesBairro = selectedBairro === 'Todos' || bairro === selectedBairro;
      
      const matchesPrice = !selectedPriceLevel || shop.priceLevel === selectedPriceLevel;
      const matchesRating = !minRating || (shop.averageRating || 0) >= minRating;

      return matchesTerm && matchesOpen && matchesEstado && matchesCidade && matchesBairro && matchesPrice && matchesRating;
    });
  }, [barbershops, openOnly, search, selectedEstado, selectedCidade, selectedBairro, selectedPriceLevel, minRating]);

  const openShop = (id: string) => {
    tapLight();
    router.push({ pathname: '/(client)/barbershop', params: { barbershopId: id } });
  };

  return (
    <ClientShell testID="client-explore-screen" activeRoute="explore" userName={profile?.name} onSignOut={signOut}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} stickyHeaderIndices={[1]}>
        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text testID="client-explore-eyebrow" style={styles.eyebrow}>Descubra seu próximo atendimento</Text>
            <Text testID="client-explore-title" style={styles.title}>Encontre o lugar{`\n`}certo para você.</Text>
            <Text testID="client-explore-description" style={styles.description}>Compare estabelecimentos, conheça os serviços e marque sem ligações ou espera.</Text>
          </View>
        </View>
        <View style={styles.searchSticky}>
          <View style={styles.searchBox}>
            <Text style={styles.searchLabel}>Buscar estabelecimento</Text>
            <View style={[styles.searchField, searchFocused && styles.searchFieldFocused]}>
              <Search color={searchFocused ? colors.textSecondary : colors.textMuted} size={17} strokeWidth={1.8} />
              <TextInput
                testID="client-search-input"
                placeholder="Nome, bairro ou cidade"
                placeholderTextColor={colors.textMuted}
                selectionColor={colors.accent}
                value={search}
                onChangeText={setSearch}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                style={styles.searchInput}
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll} style={styles.filterContainer}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: openOnly }}
                onPress={() => setOpenOnly((current) => !current)}
                style={[styles.filterChip, openOnly && styles.filterChipSelected]}
                testID="client-filter-open-now"
              >
                <View style={[styles.openDot, !openOnly && styles.openDotMuted]} />
                <Text style={[styles.filterText, openOnly && styles.filterTextSelected]}>Aberto agora</Text>
              </Pressable>

              <Pressable
                onPress={() => { setFilterStep('estado'); setBairroModalVisible(true); }}
                style={[styles.filterChip, selectedEstado !== 'Todos' && styles.filterChipSelected]}
                testID="client-filter-bairro"
              >
                <Text style={[styles.filterText, selectedEstado !== 'Todos' && styles.filterTextSelected]}>
                  {locationLabel}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setPriceModalVisible(true)}
                style={[styles.filterChip, selectedPriceLevel !== null && styles.filterChipSelected]}
                testID="client-filter-price"
              >
                <Text style={[styles.filterText, selectedPriceLevel !== null && styles.filterTextSelected]}>
                  {selectedPriceLevel === null ? 'Preço' : `Preço: ${'$'.repeat(selectedPriceLevel)}`}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setRatingModalVisible(true)}
                style={[styles.filterChip, minRating !== null && styles.filterChipSelected]}
                testID="client-filter-rating"
              >
                <Text style={[styles.filterText, minRating !== null && styles.filterTextSelected]}>
                  {minRating === null ? 'Avaliação' : `★ ${minRating.toFixed(1)}+`}
                </Text>
              </Pressable>
            </ScrollView>

            <View style={styles.searchMeta}>
              <Text testID="client-search-result-count" style={styles.resultCount}>{filtered.length} {filtered.length === 1 ? 'estabelecimento encontrado' : 'estabelecimentos encontrados'}</Text>
            </View>
          </View>
        </View>

        <SectionHeading testID="client-shops-heading" eyebrow="Seleção CutSync" title="Estabelecimentos disponíveis" description="Informações reais de cada estabelecimento, direto da agenda do salão." />

        {!!error && <InlineNotice
          testID="client-shops-error"
          tone="danger"
          title="Não foi possível atualizar a vitrine"
          message="Verifique sua conexão e tente novamente."
          action={<AppButton testID="client-shops-retry-button" label="Tentar novamente" onPress={() => { void refresh(); }} variant="secondary" size="sm" />}
        />}

        {loading ? (
          <View testID="client-shops-loading-skeleton" style={styles.carouselContainer}>
            <View style={styles.carouselTrack}>
              <ShopCardSkeleton />
              <ShopCardSkeleton />
              <ShopCardSkeleton />
            </View>
          </View>
        ) : error && barbershops.length === 0 ? null : filtered.length === 0 ? (
          <EmptyState testID="client-shops-empty" title={search ? 'Nenhum resultado' : 'Novos estabelecimentos em breve'} description={search ? 'Tente buscar por outro nome, bairro ou cidade.' : 'Fique de olho, novos parceiros estarão disponíveis em breve!'} icon={<Store color={colors.textSecondary} size={22} strokeWidth={1.6} />} />
        ) : (
          <ShopCarousel shops={filtered} onOpen={openShop} />
        )}
      </ScrollView>

      {/* Modal Selecionar Localização */}
      <Modal visible={bairroModalVisible} transparent animationType="fade" onRequestClose={() => setBairroModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setBairroModalVisible(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              {filterStep !== 'estado' ? (
                <Pressable onPress={() => setFilterStep(filterStep === 'bairro' ? 'cidade' : 'estado')} style={styles.backStepBtn}>
                  <Text style={styles.backStepText}>← Voltar</Text>
                </Pressable>
              ) : (
                <Text style={styles.modalTitle}>Filtrar por Estado</Text>
              )}
              {filterStep === 'cidade' && <Text style={styles.modalTitle}>Filtrar por Cidade</Text>}
              {filterStep === 'bairro' && <Text style={styles.modalTitle}>Filtrar por Bairro</Text>}
            </View>

            <ScrollView style={styles.modalScroll}>
              {filterStep === 'estado' && (
                <>
                  <Pressable
                    onPress={() => {
                      setSelectedEstado('Todos');
                      setSelectedCidade('Todos');
                      setSelectedBairro('Todos');
                      setBairroModalVisible(false);
                    }}
                    style={styles.modalItem}
                  >
                    <Text style={[styles.modalItemText, selectedEstado === 'Todos' && styles.modalItemTextActive]}>Todos os estados</Text>
                  </Pressable>
                  {uniqueEstados.map((est) => (
                    <Pressable
                      key={est}
                      onPress={() => {
                        setSelectedEstado(est);
                        setFilterStep('cidade');
                      }}
                      style={styles.modalItem}
                    >
                      <Text style={[styles.modalItemText, selectedEstado === est && styles.modalItemTextActive]}>{est}</Text>
                    </Pressable>
                  ))}
                </>
              )}

              {filterStep === 'cidade' && (
                <>
                  <Pressable
                    onPress={() => {
                      setSelectedCidade('Todos');
                      setSelectedBairro('Todos');
                      setBairroModalVisible(false);
                    }}
                    style={styles.modalItem}
                  >
                    <Text style={[styles.modalItemText, selectedCidade === 'Todos' && styles.modalItemTextActive]}>Todas as cidades ({selectedEstado})</Text>
                  </Pressable>
                  {uniqueCidades.map((cid) => (
                    <Pressable
                      key={cid}
                      onPress={() => {
                        setSelectedCidade(cid);
                        setFilterStep('bairro');
                      }}
                      style={styles.modalItem}
                    >
                      <Text style={[styles.modalItemText, selectedCidade === cid && styles.modalItemTextActive]}>{cid}</Text>
                    </Pressable>
                  ))}
                </>
              )}

              {filterStep === 'bairro' && (
                <>
                  <Pressable
                    onPress={() => {
                      setSelectedBairro('Todos');
                      setBairroModalVisible(false);
                    }}
                    style={styles.modalItem}
                  >
                    <Text style={[styles.modalItemText, selectedBairro === 'Todos' && styles.modalItemTextActive]}>Todos os bairros ({selectedCidade})</Text>
                  </Pressable>
                  {uniqueBairros.map((b) => (
                    <Pressable
                      key={b}
                      onPress={() => {
                        setSelectedBairro(b);
                        setBairroModalVisible(false);
                      }}
                      style={styles.modalItem}
                    >
                      <Text style={[styles.modalItemText, selectedBairro === b && styles.modalItemTextActive]}>{b}</Text>
                    </Pressable>
                  ))}
                </>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal Selecionar Preço */}
      <Modal visible={priceModalVisible} transparent animationType="fade" onRequestClose={() => setPriceModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setPriceModalVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Filtrar por Preço</Text>
            {[
              { label: 'Qualquer valor', value: null },
              { label: '$ (Até R$ 40,00)', value: 1 },
              { label: '$$ (R$ 40,00 - R$ 80,00)', value: 2 },
              { label: '$$$ (Acima de R$ 80,00)', value: 3 },
            ].map((item) => (
              <Pressable
                key={item.label}
                onPress={() => { setSelectedPriceLevel(item.value); setPriceModalVisible(false); }}
                style={styles.modalItem}
              >
                <Text style={[styles.modalItemText, selectedPriceLevel === item.value && styles.modalItemTextActive]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Modal Selecionar Avaliação */}
      <Modal visible={ratingModalVisible} transparent animationType="fade" onRequestClose={() => setRatingModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setRatingModalVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Filtrar por Avaliação</Text>
            {[
              { label: 'Qualquer avaliação', value: null },
              { label: '★ 4.5+ Excelente', value: 4.5 },
              { label: '★ 4.0+ Muito bom', value: 4.0 },
            ].map((item) => (
              <Pressable
                key={item.label}
                onPress={() => { setMinRating(item.value); setRatingModalVisible(false); }}
                style={styles.modalItem}
              >
                <Text style={[styles.modalItemText, minRating === item.value && styles.modalItemTextActive]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </ClientShell>
  );
};

const hairlineW = Platform.OS === 'web' ? (0.5 as number) : StyleSheet.hairlineWidth;

const styles = StyleSheet.create({
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 20, paddingTop: 34, paddingBottom: 120 },
  hero: { gap: 20, marginBottom: 22 },
  heroCopy: { flex: 1 },
  eyebrow: { color: colors.labelSoft, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase' },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 34, lineHeight: 40, letterSpacing: -1.4, marginTop: 10 },
  description: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 14, lineHeight: 21, maxWidth: 560, marginTop: 10 },
  searchSticky: { backgroundColor: colors.canvas, paddingBottom: 16, paddingTop: 4, zIndex: 4 },
  searchBox: { width: '100%', maxWidth: 720 },
  searchLabel: { color: colors.labelSoft, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8 },
  searchField: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.pill,
    paddingHorizontal: 18,
    ...atmosphericShadow,
  },
  searchFieldFocused: {
    borderColor: colors.brandPrimary,
    ...Platform.select({
      web: { boxShadow: '0 0 0 4px rgba(218,210,182,0.5)' } as any,
      default: {},
    }),
  },
  searchInput: { flex: 1, minHeight: 50, color: colors.text, fontFamily: typography.body, fontSize: 14, outlineStyle: 'none' } as any,
  searchMeta: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', marginTop: 10 },
  resultCount: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12, marginLeft: 4 },
  filterChip: { alignItems: 'center', borderColor: colors.borderSubtle, borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row', gap: 7, minHeight: 44, paddingHorizontal: 14 },
  filterChipSelected: { backgroundColor: colors.brandSecondarySoft, borderColor: colors.brandSecondary },
  filterText: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 12 },
  filterTextSelected: { color: colors.brandPrimary },
  openDot: { backgroundColor: colors.success, borderRadius: 4, height: 8, width: 8 },
  openDotMuted: { backgroundColor: colors.borderStrong },
  closedDot: { backgroundColor: colors.danger },
  loader: { margin: 50 },

  /* Carousel */
  carouselContainer: { marginTop: 24, gap: 12 },
  carouselNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  carouselPageInfo: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12 },
  carouselNavBtns: { flexDirection: 'row', gap: 6 },
  carouselNavBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  carouselNavBtnDisabled: { opacity: 0.35 },
  carouselNavBtnText: { fontSize: 22, lineHeight: 26, color: colors.text, fontFamily: typography.bodyStrong },
  carouselNavBtnTextDisabled: { color: colors.textMuted },
  carouselScroll: { overflow: 'hidden' } as any,
  carouselTrack: { flexDirection: 'row', gap: 16, paddingBottom: 4 },
  carouselSlide: { width: 320, flexShrink: 0 },
  dotsRow: { flexDirection: 'row', gap: 7, justifyContent: 'center', marginTop: 8 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.borderStrong },
  dotActive: { backgroundColor: colors.brandPrimary, width: 20 },

  /* Shop Card */
  shopCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: hairlineW,
    borderColor: colors.hairline,
    borderRadius: radii.xl,
    overflow: 'hidden',
    ...atmosphericShadow,
  },
  visual: { aspectRatio: 1.8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  bannerVisualImage: { width: '100%', height: '100%' },
  shopHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  shopLogoCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.canvasSoft, borderWidth: 1, borderColor: colors.borderSubtle, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  shopLogoImage: { width: '100%', height: '100%' },
  shopLogoLetter: { fontFamily: typography.bodyStrong, fontSize: 16, color: colors.textSecondary },
  ratingPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  ratingText: { color: '#EAB308', fontFamily: typography.bodyStrong, fontSize: 12 },
  reviewCountText: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11 },
  metaDivider: { color: colors.textMuted },
  priceLevelText: { color: colors.brandPrimary, fontFamily: typography.bodyStrong, fontSize: 12 },
  visualLine: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2 },
  shopBody: { padding: 18 },
  shopName: { color: colors.text, fontFamily: typography.display, fontSize: 17, letterSpacing: -0.5 },
  shopMeta: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10 },
  shopMetaText: { flex: 1, color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, lineHeight: 17 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: hairlineW, borderTopColor: colors.hairline, paddingTop: 14, marginTop: 16 },
  footerHint: { flex: 1, color: colors.brandPrimary, fontFamily: typography.bodyStrong, fontSize: 12, letterSpacing: 0.2 },
  openButton: { width: 44, height: 44, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSecondarySoft, borderWidth: hairlineW, borderColor: colors.brandSecondary },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  filterContainer: { marginTop: 12, marginBottom: 4 },
  filterScroll: { gap: 8, paddingBottom: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: 20, width: '100%', maxWidth: 320, ...atmosphericShadow },
  modalTitle: { color: colors.text, fontFamily: typography.display, fontSize: 16, marginBottom: 16 },
  modalScroll: { maxHeight: 240 },
  modalItem: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
  modalItemText: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 14 },
  modalItemTextActive: { color: colors.brandPrimary, fontFamily: typography.bodyStrong },
  backStepBtn: { paddingVertical: 4, paddingHorizontal: 8, backgroundColor: colors.canvasSoft, borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderSubtle },
  backStepText: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 12 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
});
