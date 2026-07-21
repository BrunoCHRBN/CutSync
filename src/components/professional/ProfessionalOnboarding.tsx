import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Scissors, Clock3, WalletCards, Instagram, UserRound, ArrowRight } from 'lucide-react-native';
import { supabase } from '../../services/supabase';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { InlineNotice } from '../ui/InlineNotice';
import { colors, radii, typography } from '../../theme/tokens';

interface ProfessionalOnboardingProps {
  profile: any;
  professionalPixAllowed?: boolean;
  onComplete: () => void;
}

export const ProfessionalOnboarding = ({ profile, professionalPixAllowed = true, onComplete }: ProfessionalOnboardingProps) => {
  const [step, setStep] = useState(1);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // Step 1: Vitrine
  const [titulo, setTitulo] = useState('');
  const [specialties, setSpecialties] = useState('');
  const [instagram, setInstagram] = useState('');

  // Step 2: Escala
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [openDays, setOpenDays] = useState<boolean[]>([true, true, true, true, true, true, false]); // Mon to Sun

  // Step 3: Financeiro
  const [pixType, setPixType] = useState<'CPF' | 'Celular' | 'E-mail' | 'Chave Aleatória'>('CPF');
  const [pixKey, setPixKey] = useState('');

  // Restrict and formats
  const formatCpf = (val: string) => {
    const clean = val.replace(/<[^>]*>/g, '').replace(/\D/g, ''); // Strips XML/HTML tags and non-digits
    if (clean.length <= 3) return clean;
    if (clean.length <= 6) return `${clean.slice(0, 3)}.${clean.slice(3)}`;
    if (clean.length <= 9) return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6)}`;
    return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9, 11)}`;
  };

  const formatPhoneWithDdi = (val: string) => {
    if (val.length < 3) return '';
    const clean = val.replace(/<[^>]*>/g, '').replace(/\D/g, ''); // Strips XML/HTML tags and non-digits
    if (clean.length === 0) return '';
    
    let digits = clean;
    if (clean.length > 0 && !clean.startsWith('55')) {
      if (clean === '5') {
        digits = '55';
      } else {
        digits = '55' + clean;
      }
    }
    
    if (digits.length <= 2) return '+55';
    if (digits.length <= 4) return `+55 (${digits.slice(2)}`;
    if (digits.length <= 8) return `+55 (${digits.slice(2, 4)}) ${digits.slice(4)}`;
    if (digits.length <= 12) return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9, 13)}`;
  };

  const cleanPixInput = (val: string) => {
    if (pixType === 'CPF') {
      return formatCpf(val);
    }
    if (pixType === 'Celular') {
      return formatPhoneWithDdi(val);
    }
    return val;
  };

  const handleNextStep = () => {
    setNotice(null);
    if (step === 1) {
      if (!titulo.trim() || !specialties.trim()) {
        setNotice({ tone: 'danger', message: 'Preencha seu título profissional e especialidades para continuar.' });
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (professionalPixAllowed) {
        setStep(3);
      } else {
        void handleFinish();
      }
    }
  };

  const handleFinish = async () => {
    setNotice(null);
    if (professionalPixAllowed && !pixKey.trim()) {
      setNotice({ tone: 'danger', message: 'Insira sua chave Pix para receber os repasses.' });
      return;
    }

    setLoading(true);

    try {
      // 1. Update Profile info
      const { error: profileError } = await supabase.from('profiles')
        .update({
          titulo_profissional: titulo.trim(),
          specialties: specialties.trim(),
          instagram: instagram.trim() || null,
          pix_key: professionalPixAllowed ? pixKey.trim() : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile?.id);

      if (profileError) throw profileError;

      // 2. Insert work shifts
      const dayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
      const shifts = dayNames.map((_, index) => {
        const isOpen = index === 0 ? openDays[6] : openDays[index - 1];
        return {
          profile_id: profile?.id,
          day_of_week: index,
          start_time: `${startTime}:00`,
          end_time: `${endTime}:00`,
          is_active: isOpen
        };
      });

      const { error: shiftsError } = await supabase.from('work_shifts')
        .insert(shifts);

      if (shiftsError) {
        console.warn('Erro ao salvar turnos de trabalho:', shiftsError);
      }

      onComplete();
    } catch (err: any) {
      setNotice({ tone: 'danger', message: err.message || 'Erro ao salvar configurações do profissional.' });
    } finally {
      setLoading(false);
    }
  };

  const toggleOpenDay = (idx: number) => {
    const updated = [...openDays];
    updated[idx] = !updated[idx];
    setOpenDays(updated);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Configuração de Profissional</Text>
          <Text style={styles.subtitle}>Complete os dados para ativar sua agenda no estabelecimento.</Text>
        </View>

        {/* Step Indicators */}
        <View style={styles.indicatorContainer}>
          {(professionalPixAllowed ? [1, 2, 3] : [1, 2]).map((s) => (
            <View key={s} style={styles.indicatorWrapper}>
              <View style={[styles.indicatorCircle, step >= s && styles.indicatorCircleActive]}>
                <Text style={[styles.indicatorNumber, step >= s && styles.indicatorNumberActive]}>{s}</Text>
              </View>
              <Text style={[styles.indicatorLabel, step === s && styles.indicatorLabelActive]}>
                {s === 1 ? 'Vitrine' : s === 2 ? 'Agenda' : 'Repasse'}
              </Text>
            </View>
          ))}
        </View>

        {!!notice && <InlineNotice tone={notice.tone} message={notice.message} />}

        <AppCard style={styles.card} elevated>
          {step === 1 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Sua Vitrine Pública</Text>
              <Text style={styles.stepDescription}>Esses dados serão exibidos para os clientes no catálogo online.</Text>
              
              <AppInput 
                label="Título Profissional" 
                value={titulo} 
                onChangeText={setTitulo} 
                placeholder="Ex: Barbeiro Master, Designer de Barba" 
                icon={<UserRound color={colors.textMuted} size={17} />}
              />

              <AppInput 
                label="Especialidades" 
                value={specialties} 
                onChangeText={setSpecialties} 
                placeholder="Ex: Degradê, Pigmentação, Barba de Toalha Quente" 
                icon={<Scissors color={colors.textMuted} size={17} />}
              />

              <AppInput 
                label="Instagram (Opcional)" 
                value={instagram} 
                onChangeText={setInstagram} 
                placeholder="@seu.perfil" 
                icon={<Instagram color={colors.textMuted} size={17} />}
                autoCapitalize="none"
              />

              <AppButton 
                label="Continuar" 
                onPress={handleNextStep} 
                icon={<ArrowRight color={colors.surface} size={17} />}
                iconPosition="right"
                fullWidth 
              />
            </View>
          )}

          {step === 2 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Sua Jornada de Trabalho</Text>
              <Text style={styles.stepDescription}>Defina seus horários padrões de atendimento na barbearia.</Text>

              <View style={styles.row}>
                <AppInput 
                  containerStyle={{ flex: 1 }} 
                  label="Entrada" 
                  value={startTime} 
                  onChangeText={setStartTime} 
                  placeholder="09:00" 
                  icon={<Clock3 color={colors.textMuted} size={17} />}
                />
                <AppInput 
                  containerStyle={{ flex: 1 }} 
                  label="Saída" 
                  value={endTime} 
                  onChangeText={setEndTime} 
                  placeholder="18:00" 
                  icon={<Clock3 color={colors.textMuted} size={17} />}
                />
              </View>

              <Text style={styles.sectionLabel}>Dias da semana em que atende:</Text>
              <View style={styles.daysContainer}>
                {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((day, idx) => (
                  <Pressable key={day} onPress={() => toggleOpenDay(idx)} style={[styles.dayChip, openDays[idx] && styles.dayChipActive]}>
                    <Text style={[styles.dayChipText, openDays[idx] && styles.dayChipTextActive]}>{day}</Text>
                  </Pressable>
                ))}
              </View>

              <AppButton 
                label={professionalPixAllowed ? "Continuar" : "Finalizar"} 
                onPress={handleNextStep} 
                loading={loading}
                icon={<ArrowRight color={colors.surface} size={17} />}
                iconPosition="right"
                fullWidth 
              />
            </View>
          )}

          {step === 3 && professionalPixAllowed && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Repasse de Comissões</Text>
              <Text style={styles.stepDescription}>Sua comissão será depositada diretamente nesta chave Pix ao concluir os atendimentos.</Text>

              <Text style={styles.sectionLabel}>Tipo de Chave Pix:</Text>
              <View style={styles.pixSelector}>
                {['CPF', 'Celular', 'E-mail', 'Chave Aleatória'].map((type: any) => (
                  <Pressable 
                    key={type} 
                    onPress={() => { setPixType(type); setPixKey(''); }} 
                    style={[styles.pixTypeButton, pixType === type && styles.pixTypeButtonActive]}
                  >
                    <Text style={[styles.pixTypeLabel, pixType === type && styles.pixTypeLabelActive]}>{type}</Text>
                  </Pressable>
                ))}
              </View>

              <AppInput 
                label={`Chave Pix (${pixType})`} 
                value={pixKey} 
                onChangeText={(val) => setPixKey(cleanPixInput(val))} 
                placeholder={pixType === 'CPF' ? '000.000.000-00' : pixType === 'Celular' ? '+55 (11) 99999-9999' : 'Insira sua chave'} 
                icon={<WalletCards color={colors.textMuted} size={17} />}
                autoCapitalize="none"
              />

              <AppButton 
                label="Finalizar Configuração" 
                onPress={handleFinish} 
                loading={loading}
                icon={<ArrowRight color={colors.surface} size={17} />}
                iconPosition="right"
                fullWidth 
              />
            </View>
          )}
        </AppCard>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingBottom: 60 },
  header: { marginBottom: 28, alignItems: 'center' },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 24, textAlign: 'center' },
  subtitle: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 13, textAlign: 'center', marginTop: 6, maxWidth: 320 },
  card: { padding: 24, gap: 16, width: '100%', maxWidth: 480, alignSelf: 'center' },
  indicatorContainer: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 16, marginBottom: 20, width: '100%', maxWidth: 360, alignSelf: 'center' },
  indicatorWrapper: { alignItems: 'center', flex: 1 },
  indicatorCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  indicatorCircleActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  indicatorNumber: { fontSize: 11, color: colors.textSecondary, fontFamily: typography.bodyStrong },
  indicatorNumberActive: { color: colors.surface },
  indicatorLabel: { fontSize: 11, color: colors.textSecondary, fontFamily: typography.body },
  indicatorLabelActive: { color: colors.text, fontFamily: typography.bodyStrong },
  stepContent: { gap: 16 },
  stepTitle: { color: colors.text, fontFamily: typography.display, fontSize: 18 },
  stepDescription: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, lineHeight: 18, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 16 },
  sectionLabel: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13, marginTop: 8 },
  daysContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, marginBottom: 12 },
  dayChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.md, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border },
  dayChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  dayChipText: { fontSize: 12, color: colors.textSecondary, fontFamily: typography.body },
  dayChipTextActive: { color: colors.surface, fontFamily: typography.bodyStrong },
  pixSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  pixTypeButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.sm, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border },
  pixTypeButtonActive: { backgroundColor: colors.surface, borderColor: colors.text },
  pixTypeLabel: { fontSize: 11, color: colors.textSecondary, fontFamily: typography.body },
  pixTypeLabelActive: { color: colors.text, fontFamily: typography.bodyStrong },
});
