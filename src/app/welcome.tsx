import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { AppButton } from '../components/ui/AppButton';
import { AppCard } from '../components/ui/AppCard';
import { colors, radii, typography, layout } from '../theme/tokens';
import { supabase } from '../services/supabase';
import { 
  Building2, 
  Scissors, 
  ArrowLeft, 
  Users, 
  DollarSign, 
  Hourglass,
  Sparkles,
  Search,
  UserRound,
  Calendar,
  TrendingUp,
  Compass,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  ShieldCheck,
  Zap
} from 'lucide-react-native';

export default function WelcomeLandingPage() {
  if (Platform.OS !== 'web') {
    return <WelcomeNativeLandingPage />;
  }

  return <WelcomeWebLandingPage />;
}

/* -------------------------------------------------------------------------- */
/* MOBILE NATIVE LANDING PAGE                                                 */
/* -------------------------------------------------------------------------- */
function WelcomeNativeLandingPage() {
  const router = useRouter();
  const [profileType, setProfileType] = useState<'client' | 'owner'>('client');
  const [slideIndex, setSlideIndex] = useState(0);

  const handleProfileChange = (type: 'client' | 'owner') => {
    setProfileType(type);
    setSlideIndex(0);
  };

  const clientSlides = [
    {
      icon: <Scissors color={colors.brandPrimary} size={28} />,
      badge: 'Sem complicações',
      title: 'Agendamento em segundos',
      description: 'Encontre as melhores barbearias, salões de beleza e manicures da sua região e agende sem precisar fazer ligações.',
    },
    {
      icon: <Calendar color={colors.brandPrimary} size={28} />,
      badge: 'Confirmação instantânea',
      title: 'Escolha profissionais e horários',
      description: 'Veja a grade de horários disponíveis em tempo real, escolha seu profissional de preferência e confirme na hora.',
    },
    {
      icon: <Sparkles color={colors.brandPrimary} size={28} />,
      badge: 'Zero atrasos',
      title: 'Lembretes e histórico completo',
      description: 'Receba notificações dos seus atendimentos e consulte todo o seu histórico de agendamentos com facilidade.',
    },
  ];

  const ownerSlides = [
    {
      icon: <Building2 color={colors.brandPrimary} size={28} />,
      badge: 'Multi-profissional',
      title: 'Gestão completa do salão',
      description: 'Gerencie múltiplos colaboradores, agendas individuais, tabela de serviços e horários de atendimento em um único lugar.',
    },
    {
      icon: <TrendingUp color={colors.brandPrimary} size={28} />,
      badge: 'Pix automático',
      title: 'Repasse de comissões',
      description: 'Automatize a divisão do faturamento da casa. O administrador libera e cada profissional cadastra sua chave Pix para repasse.',
    },
    {
      icon: <Compass color={colors.brandPrimary} size={28} />,
      badge: 'Link exclusivo',
      title: 'Sua vitrine pública de reservas',
      description: 'Divulgue seu link exclusivo no Instagram e WhatsApp para que seus clientes façam marcações automáticas 24 horas por dia.',
    },
  ];

  const activeSlides = profileType === 'client' ? clientSlides : ownerSlides;
  const currentSlide = activeSlides[slideIndex] || activeSlides[0];

  const nextSlide = () => {
    setSlideIndex((prev) => (prev + 1) % activeSlides.length);
  };

  const prevSlide = () => {
    setSlideIndex((prev) => (prev - 1 + activeSlides.length) % activeSlides.length);
  };

  return (
    <View style={nativeStyles.container}>
      {/* Header */}
      <View style={nativeStyles.header}>
        <View style={nativeStyles.logoRow}>
          <Scissors color={colors.brandPrimary} size={20} />
          <Text style={nativeStyles.logoText}>Cut<Text style={nativeStyles.logoHighlight}>Sync</Text></Text>
        </View>
        <AppButton 
          label="Entrar" 
          variant="secondary" 
          size="sm"
          onPress={() => router.push('/(auth)/login' as any)}
        />
      </View>

      <ScrollView contentContainerStyle={nativeStyles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Hero Badge & Title */}
        <View style={nativeStyles.heroBlock}>
          <View style={nativeStyles.heroBadge}>
            <Zap size={12} color={colors.brandPrimary} />
            <Text style={nativeStyles.heroBadgeText}>APP DE AGENDAMENTOS</Text>
          </View>
          <Text style={nativeStyles.heroTitle}>Sua beleza e estilo,{'\n'}na hora certa.</Text>
          <Text style={nativeStyles.heroSubtitle}>Conectamos clientes aos melhores salões e barbearias de Araraquara e região.</Text>
        </View>

        {/* Profile Tabs */}
        <View style={nativeStyles.tabContainer}>
          <Pressable 
            style={[nativeStyles.tabButton, profileType === 'client' && nativeStyles.tabButtonActive]}
            onPress={() => handleProfileChange('client')}
          >
            <UserRound size={16} color={profileType === 'client' ? colors.ink : colors.textSecondary} />
            <Text style={[nativeStyles.tabText, profileType === 'client' && nativeStyles.tabTextActive]}>Sou Cliente</Text>
          </Pressable>

          <Pressable 
            style={[nativeStyles.tabButton, profileType === 'owner' && nativeStyles.tabButtonActive]}
            onPress={() => handleProfileChange('owner')}
          >
            <Building2 size={16} color={profileType === 'owner' ? colors.ink : colors.textSecondary} />
            <Text style={[nativeStyles.tabText, profileType === 'owner' && nativeStyles.tabTextActive]}>Sou Salão / Dono</Text>
          </Pressable>
        </View>

        {/* Interactive Feature Card Carousel */}
        <AppCard style={nativeStyles.carouselCard} elevated>
          <View style={nativeStyles.cardHeaderRow}>
            <View style={nativeStyles.iconCircle}>
              {currentSlide.icon}
            </View>
            <View style={nativeStyles.featureBadge}>
              <Text style={nativeStyles.featureBadgeText}>{currentSlide.badge}</Text>
            </View>
          </View>

          <Text style={nativeStyles.slideTitle}>{currentSlide.title}</Text>
          <Text style={nativeStyles.slideDesc}>{currentSlide.description}</Text>

          {/* Controls: Nav arrows + dots */}
          <View style={nativeStyles.carouselControls}>
            <Pressable onPress={prevSlide} style={nativeStyles.arrowBtn}>
              <ChevronLeft size={18} color={colors.textSecondary} />
            </Pressable>

            <View style={nativeStyles.dotsRow}>
              {activeSlides.map((_, idx) => (
                <Pressable 
                  key={idx} 
                  onPress={() => setSlideIndex(idx)}
                  style={[nativeStyles.dot, slideIndex === idx && nativeStyles.dotActive]} 
                />
              ))}
            </View>

            <Pressable onPress={nextSlide} style={nativeStyles.arrowBtn}>
              <ChevronRight size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
        </AppCard>

        {/* Action CTAs */}
        <View style={nativeStyles.ctaBlock}>
          {profileType === 'client' ? (
            <>
              <AppButton 
                label="Explorar Salões & Agendar"
                icon={<ArrowRight size={18} color={colors.ink} />}
                iconPosition="right"
                fullWidth
                onPress={() => router.push('/(client)' as any)}
              />
              <AppButton 
                label="Já tenho conta / Entrar"
                variant="secondary"
                fullWidth
                onPress={() => router.push('/(auth)/login' as any)}
              />
            </>
          ) : (
            <>
              <AppButton 
                label="Cadastrar Meu Estabelecimento"
                icon={<ArrowRight size={18} color={colors.ink} />}
                iconPosition="right"
                fullWidth
                onPress={() => router.push('/(auth)/register' as any)}
              />
              <AppButton 
                label="Entrar no Painel do Salão"
                variant="secondary"
                fullWidth
                onPress={() => router.push('/(auth)/login' as any)}
              />
            </>
          )}
        </View>

        {/* Footer info */}
        <View style={nativeStyles.footerNote}>
          <ShieldCheck size={14} color={colors.textMuted} />
          <Text style={nativeStyles.footerText}>CutSync • Agendamento universal rápido e seguro.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* WEB LANDING PAGE                                                           */
/* -------------------------------------------------------------------------- */
function WelcomeWebLandingPage() {
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
  const hoursSaved = numBarbers * 15;

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
    <View style={webStyles.container}>
      {/* Top Navbar */}
      <View style={webStyles.navbar}>
        <View style={webStyles.logoContainer}>
          <Scissors color={colors.brandPrimary} size={22} />
          <Text style={webStyles.logoText}>Cut<Text style={webStyles.logoHighlight}>Sync</Text></Text>
        </View>
        <AppButton 
          testID="landing-login-btn" 
          label="Acessar Painel" 
          variant="secondary" 
          style={webStyles.navBtn}
          onPress={() => router.push('/(auth)/login' as any)} 
        />
      </View>

      <ScrollView contentContainerStyle={webStyles.scroll} showsVerticalScrollIndicator={false}>
        <View style={webStyles.centerLayout}>
          
          {/* Centered Hero Header */}
          <View style={webStyles.heroTextContainer}>
            <View style={webStyles.badge}>
              <Sparkles size={12} color={colors.brandPrimary} />
              <Text style={webStyles.badgeText}>SISTEMA DE AGENDAMENTO UNIVERSAL</Text>
            </View>
            <Text style={webStyles.heroTitle}>
              Gestão simplificada.{'\n'}
              <Text style={webStyles.heroHighlight}>Experiência inigualável.</Text>
            </Text>
            <Text style={webStyles.heroDescription}>
              O agendador mais rápido e automatizado do mercado para clientes, profissionais e administradores.
            </Text>
          </View>

          {/* Global Search Bar */}
          <View style={webStyles.searchBarContainer}>
            <View style={webStyles.searchFieldBox}>
              <Search size={18} color={colors.textMuted} />
              <TextInput
                testID="global-search-input"
                style={webStyles.globalSearchInput}
                placeholder="Buscar salão por nome, bairro ou especialidade..."
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
          </View>

          {/* Reorganized Wizard Reativo (Atalhos [C], [D], [P]) */}
          <View style={webStyles.wizardRow}>
            <Pressable 
              style={[webStyles.wizardTabCard, (role === 'client' || !role) && webStyles.wizardTabCardActive]}
              onPress={() => { setRole('client'); setStep(step === 1 ? 2 : step); }}
            >
              <View style={webStyles.keyCap}><Text style={webStyles.keyCapText}>C</Text></View>
              <View style={webStyles.tabCardInfo}>
                <Text style={webStyles.tabCardTitle}>Quero agendar um serviço</Text>
                <Text style={webStyles.tabCardSubtitle}>Ver vitrine de salões</Text>
              </View>
            </Pressable>

            <Pressable 
              style={[webStyles.wizardTabCard, role === 'owner' && webStyles.wizardTabCardActive]}
              onPress={() => { setRole('owner'); setStep(2); }}
            >
              <View style={webStyles.keyCap}><Text style={webStyles.keyCapText}>D</Text></View>
              <View style={webStyles.tabCardInfo}>
                <Text style={webStyles.tabCardTitle}>Sou proprietário / profissional</Text>
                <Text style={webStyles.tabCardSubtitle}>Onboarding e simulador B2B</Text>
              </View>
            </Pressable>

            <Pressable 
              style={[webStyles.wizardTabCard, role === 'visitor' && webStyles.wizardTabCardActive]}
              onPress={() => { setRole('visitor'); setStep(2); }}
            >
              <View style={webStyles.keyCap}><Text style={webStyles.keyCapText}>P</Text></View>
              <View style={webStyles.tabCardInfo}>
                <Text style={webStyles.tabCardTitle}>Apenas explorando</Text>
                <Text style={webStyles.tabCardSubtitle}>Tour rápido pelos recursos</Text>
              </View>
            </Pressable>
          </View>

          {/* Render step 2 details inline if selected */}
          {step === 2 && (role === 'client' || !role) && (
            <AppCard style={webStyles.wizardSubCard} elevated>
              <View style={webStyles.wizardSubHeader}>
                <Pressable style={webStyles.backLink} onPress={() => { setStep(1); setRole(null); setInterest(null); }}>
                  <ArrowLeft size={13} color={colors.textSecondary} />
                  <Text style={webStyles.backLinkText}>Limpar filtros</Text>
                </Pressable>
                <Text style={webStyles.wizardLabel}>FILTRO DE CATEGORIA</Text>
              </View>
              <View style={webStyles.optionsListHorizontal}>
                <Pressable 
                  style={[webStyles.optionButtonMini, interest === 'barbearia' && webStyles.optionButtonMiniActive]}
                  onPress={() => setInterest(interest === 'barbearia' ? null : 'barbearia')}
                >
                  <Text style={[webStyles.optionButtonMiniText, interest === 'barbearia' && webStyles.optionButtonMiniTextActive]}>Barbearia</Text>
                </Pressable>
                <Pressable 
                  style={[webStyles.optionButtonMini, interest === 'salao' && webStyles.optionButtonMiniActive]}
                  onPress={() => setInterest(interest === 'salao' ? null : 'salao')}
                >
                  <Text style={[webStyles.optionButtonMiniText, interest === 'salao' && webStyles.optionButtonMiniTextActive]}>Salão de Beleza</Text>
                </Pressable>
                <Pressable 
                  style={[webStyles.optionButtonMini, interest === 'manicure' && webStyles.optionButtonMiniActive]}
                  onPress={() => setInterest(interest === 'manicure' ? null : 'manicure')}
                >
                  <Text style={[webStyles.optionButtonMiniText, interest === 'manicure' && webStyles.optionButtonMiniTextActive]}>Manicure / Nails</Text>
                </Pressable>
              </View>
            </AppCard>
          )}

          {/* Dynamic Content Display */}
          {role === 'owner' ? (
            <AppCard style={webStyles.simulatorDashboard} elevated>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={webStyles.simTitle}>Simulador Financeiro CutSync</Text>
                <Pressable style={webStyles.backLink} onPress={() => { setStep(1); setRole(null); }}>
                  <ArrowLeft size={13} color={colors.textSecondary} />
                  <Text style={webStyles.backLinkText}>Voltar</Text>
                </Pressable>
              </View>
              <Text style={webStyles.simDesc}>Arraste os valores abaixo para ver o ganho mensal e anual estimado do seu negócio.</Text>

              <View style={webStyles.simSlidersContainer}>
                <View style={webStyles.sliderRow}>
                  <View style={webStyles.sliderLabelRow}>
                    <Text style={webStyles.sliderLabel}>Profissionais / Colaboradores</Text>
                    <Text style={webStyles.sliderValue}>{numBarbers}</Text>
                  </View>
                  <View style={webStyles.rangeButtons}>
                    {[1, 3, 5, 8, 12].map(n => (
                      <Pressable 
                        key={n} 
                        onPress={() => setNumBarbers(n)}
                        style={[webStyles.rangeBtn, numBarbers === n && webStyles.rangeBtnActive]}
                      >
                        <Text style={[webStyles.rangeBtnLabel, numBarbers === n && webStyles.rangeBtnLabelActive]}>{n}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={webStyles.sliderRow}>
                  <View style={webStyles.sliderLabelRow}>
                    <Text style={webStyles.sliderLabel}>Preço médio por serviço (R$)</Text>
                    <Text style={webStyles.sliderValue}>R$ {avgPrice}</Text>
                  </View>
                  <View style={webStyles.rangeButtons}>
                    {[30, 50, 75, 100, 150].map(p => (
                      <Pressable 
                        key={p} 
                        onPress={() => setAvgPrice(p)}
                        style={[webStyles.rangeBtn, avgPrice === p && webStyles.rangeBtnActive]}
                      >
                        <Text style={[webStyles.rangeBtnLabel, avgPrice === p && webStyles.rangeBtnLabelActive]}>R$ {p}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={webStyles.sliderRow}>
                  <View style={webStyles.sliderLabelRow}>
                    <Text style={webStyles.sliderLabel}>Porcentagem da Casa (Salão)</Text>
                    <Text style={webStyles.sliderValue}>{commissionRate}%</Text>
                  </View>
                  <View style={webStyles.rangeButtons}>
                    {[30, 40, 50, 60, 70].map(c => (
                      <Pressable 
                        key={c} 
                        onPress={() => setCommissionRate(c)}
                        style={[webStyles.rangeBtn, commissionRate === c && webStyles.rangeBtnActive]}
                      >
                        <Text style={[webStyles.rangeBtnLabel, commissionRate === c && webStyles.rangeBtnLabelActive]}>{c}%</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={webStyles.sliderRow}>
                  <View style={webStyles.sliderLabelRow}>
                    <Text style={webStyles.sliderLabel}>Agendamentos por Profissional/Mês</Text>
                    <Text style={webStyles.sliderValue}>{appointmentsPerMonth}</Text>
                  </View>
                  <View style={webStyles.rangeButtons}>
                    {[60, 100, 120, 150, 200].map(a => (
                      <Pressable 
                        key={a} 
                        onPress={() => setAppointmentsPerMonth(a)}
                        style={[webStyles.rangeBtn, appointmentsPerMonth === a && webStyles.rangeBtnActive]}
                      >
                        <Text style={[webStyles.rangeBtnLabel, appointmentsPerMonth === a && webStyles.rangeBtnLabelActive]}>{a}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>

              <View style={webStyles.chartContainer}>
                <Text style={webStyles.chartTitle}>Estimativa de Faturamento Mensal</Text>
                <View style={webStyles.svgWrapper}>
                  <View style={webStyles.chartBarContainer}>
                    <View style={[webStyles.chartBar, { height: 90, backgroundColor: colors.brandPrimary }]} />
                    <Text style={webStyles.chartBarLabel}>Total Geral{'\n'}R$ {totalRevenue}</Text>
                  </View>
                  
                  <View style={webStyles.chartBarContainer}>
                    <View style={[webStyles.chartBar, { height: Math.max(20, 90 * (commissionRate / 100)), backgroundColor: '#3F7A4C' }]} />
                    <Text style={webStyles.chartBarLabel}>Sua Barbearia{'\n'}R$ {ownerShare.toFixed(0)}</Text>
                  </View>

                  <View style={webStyles.chartBarContainer}>
                    <View style={[webStyles.chartBar, { height: Math.max(20, 90 * ((100 - commissionRate) / 100)), backgroundColor: '#315C9B' }]} />
                    <Text style={webStyles.chartBarLabel}>Colaboradores{'\n'}R$ {barbersShare.toFixed(0)}</Text>
                  </View>
                </View>
              </View>

              <View style={webStyles.simMetricsGrid}>
                <View style={webStyles.metricCard}>
                  <Hourglass size={18} color={colors.brandPrimary} />
                  <Text style={webStyles.metricVal}>{hoursSaved}h</Text>
                  <Text style={webStyles.metricLbl}>Economizadas/mês</Text>
                </View>

                <View style={webStyles.metricCard}>
                  <DollarSign size={18} color={colors.brandPrimary} />
                  <Text style={webStyles.metricVal}>R$ {(ownerShare * 12).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</Text>
                  <Text style={webStyles.metricLbl}>Receita Anual</Text>
                </View>

                <View style={webStyles.metricCard}>
                  <Users size={18} color={colors.brandPrimary} />
                  <Text style={webStyles.metricVal}>{numBarbers}</Text>
                  <Text style={webStyles.metricLbl}>Agendas Sincronizadas</Text>
                </View>
              </View>

              <AppButton 
                label="Criar minha conta de Dono" 
                onPress={() => router.push('/(auth)/register' as any)} 
                style={webStyles.donoSignupBtn} 
              />
            </AppCard>
          ) : role === 'visitor' ? (
            <AppCard style={webStyles.tourDashboard} elevated>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={webStyles.simTitle}>Diferenciais CutSync</Text>
                <Pressable style={webStyles.backLink} onPress={() => { setStep(1); setRole(null); }}>
                  <ArrowLeft size={13} color={colors.textSecondary} />
                  <Text style={webStyles.backLinkText}>Voltar</Text>
                </Pressable>
              </View>
              <Text style={webStyles.simDesc}>Conheça as vantagens exclusivas que tornam o CutSync a plataforma preferida dos profissionais modernos.</Text>
              
              <View style={webStyles.featuresList}>
                <View style={webStyles.featureRow}>
                  <View style={webStyles.featureIconContainer}>
                    <Scissors size={18} color={colors.brandPrimary} />
                  </View>
                  <View style={webStyles.featureCopy}>
                    <Text style={webStyles.featureTitle}>Atalhos Superhuman</Text>
                    <Text style={webStyles.featureDesc}>Navegue pelas funções do sistema em milissegundos utilizando apenas o teclado do seu computador.</Text>
                  </View>
                </View>

                <View style={webStyles.featureRow}>
                  <View style={webStyles.featureIconContainer}>
                    <DollarSign size={18} color={colors.brandPrimary} />
                  </View>
                  <View style={webStyles.featureCopy}>
                    <Text style={webStyles.featureTitle}>Divisão de Comissão Automatizada</Text>
                    <Text style={webStyles.featureDesc}>O sistema calcula e processa as transferências Pix para comissão do profissional de forma integrada.</Text>
                  </View>
                </View>

                <View style={webStyles.featureRow}>
                  <View style={webStyles.featureIconContainer}>
                    <Building2 size={18} color={colors.brandPrimary} />
                  </View>
                  <View style={webStyles.featureCopy}>
                    <Text style={webStyles.featureTitle}>Vitrine de Reservas Customizável</Text>
                    <Text style={webStyles.featureDesc}>Uma página de agendamentos limpa e otimizada para seus clientes realizarem marcações online sem atrito.</Text>
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
            <View style={webStyles.shopsSection}>
              <Text style={webStyles.shopsSectionTitle}>Estabelecimentos em Destaque em Araraquara e Região</Text>
              
              {loadingShops ? (
                <ActivityIndicator color={colors.brandPrimary} style={{ marginVertical: 32 }} />
              ) : filteredShops.length === 0 ? (
                <View style={webStyles.emptyCard}>
                  <Text style={webStyles.emptyText}>Nenhum estabelecimento cadastrado ou ativo com os filtros atuais.</Text>
                </View>
              ) : (
                <View style={webStyles.shopsGrid}>
                  {filteredShops.map((shop) => (
                    <Pressable 
                      key={shop.id} 
                      style={webStyles.shopGridCard}
                      onPress={() => router.push(`/${shop.slug}/booking` as any)}
                    >
                      <View style={webStyles.shopCardHeader}>
                        <View style={webStyles.shopGridLogo}>
                          {shop.logo_url ? (
                            <Image source={{ uri: shop.logo_url }} style={webStyles.shopLogoImg} contentFit="contain" />
                          ) : (
                            <Text style={webStyles.shopInitials}>
                              {shop.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                            </Text>
                          )}
                        </View>
                        <View style={webStyles.shopGridTitleRow}>
                          <Text style={webStyles.shopGridName} numberOfLines={1}>{shop.name}</Text>
                          <View style={webStyles.ratingRow}>
                            <Text style={webStyles.ratingStar}>★</Text>
                            <Text style={webStyles.ratingVal}>{shop.average_rating ? Number(shop.average_rating).toFixed(1) : 'Novo'}</Text>
                          </View>
                        </View>
                      </View>

                      <Text numberOfLines={2} style={webStyles.shopGridDesc}>
                        {shop.description || 'Experiência premium de cortes, cuidados capilares e barba com equipe dedicada.'}
                      </Text>

                      <View style={webStyles.shopCardFooter}>
                        <Text numberOfLines={1} style={webStyles.shopLocText}>{shop.address || 'Araraquara, SP'}</Text>
                        <AppButton 
                          label="Agendar" 
                          size="sm"
                          style={webStyles.shopGridBookBtn}
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
      <View style={webStyles.shortcutFooter}>
        <Text style={webStyles.shortcutFooterText}>Navegue rápido:</Text>
        <View style={webStyles.shortcutPillsRow}>
          <View style={webStyles.shortcutPill}><Text style={webStyles.shortcutKey}>C</Text><Text style={webStyles.shortcutLabel}>Cliente</Text></View>
          <View style={webStyles.shortcutPill}><Text style={webStyles.shortcutKey}>D</Text><Text style={webStyles.shortcutLabel}>Proprietário</Text></View>
          <View style={webStyles.shortcutPill}><Text style={webStyles.shortcutKey}>P</Text><Text style={webStyles.shortcutLabel}>Passear</Text></View>
          {step > 1 && (
            <View style={webStyles.shortcutPill}><Text style={webStyles.shortcutKey}>Esc</Text><Text style={webStyles.shortcutLabel}>Voltar</Text></View>
          )}
        </View>
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* STYLES                                                                     */
/* -------------------------------------------------------------------------- */
const nativeStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoText: {
    fontSize: 18,
    fontFamily: typography.display,
    color: colors.text,
  },
  logoHighlight: {
    color: colors.brandPrimary,
  },
  scrollContent: {
    padding: 20,
    gap: 20,
    paddingBottom: 40,
  },
  heroBlock: {
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.brandSecondarySoft,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  heroBadgeText: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: colors.brandPrimary,
    letterSpacing: 0.8,
  },
  heroTitle: {
    fontSize: 26,
    fontFamily: typography.display,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 32,
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 13,
    fontFamily: typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 10,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surfacePressed,
    borderRadius: radii.pill,
    padding: 4,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: radii.pill,
  },
  tabButtonActive: {
    backgroundColor: colors.brandPrimary,
  },
  tabText: {
    fontSize: 12,
    fontFamily: typography.bodyStrong,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.ink,
  },
  carouselCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 20,
    gap: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.brandSecondarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureBadge: {
    backgroundColor: colors.canvasSoft,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  featureBadgeText: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: colors.brandPrimary,
  },
  slideTitle: {
    fontSize: 18,
    fontFamily: typography.display,
    color: colors.text,
    marginTop: 4,
  },
  slideDesc: {
    fontSize: 13,
    fontFamily: typography.body,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  carouselControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  arrowBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.canvasSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.borderStrong,
  },
  dotActive: {
    width: 20,
    backgroundColor: colors.brandPrimary,
  },
  ctaBlock: {
    gap: 10,
    marginTop: 4,
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  footerText: {
    fontSize: 11,
    fontFamily: typography.body,
    color: colors.textMuted,
  },
});

const webStyles = StyleSheet.create({
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
