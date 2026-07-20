import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Activity, BookOpen, LogOut, ShieldAlert } from 'lucide-react-native';
import { useGovernanceAuth } from '../../contexts/governance-auth-context';
import { ScreenBackground } from '../ui/ScreenBackground';
import { colors, layout, radii, typography } from '../../theme/tokens';

export function GovernanceShell({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const compact = width < layout.mobileBreakpoint;
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut } = useGovernanceAuth();
  if (!profile) return null;

  const inKnowledge = pathname.startsWith('/governance/knowledge');

  return (
    <ScreenBackground testID="governance-shell">
      <View style={[styles.header, compact && styles.headerCompact]}>
        <View style={styles.identityBrand}>
          <ShieldAlert color={colors.brand} size={22} />
          <Text style={styles.headerTitle}>Central de Governança</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{profile.role}</Text>
          </View>
        </View>
        {!compact && (
          <View style={styles.identity}>
            <Text selectable style={styles.identityName}>{profile.name}</Text>
            <Text selectable style={styles.identityEmail}>{profile.email}</Text>
          </View>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="Sair da Governança" onPress={signOut} style={styles.logout}>
          <LogOut color={colors.danger} size={17} />
          {!compact && <Text style={styles.logoutText}>Sair</Text>}
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.navScroller} contentContainerStyle={styles.nav}>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: !inKnowledge }}
          onPress={() => router.push('/governance')}
          style={[styles.navItem, !inKnowledge && styles.navItemActive]}
        >
          <Activity size={16} color={!inKnowledge ? colors.brand : colors.textSecondary} />
          <Text style={[styles.navText, !inKnowledge && styles.navTextActive]}>Painel de Controle</Text>
        </Pressable>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: inKnowledge }}
          onPress={() => router.push('/governance/knowledge')}
          style={[styles.navItem, inKnowledge && styles.navItemActive]}
        >
          <BookOpen size={16} color={inKnowledge ? colors.brand : colors.textSecondary} />
          <Text style={[styles.navText, inKnowledge && styles.navTextActive]}>Base de Conhecimento</Text>
        </Pressable>
      </ScrollView>

      <View style={styles.content}>{children}</View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 12 },
  headerCompact: { minHeight: 64 },
  identityBrand: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  headerTitle: { color: colors.text, fontFamily: typography.display, fontSize: 18 },
  roleBadge: { backgroundColor: colors.brand, borderRadius: radii.sm, paddingHorizontal: 8, paddingVertical: 4 },
  roleText: { color: colors.ink, fontFamily: typography.bodyStrong, fontSize: 11, textTransform: 'uppercase' },
  identity: { alignItems: 'flex-end', flex: 1, paddingHorizontal: 12 },
  identityName: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13 },
  identityEmail: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 11 },
  logout: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.dangerSoft, paddingHorizontal: 12, borderRadius: radii.pill },
  logoutText: { color: colors.danger, fontFamily: typography.bodyStrong, fontSize: 12 },
  navScroller: { flexGrow: 0, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  nav: { minWidth: '100%', maxWidth: layout.contentMax, alignSelf: 'center', paddingHorizontal: 20, gap: 16 },
  navItem: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 7, borderBottomWidth: 2, borderBottomColor: 'transparent', paddingHorizontal: 4 },
  navItemActive: { borderBottomColor: colors.brand },
  navText: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 13 },
  navTextActive: { color: colors.brand },
  content: { flex: 1 },
});
