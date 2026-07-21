import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { AppButton } from '../components/ui/AppButton';
import { AppCard } from '../components/ui/AppCard';
import { colors, radii, typography, layout } from '../theme/tokens';
import { supabase } from '../services/supabase';

// Sandbox Live React Components
import { AgendaSandbox } from '../components/landing/sandbox/AgendaSandbox';
import { CommissionsSandbox } from '../components/landing/sandbox/CommissionsSandbox';
import { EmergencySwapSandbox } from '../components/landing/sandbox/EmergencySwapSandbox';
import { GspValidationSandbox } from '../components/landing/sandbox/GspValidationSandbox';

import {
  Scissors,
  Search,
  MapPin,
  Calendar as CalendarIcon,
  Sparkles,
  Building2,
  Compass,
  Check,
  ChevronRight,
  ShieldCheck,
  Zap,
  Star,
} from 'lucide-react-native';

export default function WelcomeLandingPage() {
  const router = useRouter();

  // 1. Organic Splash Screen (2 seconds max, with sessionStorage guard)
  const [showSplash, setShowSplash] = useState(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
      const hasSeen = window.sessionStorage.getItem('cuts_welcome_splash');
      if (hasSeen) return false;
      window.sessionStorage.setItem('cuts_welcome_splash', 'true');
      return true;
    }
    return false;
  });

  const fadeAnim = useState(() => new Animated.Value(1))[0];

  useEffect(() => {
    if (showSplash) {
      const timer = setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }).start(() => setShowSplash(false));
      }, 1600);
      return () => clearTimeout(timer);
    }
  }, [showSplash, fadeAnim]);

  // 2. Wizard & Trail States
  // 'client' (B2C), 'owner' (B2B), 'visitor' (Tour)
  const [activeTrail, setActiveTrail] = useState<'client' | 'owner' | 'visitor'>('client');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Search Bar States (Fresha Style)
  const [searchQuery, setSearchQuery] = useState('');
  const [locationQuery, setLocationQuery] = useState('Araraquara, SP');
  const [dateQuery, setDateQuery] = useState('Qualquer Data');

  // Supabase Active Establishments
  const [establishments, setEstablishments] = useState<any[]>([]);
  const [loadingShops, setLoadingShops] = useState(true);

  // B2B ROI Simulator State
  const [roiStaffCount, setRoiStaffCount] = useState(4);

  // B2B Auto-activation CNPJ input
  const [triageCnpjInput, setTriageCnpjInput] = useState('');

  // Haptics Trigger (Mobile)
  const triggerHaptic = () => {
    if (Platform.OS !== 'web') {
      try {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}
    }
  };

  // Keyboard Shortcuts (Superhuman style for desktop)
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'c') {
        setActiveTrail('client');
        triggerHaptic();
      } else if (key === 'd') {
        setActiveTrail('owner');
        triggerHaptic();
      } else if (key === 'p') {
        setActiveTrail('visitor');
        triggerHaptic();
      } else if (e.key === 'Escape') {
        setActiveTrail('client');
        setSelectedCategory(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch Active Establishments from Supabase
  useEffect(() => {
    const fetchShops = async () => {
      try {
        setLoadingShops(true);
        const { data, error } = await supabase
          .from('establishments')
          .select('id, name, slug, address, phone, banner_url, logo_url, description, primary_color, average_rating, account_status')
          .eq('account_status', 'active')
          .order('name');

        if (error) throw error;
        setEstablishments(data || []);
      } catch (err) {
        console.error('Failed to load establishments for landing marketplace:', err);
      } finally {
        setLoadingShops(false);
      }
    };
    void fetchShops();
  }, []);

  // Filter Establishments for B2C Marketplace
  const filteredShops = establishments.filter((shop) => {
    const matchesSearch =
      !searchQuery.trim() ||
      [shop.name, shop.address, shop.description].some((val) =>
        val?.toLowerCase().includes(searchQuery.toLowerCase())
      );

    const matchesLocation =
      !locationQuery.trim() ||
      shop.address?.toLowerCase().includes(locationQuery.toLowerCase().split(',')[0].toLowerCase());

    if (selectedCategory === 'barbearia') {
      return (
        matchesSearch &&
        matchesLocation &&
        (shop.name.toLowerCase().includes('barber') ||
          shop.description?.toLowerCase().includes('barba') ||
          shop.description?.toLowerCase().includes('corte'))
      );
    }
    if (selectedCategory === 'salao') {
      return (
        matchesSearch &&
        matchesLocation &&
        (shop.name.toLowerCase().includes('salão') ||
          shop.name.toLowerCase().includes('salao') ||
          shop.description?.toLowerCase().includes('beleza') ||
          shop.description?.toLowerCase().includes('cabelo'))
      );
    }
    if (selectedCategory === 'manicure') {
      return (
        matchesSearch &&
        matchesLocation &&
        (shop.name.toLowerCase().includes('manicure') ||
          shop.name.toLowerCase().includes('nails') ||
          shop.description?.toLowerCase().includes('unha'))
      );
    }
    if (selectedCategory === 'estetica') {
      return (
        matchesSearch &&
        matchesLocation &&
        (shop.description?.toLowerCase().includes('estética') ||
          shop.description?.toLowerCase().includes('pele') ||
          shop.name.toLowerCase().includes('estética'))
      );
    }

    return matchesSearch && matchesLocation;
  });

  // Calculate ROI
  const hoursSavedPerMonth = roiStaffCount * 18;
  const estimatedRevenueGain = roiStaffCount * 1450;

  // Render Splash Screen if active
  if (showSplash) {
    return (
      <Animated.View style={[styles.splashContainer, { opacity: fadeAnim }]}>
        <View style={styles.splashContent}>
          <View style={styles.splashLogoCircle}>
            <Scissors size={42} color="#DAD2B6" />
          </View>

          <Text style={styles.splashTitle}>
            Cut<Text style={{ color: '#DAD2B6' }}>Sync</Text>
          </Text>

          <Text style={styles.splashSubtitle}>
            PLATAFORMA DE AGENDAMENTO UNIVERSAL
          </Text>

          <ActivityIndicator color="#DAD2B6" style={{ marginTop: 24 }} />
        </View>
      </Animated.View>
    );
  }

  return (
    <View style={styles.container}>
      {/* -------------------------------------------------------------------------- */}
      {/* TOP NAVBAR                                                                */}
      {/* -------------------------------------------------------------------------- */}
      <View style={styles.navbar}>
        <View style={styles.navInner}>
          <View style={styles.logoContainer}>
            <Scissors color="#DAD2B6" size={24} />
            <Text style={styles.logoText}>
              Cut<Text style={styles.logoHighlight}>Sync</Text>
            </Text>
          </View>

          <View style={styles.navActions}>
            <Pressable
              style={styles.navLinkBtn}
              onPress={() => {
                setActiveTrail('owner');
                triggerHaptic();
              }}
            >
              <Text style={styles.navLinkText}>Para Estabelecimentos</Text>
            </Pressable>

            <AppButton
              testID="landing-login-btn"
              label="Acessar Painel"
              variant="secondary"
              size="sm"
              onPress={() => router.push('/(auth)/login' as any)}
            />
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.mainWrapper}>
          {/* -------------------------------------------------------------------------- */}
          {/* HERO HEADER SECTION                                                       */}
          {/* -------------------------------------------------------------------------- */}
          <View style={styles.heroHeader}>
            <View style={styles.heroBadge}>
              <Sparkles size={13} color="#113939" />
              <Text style={styles.heroBadgeText}>SISTEMA DE AGENDAMENTO UNIVERSAL</Text>
            </View>

            <Text style={styles.heroTitle}>
              Seu horário agendado.{'\n'}
              <Text style={styles.heroHighlight}>Sem esperas. Sem atrito.</Text>
            </Text>

            <Text style={styles.heroSubtitle}>
              Descubra os melhores salões e barbearias de Araraquara, Matão e região com confirmação instantânea.
            </Text>
          </View>

          {/* -------------------------------------------------------------------------- */}
          {/* WIZARD REATIVO & ATALHOS (SUPERHUMAN STYLE)                               */}
          {/* -------------------------------------------------------------------------- */}
          <View style={styles.wizardContainer}>
            <View style={styles.wizardGrid}>
              {/* Option C */}
              <Pressable
                style={[styles.wizardCard, activeTrail === 'client' && styles.wizardCardActive]}
                onPress={() => {
                  setActiveTrail('client');
                  triggerHaptic();
                }}
              >
                <View style={styles.keyCap}>
                  <Text style={styles.keyCapText}>C</Text>
                </View>
                <View style={styles.wizardCardCopy}>
                  <Text style={styles.wizardCardTitle}>Quero agendar um serviço</Text>
                  <Text style={styles.wizardCardSub}>Marketplace B2C & Busca Global</Text>
                </View>
              </Pressable>

              {/* Option D */}
              <Pressable
                style={[styles.wizardCard, activeTrail === 'owner' && styles.wizardCardActive]}
                onPress={() => {
                  setActiveTrail('owner');
                  triggerHaptic();
                }}
              >
                <View style={styles.keyCap}>
                  <Text style={styles.keyCapText}>D</Text>
                </View>
                <View style={styles.wizardCardCopy}>
                  <Text style={styles.wizardCardTitle}>Sou proprietário / profissional</Text>
                  <Text style={styles.wizardCardSub}>Live Sandbox B2B + Onboarding</Text>
                </View>
              </Pressable>

              {/* Option P */}
              <Pressable
                style={[styles.wizardCard, activeTrail === 'visitor' && styles.wizardCardActive]}
                onPress={() => {
                  setActiveTrail('visitor');
                  triggerHaptic();
                }}
              >
                <View style={styles.keyCap}>
                  <Text style={styles.keyCapText}>P</Text>
                </View>
                <View style={styles.wizardCardCopy}>
                  <Text style={styles.wizardCardTitle}>Apenas explorando</Text>
                  <Text style={styles.wizardCardSub}>Tour rápido pelos diferenciais</Text>
                </View>
              </Pressable>
            </View>
          </View>

          {/* -------------------------------------------------------------------------- */}
          {/* TRILHA B2C: MARKETPLACE & BUSCA GLOBAL (FRESHA STYLE)                      */}
          {/* -------------------------------------------------------------------------- */}
          {activeTrail === 'client' && (
            <View style={styles.trailSection}>
              {/* Global Search Bar */}
              <View style={styles.searchBarBox}>
                <View style={styles.searchFieldItem}>
                  <Search size={18} color={colors.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Serviço ou Salão (ex: Barba, Degradê...)"
                    placeholderTextColor={colors.textMuted}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                </View>

                <View style={styles.searchDivider} />

                <View style={styles.searchFieldItem}>
                  <MapPin size={18} color={colors.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Cidade / Bairro"
                    placeholderTextColor={colors.textMuted}
                    value={locationQuery}
                    onChangeText={setLocationQuery}
                  />
                </View>

                <View style={styles.searchDivider} />

                <View style={styles.searchFieldItem}>
                  <CalendarIcon size={18} color={colors.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Data"
                    placeholderTextColor={colors.textMuted}
                    value={dateQuery}
                    onChangeText={setDateQuery}
                  />
                </View>

                <AppButton label="Buscar" style={styles.searchSubmitBtn} onPress={triggerHaptic} />
              </View>

              {/* Category Quick Chips */}
              <View style={styles.categoryChipsRow}>
                {[
                  { id: 'barbearia', label: '💈 Barbearia' },
                  { id: 'salao', label: '💇‍♀️ Salão de Beleza' },
                  { id: 'manicure', label: '💅 Manicure' },
                  { id: 'estetica', label: '🪒 Estética' },
                ].map((cat) => (
                  <Pressable
                    key={cat.id}
                    style={[
                      styles.categoryChip,
                      selectedCategory === cat.id && styles.categoryChipActive,
                    ]}
                    onPress={() => {
                      setSelectedCategory(selectedCategory === cat.id ? null : cat.id);
                      triggerHaptic();
                    }}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        selectedCategory === cat.id && styles.categoryChipTextActive,
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Marketplace Establishments Grid */}
              <View style={styles.shopsSection}>
                <Text style={styles.sectionTitle}>
                  Estabelecimentos em Destaque em Araraquara e Região
                </Text>

                {loadingShops ? (
                  <ActivityIndicator color="#113939" style={{ marginVertical: 32 }} />
                ) : filteredShops.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyText}>
                      Nenhum estabelecimento ativo encontrado com os filtros atuais.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.shopsGrid}>
                    {filteredShops.map((shop) => (
                      <Pressable
                        key={shop.id}
                        style={styles.shopGridCard}
                        onPress={() => router.push(`/${shop.slug}/booking` as any)}
                      >
                        <View style={styles.shopImageContainer}>
                          {shop.banner_url || shop.logo_url ? (
                            <Image
                              source={{ uri: shop.banner_url || shop.logo_url }}
                              style={styles.shopCoverImg}
                              contentFit="cover"
                            />
                          ) : (
                            <View style={styles.shopFallbackBox}>
                              <Scissors size={28} color="#113939" />
                            </View>
                          )}
                          <View style={styles.ratingBadge}>
                            <Star size={12} color="#F5A524" fill="#F5A524" />
                            <Text style={styles.ratingBadgeText}>
                              {shop.average_rating ? Number(shop.average_rating).toFixed(1) : '4.9'}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.shopCardBody}>
                          <Text style={styles.shopName} numberOfLines={1}>
                            {shop.name}
                          </Text>

                          <Text style={styles.shopAddress} numberOfLines={1}>
                            {shop.address || 'Araraquara, SP'}
                          </Text>

                          <Text style={styles.shopDesc} numberOfLines={2}>
                            {shop.description || 'Atendimento de alta precisão com profissionais especializados.'}
                          </Text>

                          <View style={styles.shopFooter}>
                            <AppButton
                              label="Ver Horários"
                              size="sm"
                              icon={<ChevronRight size={14} color="#FFFFFF" />}
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
            </View>
          )}

          {/* -------------------------------------------------------------------------- */}
          {/* TRILHA B2B: LIVE SANDBOX & COMPONENTES REACT REAIS INTERATIVOS              */}
          {/* -------------------------------------------------------------------------- */}
          {activeTrail === 'owner' && (
            <View style={styles.trailSection}>
              <View style={styles.sandboxHeader}>
                <View style={styles.liveTag}>
                  <Zap size={14} color="#113939" />
                  <Text style={styles.liveTagText}>LIVE SANDBOX B2B</Text>
                </View>
                <Text style={styles.sandboxTitle}>
                  Experimente o Sistema com Componentes React Reais
                </Text>
                <Text style={styles.sandboxSubtitle}>
                  Zero imagens estáticas. Teste a agenda de balcão, cálculo de comissões, contingência e validação antifraude.
                </Text>
              </View>

              {/* 4 Interactive Live Sandbox Component Frames */}
              <View style={styles.sandboxFramesGrid}>
                {/* Frame 1: Agenda de Balcão */}
                <AgendaSandbox />

                {/* Frame 2: Divisão de Comissões */}
                <CommissionsSandbox />

                {/* Frame 3: Contingência de Ausência */}
                <EmergencySwapSandbox />

                {/* Frame 4: Validador Antifraude GSP */}
                <GspValidationSandbox />
              </View>

              {/* B2B ROI Simulator */}
              <AppCard style={styles.roiCard} elevated>
                <Text style={styles.roiTitle}>Simulador de Retorno de Investimento (ROI)</Text>
                <Text style={styles.roiSubtitle}>
                  Calcule a economia mensal de tempo e ganho de receita no seu salão.
                </Text>

                <View style={styles.roiControlRow}>
                  <Text style={styles.roiControlLabel}>Quantidade de Profissionais na Equipe:</Text>
                  <Text style={styles.roiControlVal}>{roiStaffCount} Colaboradores</Text>
                </View>

                <View style={styles.roiChipsRow}>
                  {[1, 2, 4, 6, 8, 10].map((num) => (
                    <Pressable
                      key={num}
                      onPress={() => setRoiStaffCount(num)}
                      style={[styles.roiChip, roiStaffCount === num && styles.roiChipActive]}
                    >
                      <Text style={[styles.roiChipText, roiStaffCount === num && styles.roiChipTextActive]}>
                        {num}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.roiResultsGrid}>
                  <View style={styles.roiResultBox}>
                    <Text style={styles.roiResultNumber}>{hoursSavedPerMonth}h</Text>
                    <Text style={styles.roiResultLabel}>Horas de Gestão Economizadas / Mês</Text>
                  </View>

                  <View style={styles.roiResultBox}>
                    <Text style={styles.roiResultNumber}>R$ {estimatedRevenueGain.toLocaleString('pt-BR')}</Text>
                    <Text style={styles.roiResultLabel}>Ganho Estimado em Faturamento Automatizado</Text>
                  </View>
                </View>
              </AppCard>

              {/* Subscription Plans Table */}
              <View style={styles.plansSection}>
                <Text style={styles.sectionTitle}>Planos de Assinatura CutSync</Text>

                <View style={styles.plansGrid}>
                  {/* Plan 1: Essencial */}
                  <View style={styles.planCard}>
                    <Text style={styles.planBadge}>STARTUP</Text>
                    <Text style={styles.planName}>Essencial</Text>
                    <Text style={styles.planPrice}>
                      R$ 49<Text style={styles.planPeriod}>/mês</Text>
                    </Text>
                    <Text style={styles.planDesc}>Ideal para profissionais autônomos e barbearias individuais.</Text>

                    <View style={styles.planFeatures}>
                      <View style={styles.planFeatureItem}>
                        <Check size={14} color="#3F7A4C" />
                        <Text style={styles.planFeatureText}>Até 2 Agendas de Colaboradores</Text>
                      </View>
                      <View style={styles.planFeatureItem}>
                        <Check size={14} color="#3F7A4C" />
                        <Text style={styles.planFeatureText}>Link Público de Agendamento</Text>
                      </View>
                      <View style={styles.planFeatureItem}>
                        <Check size={14} color="#3F7A4C" />
                        <Text style={styles.planFeatureText}>Notificações e Lembretes</Text>
                      </View>
                    </View>

                    <AppButton
                      label="Começar Agora"
                      fullWidth
                      style={{ marginTop: 16 }}
                      onPress={() => router.push('/(auth)/register' as any)}
                    />
                  </View>

                  {/* Plan 2: Pro (Highlighted) */}
                  <View style={[styles.planCard, styles.planCardFeatured]}>
                    <Text style={styles.planBadgeFeatured}>MAIS POPULAR</Text>
                    <Text style={styles.planNameFeatured}>Profissional Pro</Text>
                    <Text style={styles.planPriceFeatured}>
                      R$ 119<Text style={styles.planPeriodFeatured}>/mês</Text>
                    </Text>
                    <Text style={styles.planDescFeatured}>Para salões e barbearias com equipe consolidada.</Text>

                    <View style={styles.planFeatures}>
                      <View style={styles.planFeatureItem}>
                        <Check size={14} color="#F5A524" />
                        <Text style={styles.planFeatureTextFeatured}>Até 8 Agendas Sincronizadas</Text>
                      </View>
                      <View style={styles.planFeatureItem}>
                        <Check size={14} color="#F5A524" />
                        <Text style={styles.planFeatureTextFeatured}>Divisão Automática de Comissão Pix</Text>
                      </View>
                      <View style={styles.planFeatureItem}>
                        <Check size={14} color="#F5A524" />
                        <Text style={styles.planFeatureTextFeatured}>Contingência de Ausência Automática</Text>
                      </View>
                    </View>

                    <AppButton
                      label="Criar Conta Pro"
                      fullWidth
                      style={{ marginTop: 16, backgroundColor: '#F5A524' }}
                      onPress={() => router.push('/(auth)/register' as any)}
                    />
                  </View>
                </View>

                {/* Regional CNPJ Auto-triage input */}
                <View style={styles.triageCard}>
                  <Building2 size={24} color="#DAD2B6" />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.triageTitle}>Verifique Elegibilidade na Região de Araraquara / Matão</Text>
                    <Text style={styles.triageDesc}>
                      Insira seu CNPJ/CPF para receber ativação assistida em menos de 5 minutos.
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                      <TextInput
                        style={styles.triageInput}
                        placeholder="Digite seu CNPJ ou CPF..."
                        placeholderTextColor={colors.textMuted}
                        value={triageCnpjInput}
                        onChangeText={setTriageCnpjInput}
                      />
                      <AppButton
                        label="Verificar e Cadastrar"
                        onPress={() => router.push('/(auth)/register' as any)}
                      />
                    </View>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* -------------------------------------------------------------------------- */}
          {/* TRILHA VISITOR: TOUR RÁPIDO                                               */}
          {/* -------------------------------------------------------------------------- */}
          {activeTrail === 'visitor' && (
            <View style={styles.trailSection}>
              <AppCard style={styles.tourCard} elevated>
                <Text style={styles.tourTitle}>Tour pelos Diferenciais do CutSync</Text>
                <Text style={styles.tourSubtitle}>
                  Entenda por que a nossa plataforma oferece a experiência mais fluida do mercado.
                </Text>

                <View style={styles.tourFeaturesList}>
                  <View style={styles.tourFeatureItem}>
                    <View style={styles.tourIconCircle}>
                      <Zap size={20} color="#113939" />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.tourFeatureTitle}>Atalhos de Teclado Superhuman</Text>
                      <Text style={styles.tourFeatureDesc}>
                        Navegue usando as teclas C, D, P e Esc. Troque de telas em menos de 100ms.
                      </Text>
                    </View>
                  </View>

                  <View style={styles.tourFeatureItem}>
                    <View style={styles.tourIconCircle}>
                      <ShieldCheck size={20} color="#113939" />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.tourFeatureTitle}>Comissões Automáticas por Pix</Text>
                      <Text style={styles.tourFeatureDesc}>
                        Repasses automatizados e relatórios de retenção transparente para administradores e equipe.
                      </Text>
                    </View>
                  </View>

                  <View style={styles.tourFeatureItem}>
                    <View style={styles.tourIconCircle}>
                      <Compass size={20} color="#113939" />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.tourFeatureTitle}>Interface Off-White Responsiva</Text>
                      <Text style={styles.tourFeatureDesc}>
                        Alta legibilidade, sem poluição visual e otimizada para computadores e smartphones.
                      </Text>
                    </View>
                  </View>
                </View>

                <AppButton
                  label="Começar no Marketplace como Cliente"
                  style={{ marginTop: 12 }}
                  onPress={() => {
                    setActiveTrail('client');
                    triggerHaptic();
                  }}
                />
              </AppCard>
            </View>
          )}
        </View>
      </ScrollView>

      {/* -------------------------------------------------------------------------- */}
      {/* SUPERHUMAN DESKTOP KEYBOARD SHORTCUTS FOOTER                              */}
      {/* -------------------------------------------------------------------------- */}
      <View style={styles.shortcutFooter}>
        <Text style={styles.shortcutFooterText}>Atalhos Superhuman:</Text>
        <View style={styles.shortcutPillsRow}>
          <Pressable
            onPress={() => {
              setActiveTrail('client');
              triggerHaptic();
            }}
            style={styles.shortcutPill}
          >
            <Text style={styles.shortcutKey}>C</Text>
            <Text style={styles.shortcutLabel}>Cliente</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setActiveTrail('owner');
              triggerHaptic();
            }}
            style={styles.shortcutPill}
          >
            <Text style={styles.shortcutKey}>D</Text>
            <Text style={styles.shortcutLabel}>Proprietário</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setActiveTrail('visitor');
              triggerHaptic();
            }}
            style={styles.shortcutPill}
          >
            <Text style={styles.shortcutKey}>P</Text>
            <Text style={styles.shortcutLabel}>Explorar</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setActiveTrail('client');
              setSelectedCategory(null);
            }}
            style={styles.shortcutPill}
          >
            <Text style={styles.shortcutKey}>Esc</Text>
            <Text style={styles.shortcutLabel}>Limpar</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    paddingBottom: 48,
  },
  splashContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#113939',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  splashContent: {
    alignItems: 'center',
    gap: 8,
  },
  splashLogoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(218,210,182,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  splashTitle: {
    fontSize: 36,
    fontFamily: typography.display,
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  splashSubtitle: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: '#DAD2B6',
    letterSpacing: 2,
    marginTop: 4,
  },
  navbar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E4E5DF',
    paddingHorizontal: 24,
    paddingVertical: 14,
    zIndex: 10,
  },
  navInner: {
    maxWidth: layout.formMax,
    alignSelf: 'center',
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoText: {
    fontSize: 22,
    color: '#113939',
    fontFamily: typography.display,
  },
  logoHighlight: {
    color: '#F5A524',
  },
  navActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  navLinkBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  navLinkText: {
    fontSize: 13,
    fontFamily: typography.bodyStrong,
    color: colors.textSecondary,
  },
  scrollContent: {
    paddingBottom: 80,
  },
  mainWrapper: {
    maxWidth: layout.formMax,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 28,
  },
  heroHeader: {
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0ECE0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  heroBadgeText: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: '#113939',
    letterSpacing: 1,
  },
  heroTitle: {
    fontSize: 38,
    fontFamily: typography.display,
    color: '#1A1A1E',
    lineHeight: 44,
    letterSpacing: -1.2,
    textAlign: 'center',
  },
  heroHighlight: {
    color: '#113939',
  },
  heroSubtitle: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 580,
  },
  wizardContainer: {
    width: '100%',
  },
  wizardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  wizardCard: {
    flex: 1,
    minWidth: 240,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E5DF',
    borderRadius: radii.lg,
    padding: 16,
    boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
  },
  wizardCardActive: {
    borderColor: '#113939',
    borderWidth: 2,
    backgroundColor: '#F4F7F5',
  },
  keyCap: {
    backgroundColor: '#F0ECE0',
    borderWidth: 1,
    borderColor: '#DAD2B6',
    borderRadius: radii.sm,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyCapText: {
    fontSize: 12,
    fontFamily: typography.bodyStrong,
    color: '#113939',
  },
  wizardCardCopy: {
    flex: 1,
    gap: 2,
  },
  wizardCardTitle: {
    fontSize: 13,
    fontFamily: typography.bodyStrong,
    color: '#1A1A1E',
  },
  wizardCardSub: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.body,
  },
  trailSection: {
    gap: 24,
  },
  searchBarBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E5DF',
    borderRadius: radii.lg,
    padding: 8,
    gap: 8,
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  },
  searchFieldItem: {
    flex: 1,
    minWidth: 180,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: typography.body,
    color: '#1A1A1E',
    outlineStyle: 'none',
  } as any,
  searchDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E4E5DF',
  },
  searchSubmitBtn: {
    minHeight: 44,
    paddingHorizontal: 20,
    backgroundColor: '#113939',
  },
  categoryChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E5DF',
  },
  categoryChipActive: {
    backgroundColor: '#113939',
    borderColor: '#113939',
  },
  categoryChipText: {
    fontSize: 12,
    fontFamily: typography.bodyStrong,
    color: '#1A1A1E',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },
  shopsSection: {
    gap: 16,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: typography.display,
    color: '#1A1A1E',
  },
  emptyCard: {
    padding: 32,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#E4E5DF',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: typography.body,
  },
  shopsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  shopGridCard: {
    width: '100%',
    maxWidth: 360,
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#E4E5DF',
    overflow: 'hidden',
    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
  },
  shopImageContainer: {
    height: 140,
    width: '100%',
    position: 'relative',
    backgroundColor: '#F0ECE0',
  },
  shopCoverImg: {
    width: '100%',
    height: '100%',
  },
  shopFallbackBox: {
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
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  ratingBadgeText: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: '#1A1A1E',
  },
  shopCardBody: {
    padding: 16,
    gap: 8,
  },
  shopName: {
    fontSize: 16,
    fontFamily: typography.display,
    color: '#1A1A1E',
  },
  shopAddress: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.body,
  },
  shopDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  shopFooter: {
    borderTopWidth: 1,
    borderTopColor: '#E4E5DF',
    paddingTop: 12,
    marginTop: 4,
    alignItems: 'flex-end',
  },
  sandboxHeader: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0ECE0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  liveTagText: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: '#113939',
    letterSpacing: 1,
  },
  sandboxTitle: {
    fontSize: 22,
    fontFamily: typography.display,
    color: '#1A1A1E',
    textAlign: 'center',
  },
  sandboxSubtitle: {
    fontSize: 13,
    fontFamily: typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 580,
  },
  sandboxFramesGrid: {
    gap: 20,
  },
  roiCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#E4E5DF',
    padding: 24,
    gap: 16,
    marginTop: 12,
  },
  roiTitle: {
    fontSize: 18,
    fontFamily: typography.display,
    color: '#113939',
  },
  roiSubtitle: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.textSecondary,
  },
  roiControlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roiControlLabel: {
    fontSize: 13,
    fontFamily: typography.bodyStrong,
    color: '#1A1A1E',
  },
  roiControlVal: {
    fontSize: 14,
    fontFamily: typography.display,
    color: '#113939',
  },
  roiChipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  roiChip: {
    flex: 1,
    height: 36,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E4E5DF',
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roiChipActive: {
    backgroundColor: '#113939',
    borderColor: '#113939',
  },
  roiChipText: {
    fontSize: 12,
    fontFamily: typography.bodyStrong,
    color: '#1A1A1E',
  },
  roiChipTextActive: {
    color: '#FFFFFF',
  },
  roiResultsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  roiResultBox: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#E4E5DF',
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  roiResultNumber: {
    fontSize: 20,
    fontFamily: typography.display,
    color: '#113939',
  },
  roiResultLabel: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
  },
  plansSection: {
    gap: 16,
    marginTop: 12,
  },
  plansGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  planCard: {
    flex: 1,
    minWidth: 260,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#E4E5DF',
    padding: 24,
    gap: 12,
  },
  planCardFeatured: {
    backgroundColor: '#113939',
    borderColor: '#113939',
  },
  planBadge: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: colors.textMuted,
    letterSpacing: 1,
  },
  planBadgeFeatured: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: '#F5A524',
    letterSpacing: 1,
  },
  planName: {
    fontSize: 20,
    fontFamily: typography.display,
    color: '#1A1A1E',
  },
  planNameFeatured: {
    fontSize: 20,
    fontFamily: typography.display,
    color: '#FFFFFF',
  },
  planPrice: {
    fontSize: 32,
    fontFamily: typography.display,
    color: '#113939',
  },
  planPriceFeatured: {
    fontSize: 32,
    fontFamily: typography.display,
    color: '#FFFFFF',
  },
  planPeriod: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.textMuted,
  },
  planPeriodFeatured: {
    fontSize: 14,
    fontFamily: typography.body,
    color: '#DAD2B6',
  },
  planDesc: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  planDescFeatured: {
    fontSize: 12,
    fontFamily: typography.body,
    color: '#DAD2B6',
    lineHeight: 18,
  },
  planFeatures: {
    gap: 8,
    marginTop: 8,
  },
  planFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planFeatureText: {
    fontSize: 12,
    fontFamily: typography.body,
    color: '#1A1A1E',
  },
  planFeatureTextFeatured: {
    fontSize: 12,
    fontFamily: typography.body,
    color: '#FFFFFF',
  },
  triageCard: {
    backgroundColor: '#113939',
    borderRadius: radii.lg,
    padding: 24,
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  triageTitle: {
    fontSize: 15,
    fontFamily: typography.display,
    color: '#FFFFFF',
  },
  triageDesc: {
    fontSize: 12,
    fontFamily: typography.body,
    color: '#DAD2B6',
  },
  triageInput: {
    flex: 1,
    height: 42,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.md,
    paddingHorizontal: 14,
    fontSize: 13,
    fontFamily: typography.body,
    color: '#1A1A1E',
  },
  tourCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#E4E5DF',
    padding: 24,
    gap: 16,
  },
  tourTitle: {
    fontSize: 20,
    fontFamily: typography.display,
    color: '#113939',
  },
  tourSubtitle: {
    fontSize: 13,
    fontFamily: typography.body,
    color: colors.textSecondary,
  },
  tourFeaturesList: {
    gap: 16,
    marginVertical: 8,
  },
  tourFeatureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  tourIconCircle: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: '#F0ECE0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tourFeatureTitle: {
    fontSize: 14,
    fontFamily: typography.bodyStrong,
    color: '#1A1A1E',
  },
  tourFeatureDesc: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  shortcutFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 48,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E4E5DF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 20,
    display: Platform.OS === 'web' ? 'flex' : 'none',
  },
  shortcutFooterText: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.body,
  },
  shortcutPillsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  shortcutPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: '#E4E5DF',
  },
  shortcutKey: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: '#113939',
    backgroundColor: '#F0ECE0',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
  },
  shortcutLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
});
