import { Link, usePathname } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useControlAuth } from '@/contexts/control-auth-context';
import { CLOUD_ROUTES } from '@/navigation/cloud-routes';
import type { ControlPermission } from '@/types/control';
import { cloudTheme } from '@/theme/cloud-components';

type NavItem = {
  href: string;
  label: string;
  permission: ControlPermission | ControlPermission[];
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const navigationGroups: NavGroup[] = [
  {
    label: 'Central',
    items: [
      { href: CLOUD_ROUTES.central, label: 'Central', permission: 'control.dashboard.read' },
    ],
  },
  {
    label: 'Operação',
    items: [
      { href: CLOUD_ROUTES.operacao.root, label: 'Visão geral', permission: 'control.dashboard.read' },
      { href: CLOUD_ROUTES.operacao.tempoReal, label: 'Tempo real', permission: 'control.live.read' },
      {
        href: CLOUD_ROUTES.operacao.saudeDosDados,
        label: 'Saúde dos dados',
        permission: 'control.dashboard.read',
      },
      {
        href: CLOUD_ROUTES.operacao.incidentes,
        label: 'Incidentes',
        permission: 'control.dashboard.read',
      },
    ],
  },
  {
    label: 'Suporte',
    items: [
      { href: CLOUD_ROUTES.suporte.root, label: 'Fila', permission: 'control.support.read' },
    ],
  },
  {
    label: 'GSP',
    items: [
      { href: CLOUD_ROUTES.gsp.root, label: 'Governança', permission: 'control.governance.read' },
      { href: CLOUD_ROUTES.gsp.conhecimento, label: 'Conhecimento', permission: 'control.knowledge.read' },
      { href: CLOUD_ROUTES.gsp.acessos, label: 'Acessos', permission: 'control.access.manage' },
      { href: CLOUD_ROUTES.gsp.revisoes, label: 'Revisões', permission: 'control.governance.read' },
      { href: CLOUD_ROUTES.gsp.auditoria, label: 'Auditoria', permission: 'control.governance.read' },
      { href: CLOUD_ROUTES.gsp.politicas, label: 'Políticas', permission: 'control.governance.read' },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { href: CLOUD_ROUTES.financeiro.root, label: 'Visão geral', permission: 'control.billing.read' },
      { href: CLOUD_ROUTES.financeiro.cobrancas, label: 'Cobranças', permission: 'control.billing.read' },
      { href: CLOUD_ROUTES.financeiro.assinaturas, label: 'Assinaturas', permission: 'control.billing.read' },
      {
        href: CLOUD_ROUTES.financeiro.movimentacoes,
        label: 'Movimentações',
        permission: 'control.billing.read',
      },
      {
        href: CLOUD_ROUTES.financeiro.conciliacao,
        label: 'Conciliação',
        permission: 'control.billing.read',
      },
    ],
  },
];

function canAccess(
  can: (permission: ControlPermission) => boolean,
  permission: ControlPermission | ControlPermission[],
) {
  return Array.isArray(permission) ? permission.some((item) => can(item)) : can(permission);
}

function isSelected(pathname: string, href: string) {
  if (href === CLOUD_ROUTES.central) return pathname === href;
  if (href === CLOUD_ROUTES.operacao.root) {
    return pathname === href || pathname === `${href}/`;
  }
  if (href === CLOUD_ROUTES.financeiro.root) {
    return pathname === href || pathname === `${href}/`;
  }
  if (href === CLOUD_ROUTES.gsp.root) {
    return pathname === href || pathname === `${href}/`;
  }
  if (href === CLOUD_ROUTES.suporte.root) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }
  return pathname === href || pathname.startsWith(`${href}/`) || pathname.startsWith(href);
}

export function CloudSidebar({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { can } = useControlAuth();
  const visibleGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccess(can, item.permission)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <View style={[styles.navigation, compact && styles.navigationCompact]}>
      {visibleGroups.map((group) => (
        <View key={group.label} style={styles.group}>
          <Text style={styles.groupLabel}>{group.label}</Text>
          <View style={styles.items}>
            {group.items.map((item) => {
              const selected = isSelected(pathname, item.href);
              return (
                <Link key={item.href} href={item.href} asChild>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityState={{ selected }}
                    onPress={onNavigate}
                    style={StyleSheet.flatten([
                      styles.item,
                      selected && styles.itemSelected,
                    ])}
                  >
                    <View style={[styles.marker, selected && styles.markerSelected]} />
                    <Text style={[styles.itemText, selected && styles.itemTextSelected]}>
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
}

const styles = StyleSheet.create({
  navigation: { flex: 1, gap: cloudTheme.spacing.lg },
  navigationCompact: { flex: 0 },
  group: { gap: cloudTheme.spacing.xs },
  groupLabel: {
    color: cloudTheme.colors.sidebarTextMuted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  items: { gap: cloudTheme.spacing.xxs },
  item: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: cloudTheme.spacing.sm,
    paddingHorizontal: cloudTheme.spacing.sm,
    borderRadius: cloudTheme.radii.md,
  },
  itemSelected: { backgroundColor: cloudTheme.colors.brandPanel },
  marker: {
    width: 3,
    height: 18,
    borderRadius: cloudTheme.radii.pill,
    backgroundColor: 'transparent',
  },
  markerSelected: { backgroundColor: cloudTheme.colors.accentSoft },
  itemText: { flex: 1, color: cloudTheme.colors.sidebarText, fontWeight: '600' },
  itemTextSelected: { color: cloudTheme.colors.sidebarTextStrong, fontWeight: '800' },
});
