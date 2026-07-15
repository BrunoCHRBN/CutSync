import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowUpRight, Clock3, MapPin, Search, Store } from 'lucide-react-native';
import { database } from '../../database';
import { Barbershop } from '../../database/models';
import { useAuth } from '../../contexts/AuthContext';
import { useSync } from '../../hooks/useSync';
import { ClientShell } from '../layout/ClientShell';
import { EmptyState } from '../ui/EmptyState';
import { SectionHeading } from '../ui/SectionHeading';
import { atmosphericShadow, colors, layout, radii, typography } from '../../theme/tokens';
import { initialsOf } from '../../theme/color';
import { tapLight } from '../../utils/haptics';

export const ExploreExperience = () => {
  const { width } = useWindowDimensions();
  const isWide = width >= layout.desktopBreakpoint;
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const { isSyncing, syncError, sync } = useSync();
  const [barbershops, setBarbershops] = useState<Barbershop[]>([]);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sub = database.collections.get<Barbershop>('establishments').query().observe().subscribe({
      next: (items) => { setBarbershops(items); setLoading(false); },
      error: () => setLoading(false),
    });
    return () => sub.unsubscribe();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return barbershops;
    return barbershops.filter((shop) => [shop.name, shop.address, shop.slug].some((value) => value?.toLowerCase().includes(term)));
  }, [barbershops, search]);

  const openShop = (id: string) => {
    tapLight();
    router.push({ pathname: '/(client)/barbershop', params: { barbershopId: id } });
  };

  return (
    <ClientShell testID="client-explore-screen" activeRoute="explore" userName={profile?.name} isSyncing={isSyncing} syncError={syncError} onSync={sync} onSignOut={signOut}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, isWide && styles.heroWide]}>
          <View style={styles.heroCopy}>
            <Text testID="client-explore-eyebrow" style={styles.eyebrow}>Descubra seu próximo estilo</Text>
            <Text testID="client-explore-title" style={styles.title}>Sua cadeira ideal{`\n`}está por perto.</Text>
            <Text testID="client-explore-description" style={styles.description}>Compare estabelecimentos, conheça os serviços e marque sem ligações ou espera.</Text>
          </View>
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
            <Text testID="client-search-result-count" style={styles.resultCount}>{filtered.length} {filtered.length === 1 ? 'estabelecimento encontrado' : 'estabelecimentos encontrados'}</Text>
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
              return (
                <Pressable key={shop.id} testID={`client-shop-card-${shop.id}`} onPress={() => openShop(shop.id)} style={({ pressed }) => [styles.shopCard, isWide && styles.shopCardWide, pressed && styles.pressed]}>
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
                      <Text numberOfLines={1} style={styles.shopMetaText}>Horários e serviços no perfil</Text>
                    </View>
                    <View style={styles.cardFooter}>
                      <Text style={styles.footerHint}>Ver perfil e agendar</Text>
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
  hero: { gap: 28, marginBottom: 52 },
  heroWide: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  heroCopy: { flex: 1 },
  eyebrow: { color: colors.labelSoft, fontFamily: typography.bodyStrong, fontSize: 10, letterSpacing: 2.4, textTransform: 'uppercase' },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 42, lineHeight: 46, letterSpacing: -2, marginTop: 14 },
  description: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 13, lineHeight: 21, maxWidth: 510, marginTop: 12 },
  searchBox: { width: '100%', maxWidth: 430 },
  searchLabel: { color: colors.labelSoft, fontFamily: typography.bodyStrong, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase', marginBottom: 10 },
  searchField: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(228,228,231,0.7)',
    borderRadius: radii.pill,
    paddingHorizontal: 18,
    ...atmosphericShadow,
  },
  searchFieldFocused: {
    borderColor: '#3F3F46',
    ...Platform.select({
      web: { boxShadow: '0 0 0 4px rgba(9,9,11,0.04)' } as any,
      default: { shadowColor: '#09090B', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 1 },
    }),
  },
  searchInput: { flex: 1, minHeight: 50, color: colors.text, fontFamily: typography.body, fontSize: 14, outlineStyle: 'none' } as any,
  resultCount: { color: colors.textMuted, fontFamily: typography.body, fontSize: 10, marginTop: 10, marginLeft: 4 },
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
  shopCardWide: { width: '31.9%', minWidth: 290, flexGrow: 1, maxWidth: '49%' },
  visual: { height: 124, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAFAF8', overflow: 'hidden' },
  logoImage: { width: '100%', height: '100%' },
  monogram: { fontFamily: typography.serif, fontSize: 38, color: '#52525B', letterSpacing: 2 },
  monogramCaption: { color: colors.labelSoft, fontFamily: typography.bodyStrong, fontSize: 8, letterSpacing: 3, textTransform: 'uppercase', marginTop: 6 },
  visualLine: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2 },
  shopBody: { padding: 18 },
  shopName: { color: colors.text, fontFamily: typography.display, fontSize: 17, letterSpacing: -0.5 },
  shopMeta: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10 },
  shopMetaText: { flex: 1, color: colors.textSecondary, fontFamily: typography.body, fontSize: 10, lineHeight: 15 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: hairlineW, borderTopColor: colors.hairline, paddingTop: 14, marginTop: 16 },
  footerHint: { flex: 1, color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 10, letterSpacing: 0.3 },
  openButton: { width: 32, height: 32, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas, borderWidth: hairlineW, borderColor: colors.hairline },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
