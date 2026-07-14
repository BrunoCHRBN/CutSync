import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight, Clock3, MapPin, Search, Store } from 'lucide-react-native';
import { database } from '../../database';
import { Barbershop } from '../../database/models';
import { useAuth } from '../../contexts/AuthContext';
import { useSync } from '../../hooks/useSync';
import { ClientShell } from '../layout/ClientShell';
import { AppInput } from '../ui/AppInput';
import { EmptyState } from '../ui/EmptyState';
import { SectionHeading } from '../ui/SectionHeading';
import { colors, layout, radii, typography } from '../../theme/tokens';

export const ExploreExperience = () => {
  const { width } = useWindowDimensions();
  const isWide = width >= layout.desktopBreakpoint;
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const { isSyncing, syncError, sync } = useSync();
  const [barbershops, setBarbershops] = useState<Barbershop[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sub = database.collections.get<Barbershop>('barbershops').query().observe().subscribe({
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

  const openShop = (id: string) => router.push({ pathname: '/(client)/barbershop', params: { barbershopId: id } });

  return (
    <ClientShell testID="client-explore-screen" activeRoute="explore" userName={profile?.name} isSyncing={isSyncing} syncError={syncError} onSync={sync} onSignOut={signOut}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, isWide && styles.heroWide]}>
          <View style={styles.heroCopy}>
            <Text testID="client-explore-eyebrow" style={styles.eyebrow}>DESCUBRA SEU PRÓXIMO ESTILO</Text>
            <Text testID="client-explore-title" style={styles.title}>Sua cadeira ideal{`\n`}está por perto.</Text>
            <Text testID="client-explore-description" style={styles.description}>Compare barbearias, conheça os serviços e marque sem ligações ou espera.</Text>
          </View>
          <View style={styles.searchBox}>
            <AppInput label="Buscar barbearia" testID="client-search-input" icon={<Search color={colors.textMuted} size={18} />} placeholder="Nome, bairro ou cidade" value={search} onChangeText={setSearch} />
            <Text testID="client-search-result-count" style={styles.resultCount}>{filtered.length} {filtered.length === 1 ? 'barbearia encontrada' : 'barbearias encontradas'}</Text>
          </View>
        </View>

        <SectionHeading testID="client-shops-heading" eyebrow="Seleção CutSync" title="Barbearias disponíveis" description="Informações reais do estabelecimento, sem endereço ou telefone inventados." />

        {loading ? (
          <ActivityIndicator testID="client-shops-loading" color={colors.brand} size="large" style={styles.loader} />
        ) : filtered.length === 0 ? (
          <EmptyState testID="client-shops-empty" title={search ? 'Nenhum resultado' : 'Novas barbearias em breve'} description={search ? 'Tente buscar por outro nome, bairro ou cidade.' : 'Sincronize novamente para verificar novos parceiros.'} icon={<Store color={colors.brand} size={22} />} />
        ) : (
          <View testID="client-shops-grid" style={styles.grid}>
            {filtered.map((shop) => {
              const accent = shop.primaryColor || colors.brand;
              return (
                <Pressable key={shop.id} testID={`client-shop-card-${shop.id}`} onPress={() => openShop(shop.id)} style={({ pressed }) => [styles.shopCard, isWide && styles.shopCardWide, pressed && styles.pressed]}>
                  <View style={[styles.visual, { backgroundColor: `${accent}18` }]}>
                    {shop.logoUrl ? <Image source={{ uri: shop.logoUrl }} style={styles.logoImage} resizeMode="cover" /> : <Text style={[styles.monogram, { color: accent }]}>{shop.name.charAt(0).toUpperCase()}</Text>}
                    <View style={[styles.visualLine, { backgroundColor: accent }]} />
                  </View>
                  <View style={styles.shopBody}>
                    <Text testID={`client-shop-card-${shop.id}-name`} numberOfLines={1} style={styles.shopName}>{shop.name}</Text>
                    <View style={styles.shopMeta}>
                      <MapPin color={colors.textMuted} size={13} />
                      <Text numberOfLines={2} style={styles.shopMetaText}>{shop.address || 'Endereço ainda não informado'}</Text>
                    </View>
                    <View style={styles.shopMeta}>
                      <Clock3 color={colors.textMuted} size={13} />
                      <Text numberOfLines={1} style={styles.shopMetaText}>{shop.openingHours || 'Horários no perfil'}</Text>
                    </View>
                    <View style={styles.cardFooter}>
                      <Text style={[styles.slug, { color: accent }]}>cutsync.com/{shop.slug}</Text>
                      <View style={[styles.openButton, { backgroundColor: accent }]}><ArrowRight color={colors.ink} size={16} /></View>
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

const styles = StyleSheet.create({
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 20, paddingTop: 30, paddingBottom: 110 },
  hero: { gap: 24, marginBottom: 48 },
  heroWide: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  heroCopy: { flex: 1 },
  eyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 10, letterSpacing: 2 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 42, lineHeight: 46, letterSpacing: -2, marginTop: 12 },
  description: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 13, lineHeight: 21, maxWidth: 510, marginTop: 12 },
  searchBox: { width: '100%', maxWidth: 430, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: 16 },
  resultCount: { color: colors.textMuted, fontFamily: typography.body, fontSize: 9, marginTop: 8 },
  loader: { margin: 50 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 20 },
  shopCard: { width: '100%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, overflow: 'hidden' },
  shopCardWide: { width: '31.9%', minWidth: 290, flexGrow: 1, maxWidth: '49%' },
  visual: { height: 120, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoImage: { width: '100%', height: '100%' },
  monogram: { fontFamily: typography.display, fontSize: 43, opacity: 0.92 },
  visualLine: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3 },
  shopBody: { padding: 16 },
  shopName: { color: colors.text, fontFamily: typography.display, fontSize: 17, letterSpacing: -0.5 },
  shopMeta: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 9 },
  shopMetaText: { flex: 1, color: colors.textMuted, fontFamily: typography.body, fontSize: 10, lineHeight: 15 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 13, marginTop: 15 },
  slug: { flex: 1, fontFamily: typography.bodyStrong, fontSize: 9 },
  openButton: { width: 34, height: 34, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
});