import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { AppButton } from '../components/ui/AppButton';
import { AppCard } from '../components/ui/AppCard';
import { colors, radii, typography } from '../theme/tokens';
import { supabase } from '../services/supabase';
import { 
  Building2, 
  Scissors, 
  ArrowLeft, 
  Users, 
  DollarSign, 
  Hourglass,
  Sparkles,
  Search
} from 'lucide-react-native';

export default function WelcomeLandingPage() {
  const router = useRouter();

  // Wizard flow states
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<'client' | 'owner' | 'visitor' | null>(null);
  const [interest, setInterest] = useState<string | null>(null);

  // Active shops dynamic state
  const [establishments, setEstablishments] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingShops, setLoadingShops] = useState(true);

  // Financial Simulator states
  const [numBarbers, setNumBarbers] = useState(3);
  const [avgPrice, setAvgPrice] = useState(50);
  const [commissionRate, setCommissionRate] = useState(40);
  const [appointmentsPerMonth, setAppointmentsPerMonth] = useState(120);

  // Fetch shops
  useEffect(() => {
    const fetchShops = async () => {
      try {
        setLoadingShops(true);
        const { data, error } = await supabase
          .from('establishments')
          .select('id, name, slug, address, phone, banner_url, logo_url, description, primary_color, average_rating')
          .eq('account_status', 'active')
          .order('name');
        
        if (error) throw error;
        setEstablishments(data || []);
      } catch (err) {
        console.error("Failed to load establishments:", err);
      } finally {
        setLoadingShops(false);
      }
    };
    void fetchShops();
  }, []);

  // Keyboard Navigation listener (Superhuman style)
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if focus is in input fields
      const activeElement = document.activeElement;
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        return;
      }

      const key = e.key.toLowerCase();

      if (step === 1) {
        if (key === 'c') {
          setRole('client');
          setStep(2);
        } else if (key === 'd') {
          setRole('owner');
          setStep(2);
        } else if (key === 'p') {
          setRole('visitor');
          setStep(2);
        }
      } else if (step === 2) {
        if (e.key === 'Escape') {
          setStep(1);
          setRole(null);
          setInterest(null);
        }
        if (role === 'client') {
          if (key === '1') {
            setInterest('barbearia');
          } else if (key === '2') {
            setInterest('salao');
          } else if (key === '3') {
            setInterest('manicure');
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step, role]);

  // Calculations for Owner Dashboard Simulator
  const totalRevenue = numBarbers * avgPrice * appointmentsPerMonth;
  const ownerShare = totalRevenue * (commissionRate / 100);
  const barbersShare = totalRevenue - ownerShare;
  const hoursSaved = numBarbers * 15; // 15 hours saved per barber per month

  // Filtered Shops grid output
  const filteredShops = establishments.filter((shop) => {
    const matchesSearch = !searchQuery.trim() || [shop.name, shop.address, shop.description].some(
      val => val?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (interest === 'barbearia') {
      return matchesSearch && (shop.name.toLowerCase().includes('barber') || shop.description?.toLowerCase().includes('barber') || shop.description?.toLowerCase().includes('barba'));
    }
    if (interest === 'salao') {
      return matchesSearch && (shop.name.toLowerCase().includes('salao') || shop.name.toLowerCase().includes('salão') || shop.description?.toLowerCase().includes('cabelo') || shop.description?.toLowerCase().includes('beleza') || shop.description?.toLowerCase().includes('estética'));
    }
    if (interest === 'manicure') {
      return matchesSearch && (shop.name.toLowerCase().includes('manicure') || shop.name.toLowerCase().includes('unha') || shop.name.toLowerCase().includes('pedicure') || shop.name.toLowerCase().includes('esmalte'));
    }

    return matchesSearch;
  });

  return (
    <View style={styles.container}>
      {/* Top Navbar */}
      <View style={styles.navbar}>
        <View style={styles.logoContainer}>
          <Scissors color={colors.brandPrimary} size={22} />
          <Text style={styles.logoText}>Cut<Text style={styles.logoHighlight}>Sync</Text></Text>
        </View>
        <AppButton 
          testID="landing-login-btn" 
          label="Acessar Painel" 
          variant="secondary" 
          style={styles.navBtn}
          onPress={() => router.push('/(auth)/login' as any)} 
        />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.centerLayout}>
          
          {/* Centered Hero Header */}
          <View style={styles.heroTextContainer}>
            <View style={styles.badge}>
              <Sparkles size={12} color={colors.brandPrimary} />
              <Text style={styles.badgeText}>SISTEMA DE AGENDAMENTO UNIVERSAL</Text>
            </View>
            <Text style={styles.heroTitle}>
              Gestão simplificada.{'\n'}
              <Text style={styles.heroHighlight}>Experiência inigualável.</Text>
            </Text>
            <Text style={styles.heroDescription}>
              O agendador mais rápido e automatizado do mercado para clientes, profissionais e administradores.
            </Text>
          </View>

          {/* Global Search Bar */}
          <View style={styles.searchBarContainer}>
            <View style={styles.searchFieldBox}>
              <Search size={18} color={colors.textMuted} />
              <TextInput
                testID="global-search-input"
                style={styles.globalSearchInput}
                placeholder="Buscar salão por nome, bairro ou especialidade..."
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
          </View>

          {/* Reorganized Wizard Reativo (Atalhos [C], [D], [P]) */}
          <View style={styles.wizardRow}>
            <Pressable 
              style={[styles.wizardTabCard, (role === 'client' || !role) && styles.wizardTabCardActive]}
              onPress={() => { setRole('client'); setStep(step === 1 ? 2 : step); }}
            >
              <View style={styles.keyCap}><Text style={styles.keyCapText}>C</Text></View>
              <View style={styles.tabCardInfo}>
                <Text style={styles.tabCardTitle}>Quero agendar um serviço</Text>
                <Text style={styles.tabCardSubtitle}>Ver vitrine de salões</Text>
              </View>
            </Pressable>

            <Pressable 
              style={[styles.wizardTabCard, role === 'owner' && styles.wizardTabCardActive]}
              onPress={() => { setRole('owner'); setStep(2); }}
            >
              <View style={styles.keyCap}><Text style={styles.keyCapText}>D</Text></View>
              <View style={styles.tabCardInfo}>
                <Text style={styles.tabCardTitle}>Sou proprietário / profissional</Text>
                <Text style={styles.tabCardSubtitle}>Onboarding e simulador B2B</Text>
              </View>
            </Pressable>

            <Pressable 
              style={[styles.wizardTabCard, role === 'visitor' && styles.wizardTabCardActive]}
              onPress={() => { setRole('visitor'); setStep(2); }}
            >
              <View style={styles.keyCap}><Text style={styles.keyCapText}>P</Text></View>
              <View style={styles.tabCardInfo}>
                <Text style={styles.tabCardTitle}>Apenas explorando</Text>
                <Text style={styles.tabCardSubtitle}>Tour rápido pelos recursos</Text>
              </View>
            </Pressable>
          </View>

          {/* Render step 2 details inline if selected */}
          {step === 2 && (role === 'client' || !role) && (
            <AppCard style={styles.wizardSubCard} elevated>
              <View style={styles.wizardSubHeader}>
                <Pressable style={styles.backLink} onPress={() => { setStep(1); setRole(null); setInterest(null); }}>
                  <ArrowLeft size={13} color={colors.textSecondary} />
                  <Text style={styles.backLinkText}>Limpar filtros</Text>
                </Pressable>
                <Text style={styles.wizardLabel}>FILTRO DE CATEGORIA</Text>
              </View>
              <View style={styles.optionsListHorizontal}>
                <Pressable 
                  style={[styles.optionButtonMini, interest === 'barbearia' && styles.optionButtonMiniActive]}
                  onPress={() => setInterest(interest === 'barbearia' ? null : 'barbearia')}
                >
                  <Text style={[styles.optionButtonMiniText, interest === 'barbearia' && styles.optionButtonMiniTextActive]}>Barbearia</Text>
                </Pressable>
                <Pressable 
                  style={[styles.optionButtonMini, interest === 'salao' && styles.optionButtonMiniActive]}
                  onPress={() => setInterest(interest === 'salao' ? null : 'salao')}
                >
                  <Text style={[styles.optionButtonMiniText, interest === 'salao' && styles.optionButtonMiniTextActive]}>Salão de Beleza</Text>
                </Pressable>
                <Pressable 
                  style={[styles.optionButtonMini, interest === 'manicure' && styles.optionButtonMiniActive]}
                  onPress={() => setInterest(interest === 'manicure' ? null : 'manicure')}
                >
                  <Text style={[styles.optionButtonMiniText, interest === 'manicure' && styles.optionButtonMiniTextActive]}>Manicure / Nails</Text>
                </Pressable>
              </View>
            </AppCard>
          )}

          {/* Dynamic Content Display */}
          {role === 'owner' ? (
            /* Show Owner Simulator Dashboard */
            <AppCard style={styles.simulatorDashboard} elevated>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.simTitle}>Simulador Financeiro CutSync</Text>
                <Pressable style={styles.backLink} onPress={() => { setStep(1); setRole(null); }}>
                  <ArrowLeft size={13} color={colors.textSecondary} />
                  <Text style={styles.backLinkText}>Voltar</Text>
                </Pressable>
              </View>
              <Text style={styles.simDesc}>Arraste os valores abaixo para ver o ganho mensal e anual estimado do seu negócio.</Text>

              <View style={styles.simSlidersContainer}>
                {/* Professionals */}
                <View style={styles.sliderRow}>
                  <View style={styles.sliderLabelRow}>
                    <Text style={styles.sliderLabel}>Profissionais / Colaboradores</Text>
                    <Text style={styles.sliderValue}>{numBarbers}</Text>
                  </View>
                  <View style={styles.rangeButtons}>
                    {[1, 3, 5, 8, 12].map(n => (
                      <Pressable 
                        key={n} 
                        onPress={() => setNumBarbers(n)}
                        style={[styles.rangeBtn, numBarbers === n && styles.rangeBtnActive]}
                      >
                        <Text style={[styles.rangeBtnLabel, numBarbers === n && styles.rangeBtnLabelActive]}>{n}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* Average price */}
                <View style={styles.sliderRow}>
                  <View style={styles.sliderLabelRow}>
                    <Text style={styles.sliderLabel}>Preço médio por serviço (R$)</Text>
                    <Text style={styles.sliderValue}>R$ {avgPrice}</Text>
                  </View>
                  <View style={styles.rangeButtons}>
                    {[30, 50, 75, 100, 150].map(p => (
                      <Pressable 
                        key={p} 
                        onPress={() => setAvgPrice(p)}
                        style={[styles.rangeBtn, avgPrice === p && styles.rangeBtnActive]}
                      >
                        <Text style={[styles.rangeBtnLabel, avgPrice === p && styles.rangeBtnLabelActive]}>R$ {p}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* Commission */}
                <View style={styles.sliderRow}>
                  <View style={styles.sliderLabelRow}>
                    <Text style={styles.sliderLabel}>Porcentagem da Casa (Salão)</Text>
                    <Text style={styles.sliderValue}>{commissionRate}%</Text>
                  </View>
                  <View style={styles.rangeButtons}>
                    {[30, 40, 50, 60, 70].map(c => (
                      <Pressable 
                        key={c} 
                        onPress={() => setCommissionRate(c)}
                        style={[styles.rangeBtn, commissionRate === c && styles.rangeBtnActive]}
                      >
                        <Text style={[styles.rangeBtnLabel, commissionRate === c && styles.rangeBtnLabelActive]}>{c}%</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* Appointments per month */}
                <View style={styles.sliderRow}>
                  <View style={styles.sliderLabelRow}>
                    <Text style={styles.sliderLabel}>Agendamentos por Profissional/Mês</Text>
                    <Text style={styles.sliderValue}>{appointmentsPerMonth}</Text>
                  </View>
                  <View style={styles.rangeButtons}>
                    {[60, 100, 120, 150, 200].map(a => (
                      <Pressable 
                        key={a} 
                        onPress={() => setAppointmentsPerMonth(a)}
                        style={[styles.rangeBtn, appointmentsPerMonth === a && styles.rangeBtnActive]}
                      >
                        <Text style={[styles.rangeBtnLabel, appointmentsPerMonth === a && styles.rangeBtnLabelActive]}>{a}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>

              {/* Simulated SVG Graph */}
              <View style={styles.chartContainer}>
                <Text style={styles.chartTitle}>Estimativa de Faturamento Mensal</Text>
                <View style={styles.svgWrapper}>
                  <View style={styles.chartBarContainer}>
                    <View style={[styles.chartBar, { height: 90, backgroundColor: colors.brandPrimary }]} />
                    <Text style={styles.chartBarLabel}>Total Geral{'\n'}R$ {totalRevenue}</Text>
                  </View>
                  
                  <View style={styles.chartBarContainer}>
                    <View style={[styles.chartBar, { height: Math.max(20, 90 * (commissionRate / 100)), backgroundColor: '#3F7A4C' }]} />
                    <Text style={styles.chartBarLabel}>Sua Barbearia{'\n'}R$ {ownerShare.toFixed(0)}</Text>
                  </View>

                  <View style={styles.chartBarContainer}>
                    <View style={[styles.chartBar, { height: Math.max(20, 90 * ((100 - commissionRate) / 100)), backgroundColor: '#315C9B' }]} />
                    <Text style={styles.chartBarLabel}>Colaboradores{'\n'}R$ {barbersShare.toFixed(0)}</Text>
                  </View>
                </View>
              </View>

              {/* Key Metrics output grid */}
              <View style={styles.simMetricsGrid}>
                <View style={styles.metricCard}>
                  <Hourglass size={18} color={colors.brandPrimary} />
                  <Text style={styles.metricVal}>{hoursSaved}h</Text>
                  <Text style={styles.metricLbl}>Economizadas/mês</Text>
                </View>

                <View style={styles.metricCard}>
                  <DollarSign size={18} color={colors.brandPrimary} />
                  <Text style={styles.metricVal}>R$ {(ownerShare * 12).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</Text>
                  <Text style={styles.metricLbl}>Receita Anual</Text>
                </View>

                <View style={styles.metricCard}>
                  <Users size={18} color={colors.brandPrimary} />
                  <Text style={styles.metricVal}>{numBarbers}</Text>
                  <Text style={styles.metricLbl}>Agendas Sincronizadas</Text>
                </View>
              </View>

              <AppButton 
                label="Criar minha conta de Dono" 
                onPress={() => router.push('/(auth)/register' as any)} 
                style={styles.donoSignupBtn} 
              />
            </AppCard>
          ) : role === 'visitor' ? (
            /* Show Tour Differentials Card */
            <AppCard style={styles.tourDashboard} elevated>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.simTitle}>Diferenciais CutSync</Text>
                <Pressable style={styles.backLink} onPress={() => { setStep(1); setRole(null); }}>
                  <ArrowLeft size={13} color={colors.textSecondary} />
                  <Text style={styles.backLinkText}>Voltar</Text>
                </Pressable>
              </View>
              <Text style={styles.simDesc}>Conheça as vantagens exclusivas que tornam o CutSync a plataforma preferida dos profissionais modernos.</Text>
              
              <View style={styles.featuresList}>
                <View style={styles.featureRow}>
                  <View style={styles.featureIconContainer}>
                    <Scissors size={18} color={colors.brandPrimary} />
                  </View>
                  <View style={styles.featureCopy}>
                    <Text style={styles.featureTitle}>Atalhos Superhuman</Text>
                    <Text style={styles.featureDesc}>Navegue pelas funções do sistema em milissegundos utilizando apenas o teclado do seu computador.</Text>
                  </View>
                </View>

                <View style={styles.featureRow}>
                  <View style={styles.featureIconContainer}>
                    <DollarSign size={18} color={colors.brandPrimary} />
                  </View>
                  <View style={styles.featureCopy}>
                    <Text style={styles.featureTitle}>Divisão de Comissão Automatizada</Text>
                    <Text style={styles.featureDesc}>O sistema calcula e processa as transferências Pix para comissão do profissional de forma integrada.</Text>
                  </View>
                </View>

                <View style={styles.featureRow}>
                  <View style={styles.featureIconContainer}>
                    <Building2 size={18} color={colors.brandPrimary} />
                  </View>
                  <View style={styles.featureCopy}>
                    <Text style={styles.featureTitle}>Vitrine de Reservas Customizável</Text>
                    <Text style={styles.featureDesc}>Uma página de agendamentos limpa e otimizada para seus clientes realizarem marcações online sem atrito.</Text>
                  </View>
                </View>
              </View>

              <AppButton 
                label="Começar a agendar como Cliente" 
                onPress={() => { setRole('client'); setStep(1); setInterest(null); }}
                style={{ marginTop: 14 }}
              />
            </AppCard>
          ) : (
            /* Default: Vitrine Grid Vivo */
            <View style={styles.shopsSection}>
              <Text style={styles.shopsSectionTitle}>Estabelecimentos em Destaque em Araraquara e Região</Text>
              
              {loadingShops ? (
                <ActivityIndicator color={colors.brandPrimary} style={{ marginVertical: 32 }} />
              ) : filteredShops.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>Nenhum estabelecimento cadastrado ou ativo com os filtros atuais.</Text>
                </View>
              ) : (
                <View style={styles.shopsGrid}>
                  {filteredShops.map((shop) => (
                    <Pressable 
                      key={shop.id} 
                      style={styles.shopGridCard}
                      onPress={() => router.push(`/${shop.slug}/booking` as any)}
                    >
                      <View style={styles.shopCardHeader}>
                        <View style={styles.shopGridLogo}>
                          {shop.logo_url ? (
                            <Image source={{ uri: shop.logo_url }} style={styles.shopLogoImg} contentFit="contain" />
                          ) : (
                            <Text style={styles.shopInitials}>
                              {shop.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                            </Text>
                          )}
                        </View>
                        <View style={styles.shopGridTitleRow}>
                          <Text style={styles.shopGridName} numberOfLines={1}>{shop.name}</Text>
                          <View style={styles.ratingRow}>
                            <Text style={styles.ratingStar}>★</Text>
                            <Text style={styles.ratingVal}>{shop.average_rating ? Number(shop.average_rating).toFixed(1) : 'Novo'}</Text>
                          </View>
                        </View>
                      </View>

                      <Text numberOfLines={2} style={styles.shopGridDesc}>
                        {shop.description || 'Experiência premium de cortes, cuidados capilares e barba com equipe dedicada.'}
                      </Text>

                      <View style={styles.shopCardFooter}>
                        <Text numberOfLines={1} style={styles.shopLocText}>{shop.address || 'Araraquara, SP'}</Text>
                        <AppButton 
                          label="Agendar" 
                          size="sm"
                          style={styles.shopGridBookBtn}
                          onPress={() => router.push(`/${shop.slug}/booking` as any)}
                        />
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}

        </View>
      </ScrollView>

      {/* Superhuman Key Shortcuts bar at bottom */}
      <View style={styles.shortcutFooter}>
        <Text style={styles.shortcutFooterText}>Navegue rápido:</Text>
        <View style={styles.shortcutPillsRow}>
          <View style={styles.shortcutPill}><Text style={styles.shortcutKey}>C</Text><Text style={styles.shortcutLabel}>Cliente</Text></View>
          <View style={styles.shortcutPill}><Text style={styles.shortcutKey}>D</Text><Text style={styles.shortcutLabel}>Proprietário</Text></View>
          <View style={styles.shortcutPill}><Text style={styles.shortcutKey}>P</Text><Text style={styles.shortcutLabel}>Passear</Text></View>
          {step > 1 && (
            <View style={styles.shortcutPill}><Text style={styles.shortcutKey}>Esc</Text><Text style={styles.shortcutLabel}>Voltar</Text></View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: colors.canvas,
    paddingBottom: 48 
  },
  navbar: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 28, 
    paddingVertical: 18, 
    borderBottomWidth: 1, 
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.surface
  },
  logoContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8 
  },
  logoText: { 
    fontSize: 20, 
    color: colors.text, 
    fontFamily: typography.display 
  },
  logoHighlight: { 
    color: colors.brandPrimary 
  },
  navBtn: { 
    minHeight: 38, 
    paddingVertical: 8, 
    paddingHorizontal: 16 
  },
  scroll: { 
    paddingBottom: 80 
  },
  centerLayout: { 
    maxWidth: layout.formMax, 
    alignSelf: 'center', 
    padding: 24, 
    gap: 28, 
    width: '100%' 
  },
  heroTextContainer: { 
    gap: 12, 
    marginTop: 20,
    alignItems: 'center'
  },
  badge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6, 
    backgroundColor: colors.brandSecondarySoft, 
    paddingHorizontal: 12, 
    paddingVertical: 6, 
    borderRadius: radii.pill 
  },
  badgeText: { 
    fontSize: 11, 
    fontFamily: typography.bodyStrong, 
    color: colors.brandPrimary, 
    letterSpacing: 1 
  },
  heroTitle: { 
    fontSize: 38, 
    fontFamily: typography.display, 
    color: colors.text, 
    lineHeight: 44, 
    letterSpacing: -1,
    textAlign: 'center'
  },
  heroHighlight: { 
    color: colors.brandPrimary 
  },
  heroDescription: { 
    fontSize: 14, 
    fontFamily: typography.body, 
    color: colors.textSecondary, 
    lineHeight: 22, 
    textAlign: 'center',
    maxWidth: 580 
  },
  searchBarContainer: {
    width: '100%',
    marginVertical: 4
  },
  searchFieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: 16,
    height: 48,
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
  },
  globalSearchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    fontFamily: typography.body,
    outlineStyle: 'none'
  } as any,
  wizardRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    width: '100%'
  },
  wizardTabCard: {
    flex: 1,
    minWidth: 220,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 16,
    boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
  },
  wizardTabCardActive: {
    borderColor: colors.brandPrimary,
    boxShadow: '0 4px 12px rgba(44,67,52,0.08)'
  },
  keyCap: {
    backgroundColor: colors.canvasSubtle,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center'
  },
  keyCapText: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: colors.textSecondary
  },
  tabCardInfo: {
    flex: 1,
    gap: 2
  },
  tabCardTitle: {
    fontSize: 12,
    fontFamily: typography.bodyStrong,
    color: colors.text
  },
  tabCardSubtitle: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.body
  },
  wizardSubCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    borderRadius: radii.lg,
    gap: 12,
    width: '100%'
  },
  wizardSubHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  wizardLabel: {
    fontSize: 11,
    color: colors.brandPrimary,
    fontFamily: typography.bodyStrong,
    letterSpacing: 1
  },
  wizardTitle: {
    fontSize: 18,
    fontFamily: typography.display,
    color: colors.text
  },
  optionsListHorizontal: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4
  },
  optionButtonMini: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.canvasSoft,
    borderWidth: 1,
    borderColor: colors.border
  },
  optionButtonMiniActive: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary
  },
  optionButtonMiniText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.bodyStrong
  },
  optionButtonMiniTextActive: {
    color: colors.ink
  },
  backLink: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6 
  },
  backLinkText: { 
    fontSize: 12, 
    color: colors.textSecondary, 
    fontFamily: typography.body 
  },
  simulatorDashboard: { 
    width: '100%', 
    backgroundColor: colors.surface, 
    borderWidth: 1, 
    borderColor: colors.border, 
    padding: 24, 
    borderRadius: radii.lg, 
    gap: 18 
  },
  simTitle: { 
    fontSize: 18, 
    fontFamily: typography.display, 
    color: colors.text 
  },
  simDesc: { 
    fontSize: 12, 
    color: colors.textSecondary, 
    lineHeight: 18 
  },
  simSlidersContainer: { 
    gap: 16 
  },
  sliderRow: { 
    gap: 6 
  },
  sliderLabelRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center' 
  },
  sliderLabel: { 
    fontSize: 12, 
    color: colors.textSecondary, 
    fontFamily: typography.bodyStrong 
  },
  sliderValue: { 
    fontSize: 12, 
    color: colors.brandPrimary, 
    fontFamily: typography.bodyStrong 
  },
  rangeButtons: { 
    flexDirection: 'row', 
    gap: 6 
  },
  rangeBtn: { 
    flex: 1, 
    height: 32, 
    borderRadius: radii.sm, 
    backgroundColor: colors.canvasSoft, 
    alignItems: 'center', 
    justifyContent: 'center', 
    borderWidth: 1, 
    borderColor: colors.border 
  },
  rangeBtnActive: { 
    backgroundColor: colors.brandPrimary, 
    borderColor: colors.brandPrimary 
  },
  rangeBtnLabel: { 
    fontSize: 11, 
    color: colors.text, 
    fontFamily: typography.body 
  },
  rangeBtnLabelActive: { 
    color: colors.ink, 
    fontFamily: typography.bodyStrong 
  },
  chartContainer: { 
    marginTop: 8, 
    gap: 8 
  },
  chartTitle: { 
    fontSize: 12, 
    fontFamily: typography.bodyStrong, 
    color: colors.text, 
    textAlign: 'center' 
  },
  svgWrapper: { 
    height: 120, 
    flexDirection: 'row', 
    alignItems: 'flex-end', 
    justifyContent: 'space-around', 
    paddingBottom: 10, 
    borderBottomWidth: 1, 
    borderBottomColor: colors.border 
  },
  chartBarContainer: { 
    flex: 1, 
    alignItems: 'center', 
    gap: 6, 
    height: '100%', 
    justifyContent: 'flex-end' 
  },
  chartBar: { 
    width: 24, 
    borderRadius: radii.sm 
  },
  chartBarLabel: { 
    fontSize: 11, 
    color: colors.textMuted, 
    textAlign: 'center' 
  },
  simMetricsGrid: { 
    flexDirection: 'row', 
    gap: 8, 
    marginTop: 8 
  },
  metricCard: { 
    flex: 1, 
    alignItems: 'center', 
    padding: 12, 
    backgroundColor: colors.canvasSoft, 
    borderRadius: radii.md, 
    borderWidth: 1, 
    borderColor: colors.border, 
    gap: 4 
  },
  metricVal: { 
    fontSize: 13, 
    fontFamily: typography.bodyStrong, 
    color: colors.text 
  },
  metricLbl: { 
    fontSize: 11, 
    color: colors.textMuted, 
    textAlign: 'center' 
  },
  donoSignupBtn: { 
    marginTop: 8 
  },
  tourDashboard: {
    width: '100%', 
    backgroundColor: colors.surface, 
    borderWidth: 1, 
    borderColor: colors.border, 
    padding: 24, 
    borderRadius: radii.lg, 
    gap: 18 
  },
  featuresList: {
    gap: 16,
    marginVertical: 4
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12
  },
  featureIconContainer: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.brandSecondarySoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  featureCopy: {
    flex: 1,
    gap: 2
  },
  featureTitle: {
    fontSize: 13,
    fontFamily: typography.bodyStrong,
    color: colors.text
  },
  featureDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18
  },
  shopsSection: {
    width: '100%',
    gap: 16,
    marginTop: 8
  },
  shopsSectionTitle: {
    fontSize: 14,
    fontFamily: typography.bodyStrong,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8
  },
  shopsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16
  },
  shopGridCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 18,
    gap: 12,
    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
  },
  shopCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  shopGridLogo: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.canvasSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  shopLogoImg: {
    width: '100%',
    height: '100%'
  },
  shopInitials: {
    fontSize: 13,
    fontFamily: typography.bodyStrong,
    color: colors.brandPrimary
  },
  shopGridTitleRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  shopGridName: {
    fontSize: 14,
    fontFamily: typography.bodyStrong,
    color: colors.text,
    flex: 1,
    paddingRight: 8
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3
  },
  ratingStar: {
    color: '#EAB308',
    fontSize: 14
  },
  ratingVal: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: colors.textSecondary
  },
  shopGridDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18
  },
  shopCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: 12,
    marginTop: 2
  },
  shopLocText: {
    fontSize: 11,
    color: colors.textMuted,
    flex: 1,
    paddingRight: 12
  },
  shopGridBookBtn: {
    minHeight: 32,
    paddingVertical: 6,
    paddingHorizontal: 14
  },
  emptyCard: {
    width: '100%',
    padding: 32,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyText: { 
    textAlign: 'center', 
    color: colors.textMuted, 
    fontSize: 12 
  },
  shortcutFooter: { 
    position: 'absolute', 
    bottom: 0, 
    left: 0, 
    right: 0, 
    height: 48, 
    backgroundColor: colors.canvasSoft, 
    borderTopWidth: 1, 
    borderTopColor: colors.borderSubtle, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 16, 
    paddingHorizontal: 20, 
    display: Platform.OS === 'web' ? 'flex' : 'none' 
  },
  shortcutFooterText: { 
    fontSize: 11, 
    color: colors.textMuted, 
    fontFamily: typography.body 
  },
  shortcutPillsRow: { 
    flexDirection: 'row', 
    gap: 10 
  },
  shortcutPill: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6, 
    backgroundColor: colors.surface, 
    paddingHorizontal: 8, 
    paddingVertical: 3, 
    borderRadius: radii.sm, 
    borderWidth: 1, 
    borderColor: colors.border 
  },
  shortcutKey: { 
    fontSize: 11, 
    fontFamily: typography.bodyStrong, 
    color: colors.brandPrimary, 
    backgroundColor: colors.canvasSoft, 
    paddingHorizontal: 4, 
    paddingVertical: 1, 
    borderRadius: 2 
  },
  shortcutLabel: { 
    fontSize: 11, 
    color: colors.textSecondary, 
    fontFamily: typography.body 
  }
});
