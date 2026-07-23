import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Activity, BookOpen, ClipboardCheck, ClipboardList, FileCheck2, KeyRound, LogOut, ShieldAlert, Store, UserRoundCheck } from 'lucide-react-native';
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
  const inEstablishments = pathname.startsWith('/governance/establishments');
  const inAudit = pathname.startsWith('/governance/audit');
  const inRequests = pathname.startsWith('/governance/requests');
  const inVerification = pathname.startsWith('/governance/verification');
  const inPrivacy = pathname.startsWith('/governance/privacy');
  const inAccess = pathname.startsWith('/governance/access');

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
          accessibilityState={{ selected: !inKnowledge && !inEstablishments && !inAudit && !inRequests && !inVerification && !inPrivacy && !inAccess }}
          onPress={() => router.push('/governance')}
          style={[styles.navItem, !inKnowledge && !inEstablishments && !inAudit && !inRequests && !inVerification && !inPrivacy && !inAccess && styles.navItemActive]}
        >
          <Activity size={16} color={!inKnowledge && !inEstablishments && !inAudit ? colors.brand : colors.textSecondary} />
          <Text style={[styles.navText, !inKnowledge && !inEstablishments && !inAudit && styles.navTextActive]}>Painel de Controle</Text>
        </Pressable>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: inRequests }} onPress={() => router.push('/governance/requests')} style={[styles.navItem, inRequests && styles.navItemActive]}>
          <ClipboardCheck size={16} color={inRequests ? colors.brand : colors.textSecondary} />
          <Text style={[styles.navText, inRequests && styles.navTextActive]}>Solicitações</Text>
        </Pressable>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: inVerification }} onPress={() => router.push('/governance/verification')} style={[styles.navItem, inVerification && styles.navItemActive]}>
          <FileCheck2 size={16} color={inVerification ? colors.brand : colors.textSecondary} />
          <Text style={[styles.navText, inVerification && styles.navTextActive]}>Verificação</Text>
        </Pressable>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: inPrivacy }} onPress={() => router.push('/governance/privacy')} style={[styles.navItem, inPrivacy && styles.navItemActive]}>
          <UserRoundCheck size={16} color={inPrivacy ? colors.brand : colors.textSecondary} />
          <Text style={[styles.navText, inPrivacy && styles.navTextActive]}>Privacidade</Text>
        </Pressable>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: inAccess }} onPress={() => router.push('/governance/access')} style={[styles.navItem, inAccess && styles.navItemActive]}>
          <KeyRound size={16} color={inAccess ? colors.brand : colors.textSecondary} />
          <Text style={[styles.navText, inAccess && styles.navTextActive]}>Acesso</Text>
        </Pressable>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: inEstablishments }} onPress={() => router.push('/governance/establishments')} style={[styles.navItem, inEstablishments && styles.navItemActive]}>
          <Store size={16} color={inEstablishments ? colors.brand : colors.textSecondary} />
          <Text style={[styles.navText, inEstablishments && styles.navTextActive]}>Estabelecimentos</Text>
        </Pressable>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: inAudit }} onPress={() => router.push('/governance/audit')} style={[styles.navItem, inAudit && styles.navItemActive]}>
          <ClipboardList size={16} color={inAudit ? colors.brand : colors.textSecondary} />
          <Text style={[styles.navText, inAudit && styles.navTextActive]}>Auditoria</Text>
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
