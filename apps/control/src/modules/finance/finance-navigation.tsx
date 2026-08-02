import { Link, usePathname } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { CLOUD_ROUTES } from '@/navigation/cloud-routes';
import { cloudTheme } from '@/theme/cloud-components';

const items = [
  { href: CLOUD_ROUTES.financeiro.root, label: 'Visão geral', exact: true },
  { href: CLOUD_ROUTES.financeiro.cobrancas, label: 'Cobranças' },
  { href: CLOUD_ROUTES.financeiro.assinaturas, label: 'Assinaturas' },
  { href: CLOUD_ROUTES.financeiro.movimentacoes, label: 'Movimentações' },
  { href: CLOUD_ROUTES.financeiro.conciliacao, label: 'Conciliação' },
] as const;

export function FinanceNavigation() {
  const pathname = usePathname();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {items.map((item) => {
        const selected = 'exact' in item && item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href} asChild>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={StyleSheet.flatten([styles.tab, selected && styles.tabSelected])}
            >
              <Text style={[styles.label, selected && styles.labelSelected]}>{item.label}</Text>
            </Pressable>
          </Link>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: cloudTheme.spacing.xs, marginBottom: cloudTheme.spacing.md },
  tab: {
    minHeight: cloudTheme.layout.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: cloudTheme.spacing.md,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: cloudTheme.radii.md,
    backgroundColor: cloudTheme.colors.surface,
  },
  tabSelected: {
    borderColor: cloudTheme.colors.brand,
    backgroundColor: cloudTheme.colors.brandSoft,
  },
  label: { ...cloudTheme.type.button, color: cloudTheme.colors.textSecondary },
  labelSelected: { color: cloudTheme.colors.brand },
});
