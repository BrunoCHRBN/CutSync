import React from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, ShieldCheck } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePublicProfessionalProfile } from '../../hooks/useProfessionalProfile';
import { ProfessionalProfileContent } from '../professional/ProfessionalProfileContent';
import { AppButton } from '../ui/AppButton';
import { EmptyState } from '../ui/EmptyState';
import { ScreenBackground } from '../ui/ScreenBackground';
import { colors, glassSurface, layout, radii, typography } from '../../theme/tokens';

export const PublicProfessionalProfileExperience = () => {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { profile, loading } = usePublicProfessionalProfile(slug);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(client)'));

  if (loading) {
    return (
      <ScreenBackground testID="public-professional-profile-loading" style={styles.center}>
        <ActivityIndicator color={colors.brand} size="large" />
      </ScreenBackground>
    );
  }

  if (!profile) {
    return (
      <ScreenBackground testID="public-professional-profile-not-found" style={styles.center}>
        <EmptyState
          testID="public-professional-profile-empty"
          title="Perfil indisponível"
          description="Este profissional pode ter ocultado ou alterado seu perfil público."
          action={
            <AppButton
              testID="public-professional-profile-back-empty-button"
              label="Voltar"
              onPress={goBack}
            />
          }
        />
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground testID="public-professional-profile-screen">
      <View style={styles.topbar}>
        <Pressable
          testID="public-professional-profile-back-button"
          onPress={goBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <ArrowLeft color={colors.text} size={18} />
        </Pressable>
        <Text testID="public-professional-profile-topbar-title" numberOfLines={1} style={styles.topbarTitle}>
          Perfil profissional
        </Text>
        <View style={styles.privacyBadge}>
          <ShieldCheck color={colors.success} size={14} />
          <Text style={styles.privacyBadgeText}>Perfil controlado</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ProfessionalProfileContent
          profile={profile}
          onOpenLink={(url) => void Linking.openURL(url)}
          showPrivacyNote
          testIDPrefix="public-professional-profile"
        />
      </ScrollView>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  topbar: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    zIndex: 5,
    ...glassSurface,
  },
  backButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  topbarTitle: { flex: 1, color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12 },
  privacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.successSoft,
  },
  privacyBadgeText: { color: colors.success, fontFamily: typography.bodyStrong, fontSize: 12 },
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 22, paddingBottom: 80 },
});

export default PublicProfessionalProfileExperience;
