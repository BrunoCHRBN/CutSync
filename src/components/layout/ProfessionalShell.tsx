import React, { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CalendarDays, LogOut, UserRound, Wifi } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { BrandMark } from '../ui/BrandMark';
import { colors, radii, typography } from '../../theme/tokens';

interface ProfessionalShellProps {
  children: ReactNode;
  name?: string;
  shopName?: string;
  onSignOut: () => void;
  testID: string;
  isOffline?: boolean;
  activeRoute?: 'agenda' | 'profile';
}

export const ProfessionalShell = ({ children, name, shopName, onSignOut, testID, isOffline = false, activeRoute = 'agenda' }: ProfessionalShellProps) => {
  const router = useRouter();
  return <View testID={testID} style={styles.root}>
    <View testID="professional-shell-header" style={styles.header}>
      <BrandMark compact testID="professional-shell-brand" />
      <View style={styles.identity}>
        <Text testID="professional-shell-shop-name" numberOfLines={1} style={styles.shop}>{shopName || 'Estabelecimento'}</Text>
        <Text testID="professional-shell-user-name" numberOfLines={1} style={styles.name}>{name || 'Profissional'}</Text>
      </View>
      <View style={styles.connection}>
        <Wifi color={isOffline ? colors.danger : colors.success} size={14} />
        <Text style={[styles.connectionText, isOffline && styles.connectionTextOffline]}>{isOffline ? 'Sem internet' : 'Tempo real'}</Text>
      </View>
      <Pressable testID="professional-sign-out-button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} onPress={onSignOut} style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}>
        <LogOut color={colors.danger} size={17} />
      </Pressable>
    </View>
    <View testID="professional-shell-navigation" style={styles.navigation}>
      <Pressable testID="professional-nav-agenda" onPress={() => router.push('/(professional)' as never)} style={[styles.navButton, activeRoute === 'agenda' && styles.navButtonActive]}><CalendarDays color={activeRoute === 'agenda' ? colors.text : colors.textMuted} size={15} /><Text style={[styles.navText, activeRoute === 'agenda' && styles.navTextActive]}>Agenda</Text></Pressable>
      <Pressable testID="professional-nav-profile" onPress={() => router.push('/professional-profile' as never)} style={[styles.navButton, activeRoute === 'profile' && styles.navButtonActive]}><UserRound color={activeRoute === 'profile' ? colors.text : colors.textMuted} size={15} /><Text style={[styles.navText, activeRoute === 'profile' && styles.navTextActive]}>Meu perfil</Text></Pressable>
    </View>
    {children}
  </View>;
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  identity: { flex: 1, minWidth: 0 },
  shop: { color: colors.textMuted, fontFamily: typography.body, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8 },
  name: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12, marginTop: 2 },
  connection: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.successSoft, borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 6 },
  connectionText: { color: colors.success, fontFamily: typography.bodyStrong, fontSize: 9 },
  connectionTextOffline: { color: colors.danger },
  navigation: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  navButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16, borderRadius: radii.md },
  navButtonActive: { backgroundColor: colors.surfacePressed },
  navText: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 10 },
  navTextActive: { color: colors.text },
  signOut: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface },
  pressed: { transform: [{ scale: 0.97 }] },
});
