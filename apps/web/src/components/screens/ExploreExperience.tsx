import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, Modal } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowUpRight, Clock3, Heart, MapPin, Search, Store } from 'lucide-react-native';
import { buildEstablishmentTheme } from '@cutsync/brand';
import { useAuth } from '../../contexts/AuthContext';
import { useClientFavorites } from '../../hooks/useClientFavorites';
import { supabase } from '../../services/supabase';
import { Establishment, mapEstablishment, PUBLIC_ESTABLISHMENT_SELECT } from '@cutsync/database';
import { ClientShell } from '../layout/ClientShell';
import { AppButton } from '../ui/AppButton';
import { EmptyState } from '../ui/EmptyState';
import { InlineNotice } from '../ui/InlineNotice';
import { ClientFilterChip } from '../ui/ClientFilterChip';
import { EstablishmentMedia } from '../ui/EstablishmentMedia';
import { colors, layout, radii, typography } from '../../theme/tokens';
import { clientTheme } from '../../theme/client-tokens';
import { initialsOf } from '../../theme/color';
import { tapLight } from '../../utils/haptics';
import { accentText, logoRing, primaryButton } from '../../theme/establishment-styles';
import { formatEstablishmentDisplayName, getOpeningStatus } from '@cutsync/domain';

const GAP = 16;

const ShopCardSkeleton = () => (
  <View style={styles.shopCard}>
    <View style={[styles.visual, { backgroundColor: '#EBEBE6' }]} />
    <View style={styles.shopBody}>
      <View style={[styles.skeletonLogo]} />
      <View style={{ height: 16, backgroundColor: '#E5E5E0', borderRadius: 6, width: '60%', marginTop: 6 }} />
      <View style={{ height: 12, backgroundColor: '#F0F0EB', borderRadius: 6, width: '85%', marginTop: 12 }} />
      <View style={{ height: 12, backgroundColor: '#F0F0EB', borderRadius: 6, width: '45%', marginTop: 8 }} />
    </View>
  </View>
);

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

const shortAddress = (address?: string | null) => {
  if (!address) return 'Endereço ainda não informado';
  const { bairro, cidade } = parseAddress(address);
  if (bairro !== 'Geral' && cidade !== 'Geral') return `${bairro}, ${cidade}`;
  return address;
};

const LEGACY_DEFAULT_COLOR = '#F5A524';
const bannerFallbackColor = (shop: Establishment, themePrimary: string) => {
  if (!shop.primaryColor || shop.primaryColor.toUpperCase() === LEGACY_DEFAULT_COLOR) return clientTheme.greenDeep;
  return themePrimary;
};

