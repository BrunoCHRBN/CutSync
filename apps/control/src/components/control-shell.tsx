import { Link, usePathname } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useControlAuth } from '@/contexts/control-auth-context';
import type { ControlPermission } from '@/types/control';

interface NavigationItem {
  href: '/' | '/live' | '/support' | '/billing' | '/governance' | '/knowledge' | '/access';
  label: string;
  permission: ControlPermission;
}

const navigation: NavigationItem[] = [
  { href: '/', label: 'Visão geral', permission: 'control.dashboard.read' },
  { href: '/live', label: 'Tempo real', permission: 'control.live.read' },
  { href: '/support', label: 'Suporte', permission: 'control.support.read' },
  { href: '/billing', label: 'Cobrança', permission: 'control.billing.manage' },
  { href: '/governance', label: 'Governança', permission: 'control.governance.read' },
  { href: '/knowledge', label: 'Conhecimento', permission: 'control.knowledge.read' },
  { href: '/access', label: 'Acessos', permission: 'control.access.manage' },
];

export function ControlShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const { context, can, signOut } = useControlAuth();
  const compact = width < 900;

  return (
    <View style={[styles.app, compact && styles.appCompact]}>
      <View style={[styles.sidebar, compact && styles.sidebarCompact]}>
        <View style={[styles.brand, compact && styles.brandCompact]}>
          <Text style={styles.eyebrow}>CUTSYNC</Text>
          <Text style={styles.brandTitle}>Control</Text>
          <Text style={styles.privateLabel}>Ambiente privado</Text>
        </View>

        <View style={[styles.navigation, compact && styles.navigationCompact]}>
          {navigation.filter((item) => can(item.permission)).map((item) => {
            const selected = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} asChild>
                <Pressable
                  style={StyleSheet.flatten([
                    styles.navigationItem,
                    selected && styles.navigationItemSelected,
                  ])}
                >
                  <Text style={[styles.navigationText, selected && styles.navigationTextSelected]}>
                    {item.label}
                  </Text>
                </Pressable>
              </Link>
            );
          })}
        </View>

        <View style={[styles.account, compact && styles.accountCompact]}>
          <Text numberOfLines={1} style={styles.accountName}>{context?.name}</Text>
          <Text style={styles.accountRole}>{context?.role}</Text>
          <Pressable accessibilityRole="button" onPress={() => { void signOut(); }} style={styles.signOut}>
            <Text style={styles.signOutText}>Encerrar sessão</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, flexDirection: 'row', backgroundColor: '#f3f5f1' },
  appCompact: { flexDirection: 'column' },
  sidebar: {
    width: 248,
    padding: 22,
    borderRightWidth: 1,
    borderRightColor: '#dce2dc',
    backgroundColor: '#12271c',
  },
  sidebarCompact: {
    width: '100%',
    padding: 14,
    borderRightWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#31503d',
  },
  brand: { gap: 3, marginBottom: 28 },
  brandCompact: { marginBottom: 12 },
  eyebrow: { color: '#83c7a0', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  brandTitle: { color: '#ffffff', fontSize: 27, fontWeight: '800' },
  privateLabel: { color: '#aebdb3', fontSize: 12 },
  navigation: { flex: 1, gap: 5 },
  navigationCompact: { flex: 0, flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  navigationItem: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 9 },
  navigationItemSelected: { backgroundColor: '#27523b' },
  navigationText: { color: '#b8c6bc', fontWeight: '600' },
  navigationTextSelected: { color: '#ffffff' },
  account: { gap: 4, paddingTop: 18, borderTopWidth: 1, borderTopColor: '#31503d' },
  accountCompact: { paddingTop: 10 },
  accountName: { color: '#ffffff', fontWeight: '700' },
  accountRole: { color: '#9fb2a5', fontSize: 12 },
  signOut: { minHeight: 38, justifyContent: 'center', marginTop: 8 },
  signOutText: { color: '#dce7df', fontWeight: '600' },
  content: { flex: 1, minWidth: 0 },
});
