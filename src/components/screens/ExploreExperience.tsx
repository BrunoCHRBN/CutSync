import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowUpRight, Clock3, MapPin, Search, Store } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabase';
import { Establishment, mapEstablishment } from '../../types/database';
import { ClientShell } from '../layout/ClientShell';
import { EmptyState } from '../ui/EmptyState';
import { SectionHeading } from '../ui/SectionHeading';
import { atmosphericShadow, colors, layout, radii, typography } from '../../theme/tokens';
import { initialsOf } from '../../theme/color';
import { tapLight } from '../../utils/haptics';
import { getOpeningStatus } from '../../utils/schedule';

export const ExploreExperience = () => {
  const { width } = useWindowDimensions();
  const columns = width >= 1280 ? 3 : width >= layout.mobileBreakpoint ? 2 : 1;
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const [barbershops, setBarbershops] = useState<Establishment[]>([]);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openOnly, setOpenOnly] = useState(false);

  useEffect(() => {
    const refresh = async () => {
      const { data } = await supabase.from('establishments').select('*').order('name');
      setBarbershops((data || []).map(mapEstablishment));
      setLoading(false);
    };
    void refresh();
    const channel = supabase.channel(`explore-establishments-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'establishments' }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return barbershops.filter((shop) => {
      const matchesTerm = !term || [shop.name, shop.address, shop.slug].some((value) => value?.toLowerCase().includes(term));
      const matchesOpen = !openOnly || getOpeningStatus(shop.openingHours, shop.timezone).isOpen;
      return matchesTerm && matchesOpen;
    });
  }, [barbershops, openOnly, search]);

  const openShop = (id: string) => {
    tapLight();
    router.push({ pathname: '/(client)/barbershop', params: { barbershopId: id } });
  };

  return (
    <ClientShell testID="client-explore-screen" activeRoute="explore" userName={profile?.name} isSyncing={loading} syncError={null} onSync={() => {}} onSignOut={signOut}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} stickyHeaderIndices={[1]}>
        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text testID="client-explore-eyebrow" style={styles.eyebrow}>Descubra seu próximo estilo</Text>
            <Text testID="client-explore-title" style={styles.title}>Sua cadeira ideal{`\n`}está por perto.</Text>
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
            <View style={styles.searchMeta}>
              <Text testID="client-search-result-count" style={styles.resultCount}>{filtered.length} {filtered.length === 1 ? 'estabelecimento encontrado' : 'estabelecimentos encontrados'}</Text>
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
            </View>
          </View>
        </View>

        <SectionHeading testID="client-shops-heading" eyebrow="Seleção CutSync" title="Estabelecimentos disponíveis" description="Informações reais de cada estabelecimento, direto da agenda do salão." />

        {loading ? (
          <ActivityIndicator testID="client-shops-loading" color={colors.accent} size="large" style={styles.loader} />
        ) : filtered.length === 0 ? (
          <EmptyState testID="client-shops-empty" title={search ? 'Nenhum resultado' : 'Novos estabelecimentos em breve'} description={search ? 'Tente buscar por outro nome, bairro ou cidade.' : 'Sincronize novamente para verificar novos parceiros.'} icon={<Store color={colors.textSecondary} size={22} strokeWidth={1.6} />} />
        ) : (
          <View testID="client-shops-grid" style={styles.grid}>
            {filtered.map((shop) => {
              const accent = shop.primaryColor || colors.accent;
              const opening = getOpeningStatus(shop.openingHours, shop.timezone);
              return (
                <Pressable key={shop.id} testID={`client-shop-card-${shop.id}`} onPress={() => openShop(shop.id)} style={({ pressed }) => [styles.shopCard, { width: columns === 3 ? '31.8%' : columns === 2 ? '48.5%' : '100%' }, pressed && styles.pressed]}>
                  <View style={styles.visual}>
                    {shop.logoUrl ? (
                      <Image source={{ uri: shop.logoUrl }} style={styles.logoImage} resizeMode="cover" />
                    ) : (
                      <>
                        <Text style={styles.monogram}>{initialsOf(shop.name)}</Text>
                        <Text style={styles.monogramCaption}>Est. CutSync</Text>
                      </>
                    )}
                    <View style={[styles.visualLine, { backgroundColor: `${accent}59` }]} />
                  </View>
                  <View style={styles.shopBody}>
                    <Text testID={`client-shop-card-${shop.id}-name`} numberOfLines={1} style={styles.shopName}>{shop.name}</Text>
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
          </View>
        )}
      </ScrollView>
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 24 },
  shopCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: hairlineW,
    borderColor: colors.hairline,
    borderRadius: radii.xl,
    overflow: 'hidden',
    ...atmosphericShadow,
  },
  visual: { aspectRatio: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  logoImage: { width: '100%', height: '100%' },
  monogram: { fontFamily: typography.serif, fontSize: 38, color: colors.textSecondary, letterSpacing: 2 },
  monogramCaption: { color: colors.labelSoft, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', marginTop: 6 },
  visualLine: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2 },
  shopBody: { padding: 18 },
  shopName: { color: colors.text, fontFamily: typography.display, fontSize: 17, letterSpacing: -0.5 },
  shopMeta: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10 },
  shopMetaText: { flex: 1, color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, lineHeight: 17 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: hairlineW, borderTopColor: colors.hairline, paddingTop: 14, marginTop: 16 },
  footerHint: { flex: 1, color: colors.brandPrimary, fontFamily: typography.bodyStrong, fontSize: 12, letterSpacing: 0.2 },
  openButton: { width: 44, height: 44, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSecondarySoft, borderWidth: hairlineW, borderColor: colors.brandSecondary },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
