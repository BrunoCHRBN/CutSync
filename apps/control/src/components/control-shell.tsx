import { Link, usePathname } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useControlAuth } from '@/contexts/control-auth-context';
import {
  controlColors,
  controlLayout,
  controlRadii,
  controlSpacing,
  controlType,
} from '@/theme/tokens';
import type { ControlPermission } from '@/types/control';

interface NavigationItem {
  href: '/' | '/live' | '/support' | '/billing' | '/governance' | '/knowledge' | '/access';
  label: string;
  permission: ControlPermission;
}

interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

const navigationGroups: NavigationGroup[] = [
  {
    label: 'Operação',
    items: [
      { href: '/', label: 'Visão geral', permission: 'control.dashboard.read' },
      { href: '/live', label: 'Tempo real', permission: 'control.live.read' },
    ],
  },
  {
    label: 'Atendimento',
    items: [
      { href: '/support', label: 'Suporte', permission: 'control.support.read' },
    ],
  },
  {
    label: 'Governança',
    items: [
      { href: '/governance', label: 'Governança funcional', permission: 'control.governance.read' },
      { href: '/knowledge', label: 'Conhecimento', permission: 'control.knowledge.read' },
    ],
  },
  {
    label: 'Administração',
    items: [
      { href: '/billing', label: 'Cobrança', permission: 'control.billing.read' },
      { href: '/access', label: 'Acessos', permission: 'control.access.manage' },
    ],
  },
];

const roleLabels = {
  SaaS_Viewer: 'Visualizador',
  SaaS_Editor: 'Editor',
  SaaS_Owner: 'Proprietário',
} as const;

function getEnvironmentLabel(): string {
  const configured = (
    process.env.EXPO_PUBLIC_CONTROL_ENVIRONMENT
    ?? process.env.EXPO_PUBLIC_APP_ENV
  )?.trim().toLowerCase();

  const labels: Record<string, string> = {
    local: 'LOCAL',
    development: 'DESENVOLVIMENTO',
    dev: 'DESENVOLVIMENTO',
    homologation: 'HOMOLOGAÇÃO',
    homolog: 'HOMOLOGAÇÃO',
    staging: 'HOMOLOGAÇÃO',
    production: 'PRODUÇÃO',
    prod: 'PRODUÇÃO',
  };

  if (configured) return labels[configured] ?? configured.toUpperCase();

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.toLowerCase() ?? '';
  if (supabaseUrl.includes('localhost') || supabaseUrl.includes('127.0.0.1')) return 'LOCAL';
  return process.env.NODE_ENV === 'production' ? 'PRODUÇÃO' : 'DESENVOLVIMENTO';
}