const ShopCard = ({ shop, onOpen, isFavorite, onToggleFavorite }: {
  shop: Establishment;
  onOpen: (id: string) => void;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
}) => {
  const theme = useMemo(() => buildEstablishmentTheme(shop.primaryColor), [shop.primaryColor]);
  const opening = getOpeningStatus(shop.openingHours, shop.timezone);
  const displayName = formatEstablishmentDisplayName(shop.name, shop.slug);
  const ratingLabel = shop.averageRating ? shop.averageRating.toFixed(1) : 'Novo';
  const hoursLabel = opening.isOpen ? `Aberto agora${opening.text ? ` · ${opening.text}` : ''}` : opening.text || 'Horários no perfil';

  return (
    <View style={styles.shopCardWrap}>
      <Pressable
        testID={`client-shop-card-${shop.id}`}
        accessibilityRole="button"
        accessibilityLabel={`Ver ${displayName}`}
        onPress={() => { tapLight(); onOpen(shop.id); }}
        style={({ pressed, hovered }) => [styles.shopCard, hovered && styles.shopCardHovered, pressed && styles.pressed]}
      >
        <View style={styles.visual}>
          <EstablishmentMedia name={displayName} uri={shop.bannerUrl} color={bannerFallbackColor(shop, theme.primary)} category="Estabelecimento" style={styles.bannerVisualImage} />
        </View>
      <View style={styles.shopBody}>
        <View style={[styles.shopLogoCircle, logoRing(theme)]}>
          {shop.logoUrl ? <Image source={{ uri: shop.logoUrl }} style={styles.shopLogoImage} contentFit="contain" /> : <Text style={[styles.shopLogoLetter, { color: theme.primary }]}>{initialsOf(displayName)}</Text>}
        </View>
        <Text testID={`client-shop-card-${shop.id}-name`} numberOfLines={1} style={styles.shopName}>{displayName}</Text>
        <View style={styles.ratingPriceRow}>
          <Text style={styles.ratingText}>★ {ratingLabel}</Text>
          {!!shop.reviewCount && <Text style={styles.reviewCountText}>({shop.reviewCount})</Text>}
          <Text style={styles.metaDivider}>·</Text>
          <Text style={styles.priceLevelText}>{'$'.repeat(shop.priceLevel || 1)}</Text>
        </View>
        <View style={styles.shopMeta}><MapPin color={colors.textMuted} size={13} strokeWidth={1.6} /><Text numberOfLines={1} style={styles.shopMetaText}>{shortAddress(shop.address)}</Text></View>
        <View style={styles.shopMeta}><Clock3 color={colors.textMuted} size={13} strokeWidth={1.6} /><View style={[styles.openDot, !opening.isOpen && styles.closedDot]} /><Text numberOfLines={1} style={styles.shopMetaText}>{hoursLabel}</Text></View>
        <View style={styles.cardFooter}>
          <Text testID={`client-shop-card-${shop.id}-cta`} style={[styles.footerHint, accentText(theme)]}>{shop.slug ? 'Agendar' : 'Ver perfil'}</Text>
          <View style={[styles.openButton, primaryButton(theme)]}><ArrowUpRight color={colors.white} size={15} strokeWidth={1.9} /></View>
        </View>
      </View>
      </Pressable>
      <Pressable
        testID={`client-shop-card-${shop.id}-favorite`}
        accessibilityRole="button"
        accessibilityState={{ selected: isFavorite }}
        accessibilityLabel={isFavorite ? `Remover ${displayName} dos salvos` : `Salvar ${displayName}`}
        onPress={(event) => {
          event?.stopPropagation?.();
          tapLight();
          onToggleFavorite(shop.id);
        }}
        style={({ pressed }) => [styles.favoriteButton, pressed && styles.pressed]}
      >
        <Heart
          color={isFavorite ? colors.danger : colors.text}
          fill={isFavorite ? colors.danger : 'transparent'}
          size={17}
          strokeWidth={1.8}
        />
      </Pressable>
    </View>
  );
};

