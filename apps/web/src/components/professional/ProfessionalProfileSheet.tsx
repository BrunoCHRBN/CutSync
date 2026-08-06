import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { AlertCircle, UserRound, X } from 'lucide-react-native';
import { PublicTeamMember } from '@cutsync/database';
import { usePublicProfessionalProfile } from '../../hooks/useProfessionalProfile';
import { useServices } from '../../hooks/useServices';
import { useEstablishmentServicePrices } from '../../features/services/use-establishment-service-prices';
import { useEstablishmentTheme } from '../../contexts/establishment-theme-context';
import { buildEstablishmentTheme } from '@cutsync/brand';
import { ProfessionalProfileContent, ServiceItemProp } from './ProfessionalProfileContent';
import { AppButton } from '../ui/AppButton';
import { EmptyState } from '../ui/EmptyState';
import { supabase } from '../../services/supabase';
import { colors, layout, radii, typography } from '../../theme/tokens';
import { initialsOf } from '../../theme/color';
import {
  accentText,
  avatarRing,
  iconSoftBackground,
  primaryButton,
} from '../../theme/establishment-styles';

export interface ProfessionalProfileSheetProps {
  visible: boolean;
  professional: PublicTeamMember | null;
  establishmentId?: string | null;
  establishmentName?: string | null;
  onClose: () => void;
  onBook: (professionalId: string) => void;
  testID?: string;
}

