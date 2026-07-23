import { sharedBrand } from '@cutsync/brand';
import { validateClientDiscoveryQuery } from '@cutsync/validation';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  DiscoveryLoading,
  DiscoveryMessage,
  EstablishmentCard,
  discoveryColors,
} from '@/components/discovery/client-discovery-ui';
import { ClientBrand } from '@/components/settings/client-settings-ui';
import {
  type ClientDiscoveryEstablishment,
  listClientDiscoveryEstablishments,
} from '@/features/discovery/client-discovery-service';

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
            tintColor={sharedBrand.colors.forest}
          />
        )}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topbar}>
          <ClientBrand />
          <Pressable
            testID="client-discovery-open-account"
            accessibilityRole="button"
            onPress={() => router.replace('./')}
            style={({ pressed }) => [styles.accountButton, pressed && styles.pressed]}
          >
            <Text style={styles.accountButtonText}>Minha conta</Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>DESCUBRA PERTO DE VOCÊ</Text>
          <Text style={styles.title}>Seu próximo cuidado começa aqui.</Text>
          <Text style={styles.description}>
            Busque por estabelecimento, serviço, profissional ou região.
          </Text>
        </View>

        <View style={styles.searchCard}>
          <Text style={styles.searchLabel}>O que você procura?</Text>
          <View style={[styles.searchField, validationError && styles.searchFieldError]}>
            <TextInput
              testID="client-discovery-search"
              accessibilityLabel="Buscar estabelecimentos e profissionais"
              autoCapitalize="words"
              autoCorrect={false}
              enterKeyHint="search"
              maxLength={80}
              onChangeText={changeQuery}
              onSubmitEditing={submitSearch}
              placeholder="Nome, serviço, profissional ou região"
              placeholderTextColor="#908A7E"
              returnKeyType="search"
              style={styles.searchInput}
              value={query}
            />
            {!!query && (
              <Pressable
                testID="client-discovery-clear-search"
                accessibilityRole="button"
                accessibilityLabel="Limpar busca"
                onPress={clearSearch}
                style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
              >
                <Text style={styles.clearButtonText}>Limpar</Text>
              </Pressable>
            )}
          </View>
          {!!validationError && (
            <Text testID="client-discovery-search-error" accessibilityLiveRegion="polite" style={styles.validationError}>
              {validationError}
            </Text>
          )}
          <Pressable
            testID="client-discovery-submit"
            accessibilityRole="button"
            onPress={submitSearch}
            style={({ pressed }) => [styles.searchButton, pressed && styles.pressed]}
          >
            <Text style={styles.searchButtonText}>Buscar</Text>
          </Pressable>
        </View>

        <View style={styles.resultsHeader}>
          <View style={styles.resultsCopy}>
            <Text style={styles.resultsEyebrow}>{activeQuery ? 'RESULTADOS DA BUSCA' : 'LUGARES PARA CONHECER'}</Text>
            <Text testID="client-discovery-result-count" style={styles.resultsTitle}>
              {isLoading ? 'Carregando' : establishments.length + (establishments.length === 1 ? ' lugar' : ' lugares')}
            </Text>
          </View>
          {!!activeQuery && <Text numberOfLines={1} style={styles.activeQuery}>{activeQuery}</Text>}
        </View>

        {isLoading ? (
          <DiscoveryLoading />
        ) : error ? (
          <DiscoveryMessage
            testID="client-discovery-error"
            title="A busca não carregou"
            description={error}
            actionLabel="Tentar novamente"
            onAction={() => { void load(activeQuery); }}
          />
        ) : establishments.length === 0 ? (
          <DiscoveryMessage
            testID="client-discovery-empty"
            title="Nenhum lugar encontrado"
            description="Tente buscar por outro nome, serviço, profissional ou região."
            actionLabel={activeQuery ? 'Limpar busca' : undefined}
            onAction={activeQuery ? clearSearch : undefined}
          />
        ) : (
          <View testID="client-discovery-results" style={styles.results}>
            {establishments.map((establishment) => (
              <EstablishmentCard
                key={establishment.id}
                establishment={establishment}
                onPress={() => router.push({
                  pathname: '/establishments/[slug]',
                  params: { slug: establishment.slug },
                })}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: discoveryColors.background },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 52, gap: 22 },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  accountButton: { minHeight: 42, justifyContent: 'center', borderRadius: 14, borderCurve: 'continuous', borderWidth: 1, borderColor: '#D4CEBF', paddingHorizontal: 14 },
  accountButtonText: { color: sharedBrand.colors.forest, fontSize: 12, fontWeight: '700' },
  hero: { gap: 10, paddingTop: 24 },
  eyebrow: { color: sharedBrand.colors.forest, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  title: { maxWidth: 500, color: discoveryColors.text, fontSize: 38, lineHeight: 43, fontWeight: '700', letterSpacing: -1.1 },
  description: { color: discoveryColors.secondary, fontSize: 15, lineHeight: 23 },
  searchCard: { gap: 10, backgroundColor: '#FFFFFF', borderRadius: 24, borderCurve: 'continuous', padding: 16, boxShadow: '0 8px 24px rgba(44, 67, 52, 0.07)' },
  searchLabel: { color: discoveryColors.text, fontSize: 12, fontWeight: '700' },
  searchField: { minHeight: 54, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#D8D1BE', borderRadius: 16, borderCurve: 'continuous', backgroundColor: '#FCFBF7', paddingLeft: 14 },
  searchFieldError: { borderColor: '#C76D63', backgroundColor: '#FFF9F8' },
  searchInput: { flex: 1, minHeight: 52, color: discoveryColors.text, fontSize: 15, paddingRight: 10 },
  clearButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 13 },
  clearButtonText: { color: '#736E64', fontSize: 11, fontWeight: '700' },
  validationError: { color: '#9A3D34', fontSize: 11, lineHeight: 17 },
  searchButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 15, borderCurve: 'continuous', backgroundColor: sharedBrand.colors.forest },
  searchButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  resultsHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, paddingTop: 4 },
  resultsCopy: { gap: 4 },
  resultsEyebrow: { color: '#7C7564', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  resultsTitle: { color: discoveryColors.text, fontSize: 22, lineHeight: 28, fontWeight: '700' },
  activeQuery: { maxWidth: '42%', color: sharedBrand.colors.forest, fontSize: 11, fontWeight: '700', backgroundColor: '#E4EADF', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 },
  results: { gap: 18 },
  pressed: { opacity: 0.65 },
});
