import { Link, usePathname } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useControlAuth } from '@/contexts/control-auth-context';
import { CLOUD_ROUTES, type CloudRoutePath } from '@/navigation/cloud-routes';
import { controlColors, controlRadii, controlSpacing, controlType } from '@/theme/tokens';
import type { ControlPermission } from '@/types/control';

const items: readonly {
  label: string;
  href: CloudRoutePath;
  permission: ControlPermission;
}[] = [
  { label: 'Diretório', href: CLOUD_ROUTES.gsp.acessos, permission: 'control.access.manage' },
  { label: 'Solicitar acesso', href: CLOUD_ROUTES.gsp.solicitarAcesso, permission: 'control.access.request' },
  { label: 'Minhas solicitações', href: CLOUD_ROUTES.gsp.minhasSolicitacoes, permission: 'control.access.request' },
  { label: 'Aprovações', href: CLOUD_ROUTES.gsp.aprovacoes, permission: 'control.access.approve' },
  { label: 'Aplicação', href: CLOUD_ROUTES.gsp.aplicacao, permission: 'control.access.apply' },
] as const;

export function AccessWorkflowNavigation() {
  const pathname = usePathname();
  const { can } = useControlAuth();

  return (
    <View accessibilityRole="tablist" style={styles.navigation}>
      {items.filter((item) => can(item.permission)).map((item) => {
        const selected = pathname === item.href;
        return (
          <Link key={item.href} href={item.href} asChild>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.item,
                selected && styles.itemSelected,
                pressed && styles.itemPressed,
              ]}
            >
              <Text style={[styles.label, selected && styles.labelSelected]}>{item.label}</Text>
            </Pressable>
          </Link>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  navigation: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: controlSpacing.xs,
    padding: controlSpacing.xs,
    borderWidth: 1,
    borderColor: controlColors.border,
    borderRadius: controlRadii.lg,
    backgroundColor: controlColors.surfaceMuted,
  },
  item: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: controlSpacing.md,
    borderRadius: controlRadii.md,
  },
  itemSelected: { backgroundColor: controlColors.surface },
  itemPressed: { opacity: 0.78 },
  label: { ...controlType.smallStrong, color: controlColors.textSecondary },
  labelSelected: { color: controlColors.brand },
});
