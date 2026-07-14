import React, { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LogOut, Wifi, WifiOff } from 'lucide-react-native';
import { BrandMark } from '../ui/BrandMark';
import { colors, radii, typography } from '../../theme/tokens';

interface BarberShellProps {
  children: ReactNode;
  name?: string;
  shopName?: string;
  isOffline: boolean;
  onSignOut: () => void;
  testID: string;
}

export const BarberShell = ({ children, name, shopName, isOffline, onSignOut, testID }: BarberShellProps) => (
  <View testID={testID} style={styles.root}>
    <View testID="barber-shell-header" style={styles.header}>
      <BrandMark compact testID="barber-shell-brand" />
      <View style={styles.identity}>
        <Text testID="barber-shell-shop-name" numberOfLines={1} style={styles.shop}>{shopName || 'Barbearia'}</Text>
        <Text testID="barber-shell-user-name" numberOfLines={1} style={styles.name}>{name || 'Profissional'}</Text>
      </View>
      <View style={[styles.connection, isOffline && styles.connectionOffline]}>
        {isOffline ? <WifiOff color={colors.warning} size={14} /> : <Wifi color={colors.success} size={14} />}
        <Text style={[styles.connectionText, isOffline && styles.connectionTextOffline]}>{isOffline ? 'Offline' : 'Online'}</Text>
      </View>
      <Pressable testID="barber-sign-out-button" onPress={onSignOut} style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}>
        <LogOut color={colors.danger} size={17} />
      </Pressable>
    </View>
    {children}
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: '#0F0F12F2' },
  identity: { flex: 1, minWidth: 0 },
  shop: { color: colors.textMuted, fontFamily: typography.body, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8 },
  name: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12, marginTop: 2 },
  connection: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.successSoft, borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 6 },
  connectionOffline: { backgroundColor: colors.warningSoft },
  connectionText: { color: colors.success, fontFamily: typography.bodyStrong, fontSize: 9 },
  connectionTextOffline: { color: colors.warning },
  signOut: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface },
  pressed: { opacity: 0.6, transform: [{ scale: 0.97 }] },
});