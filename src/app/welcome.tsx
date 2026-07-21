import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../services/supabase';
import { AppButton } from '../components/ui/AppButton';
import { AppCard } from '../components/ui/AppCard';
import { AppInput } from '../components/ui/AppInput';
import { colors, radii, typography, elevations } from '../theme/tokens';
import { 
  Building2, 
  Scissors, 
  UserRound, 
  Compass, 
  ChevronRight, 
  Check, 
  Search, 
  MapPin, 
  ArrowLeft, 
  Users, 
  DollarSign, 
  Hourglass,
  ArrowRight,
  Sparkles
} from 'lucide-react-native';

interface LocalShop {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  bannerUrl: string | null;
  logoUrl: string | null;
  description: string | null;
  primaryColor: string | null;
}

export default function WelcomeLandingPage() {
  const router = useRouter();

  // Wizard flow states
  // step 1: Role Selection (Client, Owner, Explorer)
  // step 2: Sub-choice (Barber, Hair, Nail) for client
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<'client' | 'owner' | 'visitor' | null>(null);
  const [interest, setInterest] = useState<string | null>(null);

  // Data states
  const [shops, setShops] = useState<LocalShop[]>([]);
  const [loadingShops, setLoadingShops] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Simulated Vitrine Flow
  const [selectedShop, setSelectedShop] = useState<LocalShop | null>(null);
  const [selectedService, setSelectedService] = useState<{ id: string; name: string; price: number } | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);

  // Financial Simulator states
  const [numBarbers, setNumBarbers] = useState(3);
  const [avgPrice, setAvgPrice] = useState(50);
  const [commissionRate, setCommissionRate] = useState(40);
  const [appointmentsPerMonth, setAppointmentsPerMonth] = useState(120);

  // Fetch shops
  useEffect(() => {
    const fetchShops = async () => {
      try {
        const { data, error } = await supabase
          .from('establishments')
          .select('id, name, slug, address, phone, banner_url, logo_url, description, primary_color')
          .eq('account_status', 'active')
          .limit(10);
        
        if (error) throw error;
        
        const mapped: LocalShop[] = (data || []).map(row => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          address: row.address,
          phone: row.phone,
          bannerUrl: row.banner_url,
          logoUrl: row.logo_url,
          description: row.description,
          primaryColor: row.primary_color
        }));
        setShops(mapped);
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
          setSelectedShop(null);
          setSelectedService(null);
          setSelectedTime(null);
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

  const getCategoryFilteredShops = () => {
    let list = shops;
    if (searchTerm.trim()) {
      list = list.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    return list;
  };

  const resetSimulatedBooking = () => {
    setSelectedShop(null);
    setSelectedService(null);
    setSelectedTime(null);
    setShowCheckoutModal(false);
  };

  return (
    <View style={styles.container}>
      {/* Top Navbar */}
      <View style={styles.navbar}>
        <View style={styles.logoContainer}>
          <Scissors color={colors.brandSecondary} size={22} />
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
        <View style={styles.splitLayout}>
          
          {/* Left Column: Título Hero + Typeform Wizard */}
          <View style={styles.leftCol}>
            <View style={styles.heroTextContainer}>
              <View style={styles.badge}>
                <Sparkles size={12} color={colors.brandSecondary} />
                <Text style={styles.badgeText}>SISTEMA DE AGENDAMENTO UNIVERSAL</Text>
              </View>
              <Text style={styles.heroTitle}>
                Gestão simplificada.{'\n'}
                <Text style={styles.heroHighlight}>Experiência inigualável.</Text>
              </Text>
              <Text style={styles.heroDescription}>
                O agendador mais rápido e automatizado do mercado para clientes, profissionais e administradores. Inspirado em performance de elite.
              </Text>
            </View>

            {/* Typeform Reactive Wizard Card */}
            <AppCard style={styles.wizardCard} elevated>
              {step === 1 && (
                <View style={styles.wizardContent}>
                  <Text style={styles.wizardLabel}>ETAPA 1 DE 2</Text>
                  <Text style={styles.wizardTitle}>O que te traz ao CutSync hoje?</Text>
                  
                  <View style={styles.optionsList}>
                    <Pressable 
                      style={styles.optionButton}
                      onPress={() => { setRole('client'); setStep(2); }}
                    >
                      <View style={styles.optionIconBox}>
                        <UserRound size={18} color={colors.brandSecondary} />
                      </View>
                      <View style={styles.optionTextContainer}>
                        <Text style={styles.optionTitle}>Quero agendar serviços</Text>
                        <Text style={styles.optionDesc}>Buscar profissionais, ver portfólio e reservar horários.</Text>
                      </View>
                      <View style={styles.keyboardIndicator}>
                        <Text style={styles.keyboardText}>C</Text>
                      </View>
                    </Pressable>

                    <Pressable 
                      style={styles.optionButton}
                      onPress={() => { setRole('owner'); setStep(2); }}
                    >
                      <View style={styles.optionIconBox}>
                        <Building2 size={18} color={colors.brandSecondary} />
                      </View>
                      <View style={styles.optionTextContainer}>
                        <Text style={styles.optionTitle}>Sou proprietário de estabelecimento</Text>
                        <Text style={styles.optionDesc}>Gerenciar equipe, configurar comissões automáticas e agenda.</Text>
                      </View>
                      <View style={styles.keyboardIndicator}>
                        <Text style={styles.keyboardText}>D</Text>
                      </View>
                    </Pressable>

                    <Pressable 
                      style={styles.optionButton}
                      onPress={() => { setRole('visitor'); setStep(2); }}
                    >
                      <View style={styles.optionIconBox}>
                        <Compass size={18} color={colors.brandSecondary} />
                      </View>
                      <View style={styles.optionTextContainer}>
                        <Text style={styles.optionTitle}>Estou apenas passeando</Text>
                        <Text style={styles.optionDesc}>Explorar as telas e entender como o sistema funciona.</Text>
                      </View>
                      <View style={styles.keyboardIndicator}>
                        <Text style={styles.keyboardText}>P</Text>
                      </View>
                    </Pressable>
                  </View>
                </View>
              )}

              {step === 2 && (
                <View style={styles.wizardContent}>
                  <Pressable style={styles.backLink} onPress={() => { setStep(1); setRole(null); resetSimulatedBooking(); }}>
                    <ArrowLeft size={14} color={colors.textSecondary} />
                    <Text style={styles.backLinkText}>Voltar à pergunta anterior</Text>
                  </Pressable>

                  <Text style={styles.wizardLabel}>ETAPA 2 DE 2</Text>

                  {role === 'client' && (
                    <>
                      <Text style={styles.wizardTitle}>Qual tipo de serviço você busca?</Text>
                      
                      <View style={styles.optionsList}>
                        <Pressable 
                          style={[styles.optionButton, interest === 'barbearia' && styles.optionButtonActive]}
                          onPress={() => setInterest('barbearia')}
                        >
                          <Text style={styles.optionNumberText}>1</Text>
                          <Text style={styles.optionTitleSlim}>Barbearias clássicas e modernas</Text>
                        </Pressable>

                        <Pressable 
                          style={[styles.optionButton, interest === 'salao' && styles.optionButtonActive]}
                          onPress={() => setInterest('salao')}
                        >
                          <Text style={styles.optionNumberText}>2</Text>
                          <Text style={styles.optionTitleSlim}>Salão de Beleza e estética unissex</Text>
                        </Pressable>

                        <Pressable 
                          style={[styles.optionButton, interest === 'manicure' && styles.optionButtonActive]}
                          onPress={() => setInterest('manicure')}
                        >
                          <Text style={styles.optionNumberText}>3</Text>
                          <Text style={styles.optionTitleSlim}>Manicure, Pedicure e Unhas especiais</Text>
                        </Pressable>
                      </View>

                      <AppButton 
                        label="Explorar no simulador" 
                        icon={<ArrowRight size={16} color={colors.ink} />}
                        iconPosition="right"
                        style={styles.wizardActionBtn}
                        onPress={() => {}}
                      />
                    </>
                  )}

                  {role === 'owner' && (
                    <View style={styles.donoIntroContainer}>
                      <Text style={styles.wizardTitle}>Potencialize sua barbearia</Text>
                      <Text style={styles.donoIntroDesc}>
                        Esqueça anotações manuais ou planilhas confusas. O CutSync automatiza o repasse de comissões, gerencia múltiplas agendas e disponibiliza um link público próprio para reservas.
                      </Text>

                      <View style={styles.featuresBadgeGrid}>
                        <View style={styles.featureItem}><Check size={14} color={colors.success} /><Text style={styles.featureItemText}>Comissões e Pix automáticos</Text></View>
                        <View style={styles.featureItem}><Check size={14} color={colors.success} /><Text style={styles.featureItemText}>Multi-profissional integrado</Text></View>
                        <View style={styles.featureItem}><Check size={14} color={colors.success} /><Text style={styles.featureItemText}>Onboarding do colaborador</Text></View>
                      </View>

                      <AppButton 
                        label="Criar minha conta de Dono" 
                        onPress={() => router.push('/(auth)/register' as any)} 
                        style={styles.donoSignupBtn} 
                      />
                    </View>
                  )}

                  {role === 'visitor' && (
                    <View style={styles.donoIntroContainer}>
                      <Text style={styles.wizardTitle}>Navegue livremente</Text>
                      <Text style={styles.donoIntroDesc}>
                        Sinta-se à vontade para navegar pelos estabelecimentos à direita, testar a marcação de horários simulada e ver como é fácil agendar no CutSync.
                      </Text>

                      <AppButton 
                        label="Ir para Cadastro Oficial" 
                        variant="secondary"
                        onPress={() => router.push('/(auth)/register' as any)} 
                        style={styles.donoSignupBtn} 
                      />
                    </View>
                  )}
                </View>
              )}
            </AppCard>
          </View>

          {/* Right Column: Simulated Smartphone Frame or Financial Dashboard */}
          <View style={styles.rightCol}>
            
            {/* Show Smartphone Client booking simulator if client or visitor active */}
            {(role === 'client' || role === 'visitor' || !role) && (
              <View style={styles.phoneMockContainer}>
                <View style={styles.phoneHeader}>
                  <View style={styles.phoneCamera} />
                  <Text style={styles.phoneTitle}>Simulador CutSync App</Text>
                </View>

                <View style={styles.phoneScreen}>
                  {!selectedShop ? (
                    <>
                      {/* Search and Listing view */}
                      <View style={styles.phoneSearchBar}>
                        <Search size={14} color={colors.textMuted} />
                        <AppInput 
                          containerStyle={styles.searchField}
                          inputStyle={styles.searchInputText}
                          placeholder="Buscar barbearias..."
                          value={searchTerm}
                          onChangeText={setSearchTerm}
                        />
                      </View>

                      <ScrollView style={styles.phoneScrollList} showsVerticalScrollIndicator={false}>
                        <Text style={styles.phoneSectionTitle}>Estabelecimentos Próximos</Text>
                        
                        {loadingShops ? (
                          <ActivityIndicator color={colors.brandSecondary} style={{ marginTop: 24 }} />
                        ) : getCategoryFilteredShops().length === 0 ? (
                          <Text style={styles.emptyText}>Nenhuma barbearia ativa encontrada.</Text>
                        ) : (
                          getCategoryFilteredShops().map((shop) => (
                            <Pressable 
                              key={shop.id} 
                              style={styles.shopCard}
                              onPress={() => setSelectedShop(shop)}
                            >
                              <View style={styles.shopImageFallback}>
                                <Building2 size={24} color={colors.brandSecondary} />
                              </View>
                              <View style={styles.shopCardInfo}>
                                <Text style={styles.shopCardName}>{shop.name}</Text>
                                <View style={styles.shopLocRow}>
                                  <MapPin size={11} color={colors.textMuted} />
                                  <Text numberOfLines={1} style={styles.shopCardLoc}>{shop.address || 'Araraquara, SP'}</Text>
                                </View>
                              </View>
                              <ChevronRight size={16} color={colors.textMuted} />
                            </Pressable>
                          ))
                        )}
                      </ScrollView>
                    </>
                  ) : (
                    /* Shop Vitrine & Booking flow inside phone mock */
                    <View style={styles.vitrineContainer}>
                      <Pressable style={styles.backToShops} onPress={resetSimulatedBooking}>
                        <ArrowLeft size={13} color={colors.brandSecondary} />
                        <Text style={styles.backToShopsText}>Voltar às barbearias</Text>
                      </Pressable>

                      <Text style={styles.vitrineName}>{selectedShop.name}</Text>
                      <Text style={styles.vitrineDesc}>{selectedShop.description || 'Barba clássica, navalha, degradê, e ambiente confortável com profissionais dedicados.'}</Text>

                      <ScrollView style={styles.servicesList} showsVerticalScrollIndicator={false}>
                        <Text style={styles.vitrineSectionTitle}>Serviços Disponíveis</Text>
                        
                        {[
                          { id: '1', name: 'Corte Degradê Moderno', price: 45.00 },
                          { id: '2', name: 'Barba Terapia Completa', price: 35.00 },
                          { id: '3', name: 'Combo: Corte + Barba', price: 70.00 }
                        ].map((service) => (
                          <View key={service.id} style={styles.serviceRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.serviceName}>{service.name}</Text>
                              <Text style={styles.servicePrice}>R$ {service.price.toFixed(2)}</Text>
                            </View>
                            
                            {selectedService?.id === service.id ? (
                              <View style={styles.serviceSelectedCheck}>
                                <Check size={14} color={colors.success} />
                              </View>
                            ) : (
                              <Pressable 
                                style={styles.serviceSelectBtn}
                                onPress={() => { setSelectedService(service); setSelectedTime(null); }}
                              >
                                <Text style={styles.serviceSelectBtnText}>Escolher</Text>
                              </Pressable>
                            )}
                          </View>
                        ))}

                        {selectedService && (
                          <View style={{ marginTop: 14 }}>
                            <Text style={styles.vitrineSectionTitle}>Horários Disponíveis</Text>
                            <View style={styles.timesGrid}>
                              {['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'].map((time) => (
                                <Pressable 
                                  key={time} 
                                  style={[styles.timeChip, selectedTime === time && styles.timeChipActive]}
                                  onPress={() => setSelectedTime(time)}
                                >
                                  <Text style={[styles.timeChipText, selectedTime === time && styles.timeChipTextActive]}>{time}</Text>
                                </Pressable>
                              ))}
                            </View>
                          </View>
                        )}
                      </ScrollView>

                      {selectedService && selectedTime && (
                        <Pressable 
                          style={styles.bookConfirmBtn}
                          onPress={() => setShowCheckoutModal(true)}
                        >
                          <Text style={styles.bookConfirmBtnText}>Confirmar para {selectedTime}</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>

                {/* Overlaid minimal login check (Superhuman style modal) inside mock phone */}
                {showCheckoutModal && (
                  <View style={styles.checkoutOverlay}>
                    <View style={styles.superhumanCard}>
                      <Text style={styles.shModalTitle}>Finalizar Agendamento</Text>
                      <Text style={styles.shModalDesc}>
                        Você escolheu **{selectedService?.name}** às **{selectedTime}** em **{selectedShop?.name}**.
                        Inscreva-se ou faça login para confirmar.
                      </Text>

                      <View style={{ gap: 8, width: '100%', marginTop: 12 }}>
                        <AppButton 
                          label="Criar minha conta de Cliente" 
                          onPress={() => router.push('/(auth)/register' as any)} 
                          fullWidth 
                        />
                        <AppButton 
                          label="Fazer Login" 
                          variant="secondary"
                          onPress={() => router.push('/(auth)/login' as any)} 
                          fullWidth 
                        />
                        <Pressable 
                          style={styles.shCancelBtn}
                          onPress={() => setShowCheckoutModal(false)}
                        >
                          <Text style={styles.shCancelText}>Cancelar e voltar</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Show Owner Simulator Dashboard if owner active */}
            {role === 'owner' && (
              <AppCard style={styles.simulatorDashboard} elevated>
                <Text style={styles.simTitle}>Simulador Financeiro CutSync</Text>
                <Text style={styles.simDesc}>Arraste os valores abaixo para ver o ganho mensal e anual estimado do seu negócio.</Text>

                <View style={styles.simSlidersContainer}>
                  {/* Slider 1: Professionals */}
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

                  {/* Slider 2: Average price */}
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

                  {/* Slider 3: Commission */}
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

                  {/* Slider 4: Appointments per month */}
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

                {/* Simulated SVG Graph rendering dynamic columns */}
                <View style={styles.chartContainer}>
                  <Text style={styles.chartTitle}>Estimativa de Faturamento Mensal</Text>
                  
                  {/* Dynamic SVG graphic */}
                  <View style={styles.svgWrapper}>
                    <View style={styles.chartBarContainer}>
                      <View style={[styles.chartBar, { height: '100%', backgroundColor: colors.brand }]} />
                      <Text style={styles.chartBarLabel}>Total Geral{'\n'}R$ {totalRevenue}</Text>
                    </View>
                    
                    <View style={styles.chartBarContainer}>
                      <View style={[styles.chartBar, { height: `${commissionRate}%`, backgroundColor: '#34A853' }]} />
                      <Text style={styles.chartBarLabel}>Sua Barbearia{'\n'}R$ {ownerShare.toFixed(0)}</Text>
                    </View>

                    <View style={styles.chartBarContainer}>
                      <View style={[styles.chartBar, { height: `${100 - commissionRate}%`, backgroundColor: '#4285F4' }]} />
                      <Text style={styles.chartBarLabel}>Colaboradores{'\n'}R$ {barbersShare.toFixed(0)}</Text>
                    </View>
                  </View>
                </View>

                {/* Key Metrics output grid */}
                <View style={styles.simMetricsGrid}>
                  <View style={styles.metricCard}>
                    <Hourglass size={18} color={colors.brandSecondary} />
                    <Text style={styles.metricVal}>{hoursSaved}h</Text>
                    <Text style={styles.metricLbl}>Economizadas/mês</Text>
                  </View>

                  <View style={styles.metricCard}>
                    <DollarSign size={18} color={colors.brandSecondary} />
                    <Text style={styles.metricVal}>R$ {(ownerShare * 12).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</Text>
                    <Text style={styles.metricLbl}>Receita Anual da Casa</Text>
                  </View>

                  <View style={styles.metricCard}>
                    <Users size={18} color={colors.brandSecondary} />
                    <Text style={styles.metricVal}>{numBarbers}</Text>
                    <Text style={styles.metricLbl}>Agendas Sincronizadas</Text>
                  </View>
                </View>
              </AppCard>
            )}

          </View>
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
    backgroundColor: '#0F1210', // Extremely sleek dark green-charcoal canvas
    paddingBottom: 48 
  },
  navbar: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 28, 
    paddingVertical: 18, 
    borderBottomWidth: 1, 
    borderBottomColor: '#1A211D'
  },
  logoContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8 
  },
  logoText: { 
    fontSize: 20, 
    color: '#FFFFFF', 
    fontFamily: typography.display 
  },
  logoHighlight: { 
    color: colors.brandSecondary 
  },
  navBtn: { 
    minHeight: 38, 
    paddingVertical: 8, 
    paddingHorizontal: 16 
  },
  scroll: { 
    paddingBottom: 80 
  },
  splitLayout: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    maxWidth: 1200, 
    alignSelf: 'center', 
    padding: 24, 
    gap: 32, 
    width: '100%' 
  },
  leftCol: { 
    flex: 1, 
    minWidth: 320, 
    gap: 24 
  },
  rightCol: { 
    flex: 1.1, 
    minWidth: 340, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  heroTextContainer: { 
    gap: 12, 
    marginTop: 20 
  },
  badge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6, 
    alignSelf: 'flex-start', 
    backgroundColor: 'rgba(218, 210, 182, 0.1)', 
    paddingHorizontal: 12, 
    paddingVertical: 6, 
    borderRadius: radii.pill 
  },
  badgeText: { 
    fontSize: 11, 
    fontFamily: typography.bodyStrong, 
    color: colors.brandSecondary, 
    letterSpacing: 1 
  },
  heroTitle: { 
    fontSize: 42, 
    fontFamily: typography.display, 
    color: '#FFFFFF', 
    lineHeight: 48, 
    letterSpacing: -1 
  },
  heroHighlight: { 
    color: colors.brandSecondary 
  },
  heroDescription: { 
    fontSize: 15, 
    fontFamily: typography.body, 
    color: colors.textSecondary, 
    lineHeight: 22, 
    maxWidth: 480 
  },
  wizardCard: { 
    backgroundColor: '#161C18', // Glass-like dark background
    borderWidth: 1, 
    borderColor: '#242F28', 
    padding: 28, 
    borderRadius: radii.lg 
  },
  wizardContent: { 
    gap: 16 
  },
  wizardLabel: { 
    fontSize: 11, 
    color: colors.brandSecondary, 
    fontFamily: typography.bodyStrong, 
    letterSpacing: 1.5 
  },
  wizardTitle: { 
    fontSize: 20, 
    fontFamily: typography.display, 
    color: '#FFFFFF', 
    marginBottom: 8 
  },
  optionsList: { 
    gap: 12 
  },
  optionButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 16, 
    backgroundColor: '#1E2621', 
    borderWidth: 1, 
    borderColor: '#2E3B33', 
    borderRadius: radii.md, 
    gap: 14 
  },
  optionButtonActive: { 
    borderColor: colors.brandSecondary, 
    backgroundColor: '#26322A' 
  },
  optionIconBox: { 
    width: 38, 
    height: 38, 
    borderRadius: radii.sm, 
    backgroundColor: 'rgba(218, 210, 182, 0.1)', 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  optionTextContainer: { 
    flex: 1 
  },
  optionTitle: { 
    fontSize: 14, 
    fontFamily: typography.bodyStrong, 
    color: '#FFFFFF' 
  },
  optionTitleSlim: { 
    fontSize: 13, 
    fontFamily: typography.bodyStrong, 
    color: '#FFFFFF', 
    flex: 1 
  },
  optionDesc: { 
    fontSize: 11, 
    fontFamily: typography.body, 
    color: colors.textSecondary, 
    marginTop: 2 
  },
  optionNumberText: { 
    width: 24, 
    height: 24, 
    borderRadius: 12, 
    backgroundColor: 'rgba(218, 210, 182, 0.15)', 
    color: colors.brandSecondary, 
    fontSize: 11, 
    fontFamily: typography.bodyStrong, 
    textAlign: 'center', 
    lineHeight: 24 
  },
  keyboardIndicator: { 
    width: 20, 
    height: 20, 
    borderRadius: radii.sm, 
    backgroundColor: 'rgba(255,255,255,0.08)', 
    alignItems: 'center', 
    justifyContent: 'center', 
    borderWidth: 1, 
    borderColor: 'rgba(255,255,255,0.1)' 
  },
  keyboardText: { 
    fontSize: 11, 
    color: colors.textSecondary, 
    fontFamily: typography.bodyStrong 
  },
  backLink: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6, 
    marginBottom: 4 
  },
  backLinkText: { 
    fontSize: 12, 
    color: colors.textSecondary, 
    fontFamily: typography.body 
  },
  wizardActionBtn: { 
    marginTop: 12 
  },
  donoIntroContainer: { 
    gap: 14 
  },
  donoIntroDesc: { 
    fontSize: 13, 
    fontFamily: typography.body, 
    color: colors.textSecondary, 
    lineHeight: 18 
  },
  featuresBadgeGrid: { 
    gap: 8, 
    marginVertical: 4 
  },
  featureItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8 
  },
  featureItemText: { 
    fontSize: 12, 
    color: '#FFFFFF', 
    fontFamily: typography.body 
  },
  donoSignupBtn: { 
    marginTop: 8 
  },

  // Phone Mock Design
  phoneMockContainer: { 
    width: 320, 
    height: 600, 
    borderRadius: 36, 
    borderWidth: 8, 
    borderColor: '#242F28', 
    backgroundColor: '#0A0C0B', 
    position: 'relative', 
    overflow: 'hidden', 
    ...elevations.card 
  },
  phoneHeader: { 
    height: 48, 
    alignItems: 'center', 
    justifyContent: 'center', 
    borderBottomWidth: 1, 
    borderBottomColor: '#161C18', 
    position: 'relative' 
  },
  phoneCamera: { 
    width: 60, 
    height: 14, 
    borderRadius: 7, 
    backgroundColor: '#242F28', 
    position: 'absolute', 
    top: 6 
  },
  phoneTitle: { 
    fontSize: 11, 
    fontFamily: typography.bodyStrong, 
    color: colors.brandSecondary, 
    marginTop: 14 
  },
  phoneScreen: { 
    flex: 1, 
    padding: 16 
  },
  phoneSearchBar: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8, 
    backgroundColor: '#121614', 
    paddingHorizontal: 12, 
    borderRadius: radii.md, 
    height: 42, 
    borderWidth: 1, 
    borderColor: '#1C221E' 
  },
  searchField: { 
    flex: 1, 
    backgroundColor: 'transparent', 
    borderWidth: 0, 
    height: '100%', 
    paddingTop: 0, 
    paddingBottom: 0 
  },
  searchInputText: { 
    fontSize: 11, 
    color: '#FFFFFF' 
  },
  phoneScrollList: { 
    flex: 1, 
    marginTop: 16 
  },
  phoneSectionTitle: { 
    fontSize: 11, 
    fontFamily: typography.bodyStrong, 
    color: colors.textSecondary, 
    textTransform: 'uppercase', 
    letterSpacing: 0.8, 
    marginBottom: 8 
  },
  shopCard: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 12, 
    padding: 12, 
    backgroundColor: '#121614', 
    borderRadius: radii.md, 
    borderWidth: 1, 
    borderColor: '#1C221E', 
    marginBottom: 8 
  },
  shopImageFallback: { 
    width: 44, 
    height: 44, 
    borderRadius: radii.sm, 
    backgroundColor: 'rgba(218, 210, 182, 0.08)', 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  shopCardInfo: { 
    flex: 1, 
    gap: 2 
  },
  shopCardName: { 
    fontSize: 13, 
    fontFamily: typography.bodyStrong, 
    color: '#FFFFFF' 
  },
  shopLocRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 4 
  },
  shopCardLoc: { 
    fontSize: 11, 
    color: colors.textMuted 
  },
  emptyText: { 
    textAlign: 'center', 
    color: colors.textMuted, 
    fontSize: 12, 
    marginTop: 32 
  },

  // Vitrine view inside phone mock
  vitrineContainer: { 
    flex: 1, 
    gap: 10 
  },
  backToShops: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 4, 
    marginBottom: 4 
  },
  backToShopsText: { 
    fontSize: 11, 
    color: colors.brandSecondary, 
    fontFamily: typography.body 
  },
  vitrineName: { 
    fontSize: 16, 
    fontFamily: typography.display, 
    color: '#FFFFFF' 
  },
  vitrineDesc: { 
    fontSize: 11, 
    color: colors.textSecondary, 
    lineHeight: 14 
  },
  vitrineSectionTitle: { 
    fontSize: 11, 
    fontFamily: typography.bodyStrong, 
    color: colors.brandSecondary, 
    marginTop: 8, 
    marginBottom: 6 
  },
  servicesList: { 
    flex: 1 
  },
  serviceRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingVertical: 8, 
    borderBottomWidth: 1, 
    borderBottomColor: '#161C18' 
  },
  serviceName: { 
    fontSize: 11, 
    fontFamily: typography.bodyStrong, 
    color: '#FFFFFF' 
  },
  servicePrice: { 
    fontSize: 11, 
    color: colors.brandSecondary 
  },
  serviceSelectBtn: { 
    paddingHorizontal: 10, 
    paddingVertical: 5, 
    borderRadius: radii.sm, 
    backgroundColor: '#1E2621', 
    borderWidth: 1, 
    borderColor: '#2E3B33' 
  },
  serviceSelectBtnText: { 
    fontSize: 11, 
    color: '#FFFFFF', 
    fontFamily: typography.bodyStrong 
  },
  serviceSelectedCheck: { 
    width: 24, 
    height: 24, 
    borderRadius: 12, 
    backgroundColor: 'rgba(52, 168, 83, 0.1)', 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  timesGrid: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    gap: 6, 
    marginVertical: 4 
  },
  timeChip: { 
    paddingHorizontal: 8, 
    paddingVertical: 6, 
    borderRadius: radii.sm, 
    backgroundColor: '#121614', 
    borderWidth: 1, 
    borderColor: '#1C221E' 
  },
  timeChipActive: { 
    backgroundColor: colors.brandSecondary, 
    borderColor: colors.brandSecondary 
  },
  timeChipText: { 
    fontSize: 11, 
    color: '#FFFFFF' 
  },
  timeChipTextActive: { 
    color: colors.ink, 
    fontFamily: typography.bodyStrong 
  },
  bookConfirmBtn: { 
    height: 38, 
    borderRadius: radii.md, 
    backgroundColor: colors.brandSecondary, 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginTop: 8 
  },
  bookConfirmBtnText: { 
    color: colors.ink, 
    fontFamily: typography.bodyStrong, 
    fontSize: 11 
  },

  // Superhuman Check Modal Over Phone
  checkoutOverlay: { 
    ...StyleSheet.absoluteFillObject, 
    backgroundColor: 'rgba(0,0,0,0.85)', 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: 18 
  },
  superhumanCard: { 
    width: '100%', 
    backgroundColor: '#121614', 
    borderWidth: 1, 
    borderColor: '#242F28', 
    borderRadius: radii.lg, 
    padding: 20, 
    alignItems: 'center', 
    gap: 12 
  },
  shModalTitle: { 
    fontSize: 15, 
    fontFamily: typography.display, 
    color: '#FFFFFF', 
    textAlign: 'center' 
  },
  shModalDesc: { 
    fontSize: 11, 
    color: colors.textSecondary, 
    textAlign: 'center', 
    lineHeight: 16 
  },
  shCancelBtn: { 
    alignSelf: 'center', 
    paddingVertical: 6 
  },
  shCancelText: { 
    fontSize: 11, 
    color: colors.textMuted, 
    fontFamily: typography.body 
  },

  // Owner Simulator Dashboard Design
  simulatorDashboard: { 
    width: '100%', 
    maxWidth: 500, 
    backgroundColor: '#161C18', 
    borderWidth: 1, 
    borderColor: '#242F28', 
    padding: 24, 
    borderRadius: radii.lg, 
    gap: 18 
  },
  simTitle: { 
    fontSize: 18, 
    fontFamily: typography.display, 
    color: '#FFFFFF' 
  },
  simDesc: { 
    fontSize: 12, 
    color: colors.textSecondary, 
    lineHeight: 16 
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
    color: colors.brandSecondary, 
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
    backgroundColor: '#1E2621', 
    alignItems: 'center', 
    justifyContent: 'center', 
    borderWidth: 1, 
    borderColor: '#2E3B33' 
  },
  rangeBtnActive: { 
    backgroundColor: colors.brandSecondary, 
    borderColor: colors.brandSecondary 
  },
  rangeBtnLabel: { 
    fontSize: 11, 
    color: '#FFFFFF', 
    fontFamily: typography.body 
  },
  rangeBtnLabelActive: { 
    color: colors.ink, 
    fontFamily: typography.bodyStrong 
  },

  // SVG Chart
  chartContainer: { 
    marginTop: 8, 
    gap: 8 
  },
  chartTitle: { 
    fontSize: 12, 
    fontFamily: typography.bodyStrong, 
    color: '#FFFFFF', 
    textAlign: 'center' 
  },
  svgWrapper: { 
    height: 120, 
    flexDirection: 'row', 
    alignItems: 'flex-end', 
    justifyContent: 'space-around', 
    paddingBottom: 10, 
    borderBottomWidth: 1, 
    borderBottomColor: '#242F28' 
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

  // Metrics output cards
  simMetricsGrid: { 
    flexDirection: 'row', 
    gap: 8, 
    marginTop: 8 
  },
  metricCard: { 
    flex: 1, 
    alignItems: 'center', 
    padding: 12, 
    backgroundColor: '#1E2621', 
    borderRadius: radii.md, 
    borderWidth: 1, 
    borderColor: '#2E3B33', 
    gap: 4 
  },
  metricVal: { 
    fontSize: 13, 
    fontFamily: typography.bodyStrong, 
    color: '#FFFFFF' 
  },
  metricLbl: { 
    fontSize: 11, 
    color: colors.textMuted, 
    textAlign: 'center' 
  },

  // Bottom Shortcuts footer
  shortcutFooter: { 
    position: 'absolute', 
    bottom: 0, 
    left: 0, 
    right: 0, 
    height: 48, 
    backgroundColor: '#0A0C0B', 
    borderTopWidth: 1, 
    borderTopColor: '#1A211D', 
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
    backgroundColor: '#121614', 
    paddingHorizontal: 8, 
    paddingVertical: 3, 
    borderRadius: radii.sm, 
    borderWidth: 1, 
    borderColor: '#1C221E' 
  },
  shortcutKey: { 
    fontSize: 11, 
    fontFamily: typography.bodyStrong, 
    color: colors.brandSecondary, 
    backgroundColor: '#1C221E', 
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