export function ControlShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const { context, can, signOut } = useControlAuth();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const compact = width < controlLayout.compactBreakpoint;
  const environmentLabel = getEnvironmentLabel();
  const visibleGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => can(item.permission)),
    }))
    .filter((group) => group.items.length > 0);

  React.useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const navigation = (
    <View style={[styles.navigation, compact && styles.navigationCompact]}>
      {visibleGroups.map((group) => (
        <View key={group.label} style={styles.navigationGroup}>
          <Text style={styles.navigationGroupLabel}>{group.label}</Text>
          <View style={styles.navigationItems}>
            {group.items.map((item) => {
              const selected = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href} asChild>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityState={{ selected }}
                    style={StyleSheet.flatten([
                      styles.navigationItem,
                      selected && styles.navigationItemSelected,
                    ])}
                  >
                    <View style={[styles.navigationMarker, selected && styles.navigationMarkerSelected]} />
                    <Text style={[styles.navigationText, selected && styles.navigationTextSelected]}>
                      {item.label}
                    </Text>
                  </Pressable>
                </Link>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );

  const account = (
    <View style={styles.account}>
      <View style={styles.accountCopy}>
        <Text numberOfLines={1} style={styles.accountName}>{context?.name}</Text>
        <Text style={styles.accountRole}>
          {context ? roleLabels[context.role] : 'Acesso privado'}
        </Text>
      </View>
      <Pressable
        accessibilityLabel="Encerrar sessão do CutSync Control"
        accessibilityRole="button"
        onPress={() => { void signOut(); }}
        style={({ pressed }) => [styles.signOut, pressed && styles.signOutPressed]}
      >
        <Text style={styles.signOutText}>Encerrar sessão</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.app, compact && styles.appCompact]}>
      {compact ? (
        <View style={styles.compactShell}>
          <View style={styles.compactHeader}>
            <View style={styles.compactBrand}>
              <View>
                <Text style={styles.eyebrow}>CUTSYNC</Text>
                <Text style={styles.compactBrandTitle}>Control</Text>
              </View>
              <View style={styles.environmentBadge}>
                <Text style={styles.environmentText}>{environmentLabel}</Text>
              </View>
            </View>
            <Pressable
              accessibilityLabel={menuOpen ? 'Fechar menu do Control' : 'Abrir menu do Control'}
              accessibilityRole="button"
              accessibilityState={{ expanded: menuOpen }}
              onPress={() => setMenuOpen((current) => !current)}
              style={({ pressed }) => [styles.menuButton, pressed && styles.menuButtonPressed]}
            >
              <Text style={styles.menuButtonText}>{menuOpen ? 'Fechar' : 'Menu'}</Text>
            </Pressable>
          </View>
          {menuOpen ? (
            <View style={styles.compactMenu}>
              {navigation}
              {account}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.sidebar}>
          <View style={styles.brand}>
            <Text style={styles.eyebrow}>CUTSYNC</Text>
            <Text style={styles.brandTitle}>Control</Text>
            <Text style={styles.privateLabel}>Workspace interno</Text>
            <View style={styles.environmentBadge}>
              <Text style={styles.environmentText}>{environmentLabel}</Text>
            </View>
          </View>
          {navigation}
          {account}
        </View>
      )}

      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, flexDirection: 'row', backgroundColor: controlColors.canvas },
  appCompact: { flexDirection: 'column' },
  sidebar: {
    width: controlLayout.sidebarWidth,
    gap: controlSpacing.lg,
    padding: controlSpacing.xl,
    borderRightWidth: 1,
    borderRightColor: controlColors.brandLine,
    backgroundColor: controlColors.brandDark,
  },
  compactShell: {
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor: controlColors.brandLine,
    backgroundColor: controlColors.brandDark,
  },
  compactHeader: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: controlSpacing.md,
    paddingHorizontal: controlSpacing.lg,
    paddingVertical: controlSpacing.sm,
  },
  compactBrand: {
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: controlSpacing.sm,
  },
  compactBrandTitle: { color: controlColors.sidebarTextStrong, fontSize: 20, fontWeight: '800' },
  compactMenu: {
    gap: controlSpacing.lg,
    paddingHorizontal: controlSpacing.lg,
    paddingBottom: controlSpacing.lg,
    borderTopWidth: 1,
    borderTopColor: controlColors.brandLine,
  },
  menuButton: {
    minHeight: controlLayout.touchTarget,
    minWidth: 76,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: controlSpacing.md,
    borderWidth: 1,
    borderColor: controlColors.brandLine,
    borderRadius: controlRadii.md,
    backgroundColor: controlColors.brandPanel,
  },
  menuButtonPressed: { opacity: 0.82 },
  menuButtonText: { color: controlColors.sidebarTextStrong, fontWeight: '800' },
  brand: { gap: controlSpacing.xxs, paddingBottom: controlSpacing.sm },
  eyebrow: { color: controlColors.accentSoft, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  brandTitle: { color: controlColors.sidebarTextStrong, fontSize: 27, fontWeight: '800' },
  privateLabel: { ...controlType.small, color: controlColors.sidebarText },
  environmentBadge: {
    alignSelf: 'flex-start',
    marginTop: controlSpacing.xs,
    paddingHorizontal: controlSpacing.sm,
    paddingVertical: controlSpacing.xxs,
    borderWidth: 1,
    borderColor: controlColors.brandLine,
    borderRadius: controlRadii.pill,
    backgroundColor: controlColors.brandPanel,
  },
  environmentText: {
    color: controlColors.accentSoft,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  navigation: { flex: 1, gap: controlSpacing.lg },
  navigationCompact: { flex: 0 },
  navigationGroup: { gap: controlSpacing.xs },
  navigationGroupLabel: {
    color: controlColors.sidebarTextMuted,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '800',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  navigationItems: { gap: controlSpacing.xxs },
  navigationItem: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: controlSpacing.sm,
    paddingHorizontal: controlSpacing.sm,
    borderRadius: controlRadii.md,
  },
  navigationItemSelected: { backgroundColor: controlColors.brandPanel },
  navigationMarker: {
    width: 3,
    height: 18,
    borderRadius: controlRadii.pill,
    backgroundColor: 'transparent',
  },
  navigationMarkerSelected: { backgroundColor: controlColors.accentSoft },
  navigationText: { flex: 1, color: controlColors.sidebarText, fontWeight: '600' },
  navigationTextSelected: { color: controlColors.sidebarTextStrong, fontWeight: '800' },
  account: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: controlSpacing.sm,
    paddingTop: controlSpacing.lg,
    borderTopWidth: 1,
    borderTopColor: controlColors.brandLine,
  },
  accountCopy: { minWidth: 120, flex: 1, gap: controlSpacing.xxs },
  accountName: { color: controlColors.sidebarTextStrong, fontWeight: '700' },
  accountRole: { ...controlType.small, color: controlColors.sidebarTextMuted },
  signOut: {
    minHeight: controlLayout.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: controlSpacing.sm,
    borderRadius: controlRadii.sm,
  },
  signOutPressed: { backgroundColor: controlColors.brandPanel },
  signOutText: { color: controlColors.sidebarText, fontSize: 12, fontWeight: '700' },
  content: { flex: 1, minWidth: 0, minHeight: 0 },
});