export const ProfessionalProfileSheet: React.FC<ProfessionalProfileSheetProps> = ({
  visible,
  professional,
  establishmentId,
  establishmentName,
  onClose,
  onBook,
  testID = 'professional-profile-sheet',
}) => {
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const themeContext = useEstablishmentTheme();
  const theme = themeContext?.theme || buildEstablishmentTheme(null);

  const { services: globalServices } = useServices(establishmentId, true);
  const { prices: pricedServices } = useEstablishmentServicePrices(establishmentId);

  const showcaseServices = useMemo(() => {
    if (pricedServices.length) {
      return pricedServices.filter((s) => s.isActive).map((s) => ({
        id: s.serviceId,
        name: s.name,
        durationMinutes: s.durationMinutes,
        price: s.effectivePrice,
      }));
    }
    return globalServices.map((s) => ({
      id: s.id,
      name: s.name,
      durationMinutes: s.durationMinutes,
      price: s.price,
    }));
  }, [pricedServices, globalServices]);

  // Carrega o perfil detalhado sob demanda somente quando visible = true e slug existe
  const slug = visible && professional?.profileSlug ? professional.profileSlug : null;
  const {
    profile: detailedProfile,
    loading: loadingDetailedProfile,
    error: detailedProfileError,
    refresh: refreshProfile,
  } = usePublicProfessionalProfile(slug);

  const [professionalServiceIds, setProfessionalServiceIds] = useState<string[] | null>(null);
  const [servicesStatus, setServicesStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // Cancela/ignora respostas obsoletas quando o profissional muda ou a janela fecha
  useEffect(() => {
    if (!visible || !professional?.id) {
      setProfessionalServiceIds(null);
      setServicesStatus('idle');
      return;
    }
    let active = true;
    setServicesStatus('loading');
    setProfessionalServiceIds(null);

    let query = supabase
      .from('professional_services')
      .select('service_id')
      .eq('professional_id', professional.id)
      .eq('is_active', true);

    if (establishmentId) {
      query = query.eq('establishment_id', establishmentId);
    }

    query.then(({ data, error }) => {
      if (!active) return;
      if (error || !data) {
        setProfessionalServiceIds([]);
        setServicesStatus('error');
      } else {
        setProfessionalServiceIds(data.map((row) => row.service_id));
        setServicesStatus('success');
      }
    });

    return () => {
      active = false;
    };
  }, [visible, professional?.id, establishmentId]);

  // Suporte a fechamento por tecla Escape na web
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, onClose]);

  const filteredServices = useMemo<ServiceItemProp[]>(() => {
    if (servicesStatus !== 'success' || !professionalServiceIds) return [];
    if (professionalServiceIds.length === 0) return [];
    const set = new Set(professionalServiceIds);
    return showcaseServices.filter((s) => set.has(s.id));
  }, [servicesStatus, professionalServiceIds, showcaseServices]);

  if (!visible) return null;

  const isLoading = loadingDetailedProfile || servicesStatus === 'loading';
  const firstName = professional?.name ? professional.name.split(' ')[0] : 'Profissional';
  const contextLabel = establishmentName ? `Atende em ${establishmentName}` : 'Atende neste estabelecimento';

  return (
    <Modal
      animationType={Platform.OS === 'web' ? 'fade' : 'slide'}
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityLabel="Fechar janela"
        style={styles.backdrop}
        onPress={onClose}
      >
        <Pressable
          accessibilityViewIsModal
          aria-modal={true}
          aria-label={professional ? `Perfil de ${professional.name}` : 'Perfil Profissional'}
          accessibilityLabel={professional ? `Perfil de ${professional.name}` : 'Perfil Profissional'}
          style={[
            styles.sheet,
            desktop ? styles.desktopSheet : styles.mobileSheet,
            desktop && { maxWidth: Math.min(680, Math.max(560, Math.floor(width * 0.46))) },
          ]}
          onPress={(event) => event.stopPropagation()}
          testID={testID}
        >
          {/* Cabeçalho Fixo */}
          <View style={styles.header}>
            {!desktop && <View style={styles.dragIndicator} />}
            <View style={styles.headerRow}>
              <Text testID="professional-sheet-title" style={styles.headerTitle}>
                Perfil Profissional
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fechar perfil do profissional"
                style={styles.closeBtn}
                onPress={onClose}
              >
                <X color={colors.textSecondary} size={20} strokeWidth={1.8} />
              </Pressable>
            </View>
          </View>

          {/* Conteúdo Rolável */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {isLoading ? (
              <View testID="professional-sheet-loading" style={styles.centerState}>
                <ActivityIndicator color={theme.primary} size="large" />
                <Text style={styles.loadingText}>Carregando informações do profissional...</Text>
              </View>
            ) : detailedProfileError ? (
              <View testID="professional-sheet-error" style={styles.centerState}>
                <AlertCircle color={colors.danger} size={32} />
                <Text style={styles.errorTitle}>Não foi possível carregar o perfil</Text>
                <Text style={styles.errorText}>{detailedProfileError}</Text>
                <AppButton label="Tentar novamente" onPress={refreshProfile} variant="secondary" size="sm" />
              </View>
            ) : detailedProfile ? (
              <ProfessionalProfileContent
                profile={detailedProfile}
                services={filteredServices}
                onBook={undefined}
                onOpenLink={(url) => void Linking.openURL(url)}
                theme={theme}
                contextLabel={contextLabel}
                testIDPrefix="professional-sheet"
              />
            ) : professional ? (
              /* Resumo Neutro sem perfil público expandido */
              <View testID="professional-sheet-neutral" style={styles.neutralContainer}>
                <View style={styles.heroBox}>
                  <View style={[styles.avatarCircle, avatarRing(theme), iconSoftBackground(theme)]}>
                    {professional.avatarUrl ? (
                      <Image source={{ uri: professional.avatarUrl }} style={styles.avatarImage} />
                    ) : (
                      <UserRound size={40} color={theme.primary} />
                    )}
                  </View>
                  <Text testID="professional-sheet-neutral-name" style={styles.profName}>{professional.name}</Text>
                  <Text style={styles.profRoleTitle}>
                    {professional.tituloProfissional || 'Especialista'}
                  </Text>

                  {!!professional.specialties && (
                    <View style={styles.chipsRow}>
                      {professional.specialties.split(',').map((chip, idx) => {
                        const trimmed = chip.trim();
                        if (!trimmed) return null;
                        return (
                          <View key={idx} style={[styles.chip, iconSoftBackground(theme)]}>
                            <Text style={[styles.chipText, accentText(theme)]}>{trimmed}</Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>

                <View style={styles.noticeBox}>
                  <Text style={styles.noticeText}>
                    Este profissional ainda não ativou a exibição do perfil público expandido.
                  </Text>
                </View>

                {filteredServices.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>SERVIÇOS PRESTADOS</Text>
                    <View style={styles.servicesList}>
                      {filteredServices.map((srv) => (
                        <View key={srv.id} style={styles.serviceRow}>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={styles.serviceName}>• {srv.name}</Text>
                            <Text style={styles.serviceDuration}>{srv.durationMinutes} min</Text>
                          </View>
                          <Text style={[styles.servicePrice, accentText(theme)]}>
                            R$ {Number(srv.price).toFixed(2)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            ) : null}
          </ScrollView>

          {/* CTA Fixo no Rodapé */}
          {!!professional && (
            <View style={styles.footer}>
              <AppButton
                testID="barbershop-professional-book-button"
                label={`Agendar com ${firstName}`}
                style={[styles.ctaBtn, primaryButton(theme)]}
                foregroundColor={theme.onPrimary}
                onPress={() => onBook(professional.id)}
              />
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 10, 10, 0.65)',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  desktopSheet: {
    height: '100%',
    minWidth: 560,
    maxWidth: 680,
    borderTopLeftRadius: radii.xl,
    borderBottomLeftRadius: radii.xl,
    ...Platform.select({
      web: { boxShadow: '-12px 0 36px rgba(0,0,0,0.22)' } as any,
      default: {},
    }),
  },
  mobileSheet: {
    maxHeight: '92%',
    height: '92%',
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.surface,
    zIndex: 10,
  },
  dragIndicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 18,
    letterSpacing: -0.4,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 32,
  },
  centerState: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    marginTop: 8,
  },
  errorTitle: {
    color: colors.text,
    fontFamily: typography.bodyStrong,
    fontSize: 16,
  },
  errorText: {
    color: colors.textSecondary,
    fontFamily: typography.body,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
  },
  neutralContainer: {
    gap: 28,
  },
  heroBox: {
    alignItems: 'center',
    gap: 8,
  },
  avatarCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 4,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  profName: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 24,
    letterSpacing: -0.5,
  },
  profRoleTitle: {
    color: colors.textSecondary,
    fontFamily: typography.serif,
    fontSize: 15,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginTop: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  chipText: {
    fontFamily: typography.bodyStrong,
    fontSize: 12,
  },
  noticeBox: {
    padding: 16,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  noticeText: {
    color: colors.textSecondary,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontFamily: typography.bodyStrong,
    fontSize: 11,
    letterSpacing: 1.8,
  },
  servicesList: {
    gap: 10,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  serviceName: {
    color: colors.text,
    fontFamily: typography.bodyStrong,
    fontSize: 13.5,
  },
  serviceDuration: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
  },
  servicePrice: {
    fontFamily: typography.bodyStrong,
    fontSize: 13.5,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.surface,
  },
  ctaBtn: {
    minHeight: 50,
    borderRadius: radii.pill,
  },
});