export const ExploreExperience = () => {
  const router = useRouter();
  const { search: searchParam } = useLocalSearchParams<{ search?: string }>();
  const { profile, signOut } = useAuth();
  const { width: viewportWidth } = useWindowDimensions();
  const isDesktopViewport = viewportWidth >= layout.desktopBreakpoint;
  const columns = viewportWidth >= layout.desktopBreakpoint ? 3 : viewportWidth >= layout.mobileBreakpoint ? 2 : 1;
  const contentWidth = Math.min(viewportWidth, layout.contentMax) - 40;
  const cardWidth = columns === 1 ? '100%' as const : Math.floor((contentWidth - GAP * (columns - 1)) / columns);
  const listHeadingHint = isDesktopViewport
    ? 'Veja serviços e horários.'
    : 'Toque para ver serviços e horários.';
  const firstName = (profile?.name || '').trim().split(/\s+/)[0];
  const [barbershops, setBarbershops] = useState<Establishment[]>([]);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const {
    favoriteIds,
    isFavorite,
    toggleFavorite,
    error: favoritesError,
  } = useClientFavorites(Boolean(profile?.id));

  useEffect(() => {
    if (searchParam) {
      setSearch(searchParam);
    }
  }, [searchParam]);
  const [openOnly, setOpenOnly] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);

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
        .select(PUBLIC_ESTABLISHMENT_SELECT)
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

  const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return barbershops.filter((shop) => {
      const matchesTerm = !term || [shop.name, shop.address, shop.slug].some((value) => value?.toLowerCase().includes(term));
      const matchesOpen = !openOnly || getOpeningStatus(shop.openingHours, shop.timezone).isOpen;
      const matchesFavorite = !favoritesOnly || favoriteIdSet.has(shop.id);

      const { estado, cidade, bairro } = parseAddress(shop.address);
      const matchesEstado = selectedEstado === 'Todos' || estado === selectedEstado;
      const matchesCidade = selectedCidade === 'Todos' || cidade === selectedCidade;
      const matchesBairro = selectedBairro === 'Todos' || bairro === selectedBairro;

      const matchesPrice = !selectedPriceLevel || shop.priceLevel === selectedPriceLevel;
      const matchesRating = !minRating || (shop.averageRating || 0) >= minRating;

      return matchesTerm && matchesOpen && matchesFavorite && matchesEstado && matchesCidade && matchesBairro && matchesPrice && matchesRating;
    });
  }, [barbershops, favoriteIdSet, favoritesOnly, openOnly, search, selectedEstado, selectedCidade, selectedBairro, selectedPriceLevel, minRating]);

  const openShop = (id: string) => {
    tapLight();
    router.push({ pathname: '/(client)/establishment', params: { establishmentId: id } });
  };

  const handleToggleFavorite = useCallback((establishmentId: string) => {
    void toggleFavorite(establishmentId);
  }, [toggleFavorite]);

  const hasActiveFilters = openOnly || favoritesOnly || selectedEstado !== 'Todos' || selectedPriceLevel !== null || minRating !== null;
  const clearFilters = () => {
    setOpenOnly(false);
    setFavoritesOnly(false);
    setSelectedEstado('Todos');
    setSelectedCidade('Todos');
    setSelectedBairro('Todos');
    setSelectedPriceLevel(null);
    setMinRating(null);
  };

  return (
    <ClientShell testID="client-explore-screen" activeRoute="explore" userName={profile?.name} onSignOut={signOut}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} stickyHeaderIndices={[1]}>
        <View style={styles.hero}>
          <Text testID="client-explore-eyebrow" style={styles.eyebrow}>{firstName ? `Olá, ${firstName}` : 'Explorar'}</Text>
          <Text testID="client-explore-title" style={[styles.title, isDesktopViewport && styles.titleDesktop]}>Onde você quer marcar?</Text>
        </View>
        <View style={styles.searchSticky}>
          <View style={styles.searchBox}>
            <View style={[styles.searchField, searchFocused && styles.searchFieldFocused]}>
              <Search color={searchFocused ? clientTheme.accent : colors.textMuted} size={18} strokeWidth={1.8} />
              <TextInput
                testID="client-search-input"
                placeholder="Nome, bairro ou cidade"
                placeholderTextColor={colors.textMuted}
                selectionColor={clientTheme.accent}
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
                accessibilityRole="checkbox"
                accessibilityState={{ checked: favoritesOnly }}
                onPress={() => setFavoritesOnly((current) => !current)}
                style={[styles.filterChip, favoritesOnly && styles.filterChipSelected]}
                testID="client-filter-favorites"
              >
                <Heart
                  color={favoritesOnly ? clientTheme.accent : colors.textSecondary}
                  fill={favoritesOnly ? clientTheme.accent : 'transparent'}
                  size={13}
                  strokeWidth={1.8}
                />
                <Text style={[styles.filterText, favoritesOnly && styles.filterTextSelected]}>
                  Salvos{favoriteIds.length > 0 ? ` (${favoriteIds.length})` : ''}
                </Text>
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

            {(hasActiveFilters) ? (
              <View style={styles.searchMeta}>
                <Pressable testID="client-filters-clear-all" accessibilityRole="button" onPress={clearFilters}>
                  <Text style={styles.clearAll}>Limpar filtros</Text>
                </Pressable>
              </View>
            ) : null}
            {hasActiveFilters ? (
              <View testID="client-active-filters" style={styles.activeFilters}>
                {openOnly ? <ClientFilterChip label="Aberto agora" active removable onPress={() => setOpenOnly(false)} /> : null}
                {favoritesOnly ? <ClientFilterChip label="Salvos" active removable onPress={() => setFavoritesOnly(false)} testID="client-active-filter-favorites" /> : null}
                {selectedEstado !== 'Todos' ? <ClientFilterChip label={locationLabel} active removable onPress={() => { setSelectedEstado('Todos'); setSelectedCidade('Todos'); setSelectedBairro('Todos'); }} /> : null}
                {selectedPriceLevel !== null ? <ClientFilterChip label={`Preço: ${'$'.repeat(selectedPriceLevel)}`} active removable onPress={() => setSelectedPriceLevel(null)} /> : null}
                {minRating !== null ? <ClientFilterChip label={`★ ${minRating.toFixed(1)}+`} active removable onPress={() => setMinRating(null)} /> : null}
              </View>
            ) : null}
          </View>
        </View>

        <View testID="client-shops-heading" style={styles.listHeading}>
          <Text testID="client-search-result-count" style={styles.listHeadingTitle}>
            {favoritesOnly
              ? `${filtered.length} ${filtered.length === 1 ? 'salvo' : 'salvos'}`
              : `${filtered.length} ${filtered.length === 1 ? 'lugar' : 'lugares'}`}
          </Text>
          <Text style={styles.listHeadingHint}>
            {favoritesOnly ? 'Seus lugares salvos para remarcar mais rápido.' : listHeadingHint}
          </Text>
        </View>

        {!!error && <InlineNotice
          testID="client-shops-error"
          tone="danger"
          title="Não foi possível atualizar a vitrine"
          message="Verifique sua conexão e tente novamente."
          action={<AppButton testID="client-shops-retry-button" label="Tentar novamente" onPress={() => { void refresh(); }} variant="secondary" size="sm" />}
        />}
        {!!favoritesError && <InlineNotice testID="client-favorites-error" tone="danger" title="Salvos" message={favoritesError} />}

        {loading ? (
          <View testID="client-shops-loading-skeleton" style={styles.grid}>
            {Array.from({ length: Math.max(columns, 2) }).map((_, i) => (
              <View key={i} style={{ width: cardWidth }}>
                <ShopCardSkeleton />
              </View>
            ))}
          </View>
        ) : error && barbershops.length === 0 ? null : filtered.length === 0 ? (
          <EmptyState
            testID="client-shops-empty"
            title={favoritesOnly ? 'Nenhum lugar salvo' : search || hasActiveFilters ? 'Nenhum resultado' : 'Novos estabelecimentos em breve'}
            description={
              favoritesOnly
                ? 'Toque no coração nos cards para guardar estabelecimentos aqui.'
                : hasActiveFilters
                  ? 'Os filtros atuais não encontraram estabelecimentos. Remova um filtro ou limpe todos para ampliar a busca.'
                  : search
                    ? 'Tente buscar por outro nome, bairro ou cidade.'
                    : 'Fique de olho, novos parceiros estarão disponíveis em breve!'
            }
            icon={favoritesOnly
              ? <Heart color={colors.textSecondary} size={22} strokeWidth={1.6} />
              : <Store color={colors.textSecondary} size={22} strokeWidth={1.6} />}
            action={hasActiveFilters ? <AppButton testID="client-empty-clear-filters" label="Limpar filtros" onPress={clearFilters} variant="secondary" size="sm" /> : undefined}
          />
        ) : (
          <View testID="client-shops-grid" style={styles.grid}>
            {filtered.map((shop) => (
              <View key={shop.id} style={{ width: cardWidth }}>
                <ShopCard
                  shop={shop}
                  onOpen={openShop}
                  isFavorite={isFavorite(shop.id)}
                  onToggleFavorite={handleToggleFavorite}
                />
              </View>
            ))}
          </View>
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
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 20, paddingTop: 26, paddingBottom: 140 },
  hero: { gap: 6, marginBottom: 14 },
  eyebrow: { color: colors.labelSoft, fontFamily: typography.bodyStrong, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 28, lineHeight: 34, letterSpacing: -1 },
  titleDesktop: { fontSize: 34, lineHeight: 40 },
  searchSticky: { backgroundColor: colors.canvas, paddingBottom: 12, paddingTop: 4, zIndex: 4 },
  searchBox: { width: '100%', maxWidth: 720 },
  searchField: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderColor: clientTheme.cardBorder,
    borderRadius: radii.pill,
    paddingHorizontal: 18,
    backgroundColor: colors.surface,
    ...Platform.select({
      web: { boxShadow: '0 2px 10px rgba(24,32,27,0.05)' } as any,
      default: {},
    }),
  },
  searchFieldFocused: {
    borderColor: clientTheme.accent,
    ...Platform.select({
      web: { boxShadow: '0 0 0 4px rgba(92,51,246,0.12)' } as any,
      default: {},
    }),
  },
  searchInput: { flex: 1, minHeight: 48, color: colors.text, fontFamily: typography.body, fontSize: 14.5, outlineStyle: 'none' } as any,
  listHeading: { gap: 4, marginTop: 10, marginBottom: 4 },
  listHeadingTitle: { color: colors.text, fontFamily: typography.display, fontSize: 22, letterSpacing: -0.6 },
  listHeadingHint: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12 },
  searchMeta: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end', marginTop: 10 },
  clearAll: { color: clientTheme.accent, fontFamily: typography.bodyStrong, fontSize: 12, textDecorationLine: 'underline' },
  activeFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  filterChip: {
    alignItems: 'center',
    borderColor: clientTheme.cardBorder,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: 42,
    paddingHorizontal: 15,
    backgroundColor: colors.surface,
  },
  filterChipSelected: { backgroundColor: clientTheme.accentSoft, borderColor: clientTheme.accent },
  filterText: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 12 },
  filterTextSelected: { color: clientTheme.accent },
  openDot: { backgroundColor: colors.success, borderRadius: 4, height: 8, width: 8 },
  openDotMuted: { backgroundColor: colors.borderStrong },
  closedDot: { backgroundColor: colors.danger },
  loader: { margin: 50 },

  /* Grid */
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginTop: 14 },

  /* Shop Card — Fresha style: banner + floating logo */
  shopCardWrap: { width: '100%', position: 'relative' },
  shopCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: clientTheme.cardBorder,
    borderRadius: radii.lg,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 2px 8px rgba(24,32,27,0.05)', transitionProperty: 'transform, box-shadow', transitionDuration: '160ms' } as any,
      default: {},
    }),
  },
  shopCardHovered: {
    ...Platform.select({
      web: { boxShadow: '0 14px 34px rgba(24,32,27,0.12)', transform: [{ translateY: -3 }] } as any,
      default: {},
    }),
  },
  visual: { height: 158, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  bannerVisualImage: { width: '100%', height: '100%' },
  favoriteButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: hairlineW,
    borderColor: colors.hairline,
    zIndex: 2,
    ...Platform.select({
      web: { boxShadow: '0 2px 8px rgba(0,0,0,0.12)' } as any,
      default: {},
    }),
  },
  shopLogoCircle: {
    position: 'absolute',
    top: -26,
    left: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    borderColor: colors.surface,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 4px 12px rgba(24,32,27,0.14)' } as any,
      default: {},
    }),
  },
  skeletonLogo: {
    position: 'absolute',
    top: -26,
    left: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    borderColor: colors.surface,
    backgroundColor: '#E5E5E0',
  },
  shopLogoImage: { width: '100%', height: '100%' },
  shopLogoLetter: { fontFamily: typography.bodyStrong, fontSize: 17 },
  ratingPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  ratingText: { color: clientTheme.star, fontFamily: typography.bodyStrong, fontSize: 12.5 },
  reviewCountText: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11 },
  metaDivider: { color: colors.textMuted },
  priceLevelText: { color: clientTheme.greenDeep, fontFamily: typography.bodyStrong, fontSize: 12.5 },
  shopBody: { paddingHorizontal: 16, paddingTop: 32, paddingBottom: 14 },
  shopName: { color: colors.text, fontFamily: typography.display, fontSize: 16.5, letterSpacing: -0.4 },
  shopMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 },
  shopMetaText: { flex: 1, color: colors.textSecondary, fontFamily: typography.body, fontSize: 12.5, lineHeight: 17 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: hairlineW, borderTopColor: colors.hairline, paddingTop: 12, marginTop: 12 },
  footerHint: { flex: 1, color: clientTheme.accent, fontFamily: typography.bodyStrong, fontSize: 13, letterSpacing: 0.2 },
  openButton: { width: 36, height: 36, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: clientTheme.accent },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  filterContainer: { marginTop: 12, marginBottom: 4 },
  filterScroll: { gap: 8, paddingBottom: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: 20, width: '100%', maxWidth: 340, ...Platform.select({ web: { boxShadow: '0 18px 48px rgba(24,32,27,0.18)' } as any, default: {} }) },
  modalTitle: { color: colors.text, fontFamily: typography.display, fontSize: 16, marginBottom: 16 },
  modalScroll: { maxHeight: 260 },
  modalItem: { paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
  modalItemText: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 14 },
  modalItemTextActive: { color: clientTheme.accent, fontFamily: typography.bodyStrong },
  backStepBtn: { paddingVertical: 4, paddingHorizontal: 8, backgroundColor: colors.canvasSoft, borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderSubtle },
  backStepText: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 12 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
});
