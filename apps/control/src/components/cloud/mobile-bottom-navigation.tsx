import { Link, usePathname } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useControlAuth } from '@/contexts/control-auth-context';
import { CLOUD_ROUTES } from '@/navigation/cloud-routes';
import { modulesForSwitcher, resolveActiveNavModule } from '@/navigation/module-nav';
import { cloudTheme } from '@/theme/cloud-components';

export function MobileBottomNavigation() {
  const pathname = usePathname();
  const { can, context, signOut } = useControlAuth();
  const [profileOpen, setProfileOpen] = React.useState(false);
  const active = resolveActiveNavModule(pathname);
  const firstModule = modulesForSwitcher(can).find((module) => module.id !== 'central');

  const items = [
    {
      id: 'central',
      label: 'Central',
      href: CLOUD_ROUTES.central,
      selected: active.id === 'central',
    },
    {
      id: 'modules',
      label: 'Módulos',
      href: firstModule?.href ?? CLOUD_ROUTES.operacao.root,
      selected: active.id !== 'central' && !pathname.includes('/incidentes'),
    },
    {
      id: 'alerts',
      label: 'Alertas',
      href: CLOUD_ROUTES.operacao.incidentes,
      selected: pathname.includes('/incidentes'),
    },
  ] as const;

  return (
    <View style={styles.wrap}>
      {profileOpen ? (
        <View style={styles.profileSheet} accessibilityViewIsModal>
          <Text style={styles.profileName}>{context?.name ?? 'Operador'}</Text>
          <Text style={styles.profileRole}>{context?.role ?? 'Sessão'}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setProfileOpen(false);
              void signOut();
            }}
            style={({ pressed }) => [styles.profileAction, pressed && styles.pressed]}
          >
            <Text style={styles.profileActionText}>Encerrar sessão</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setProfileOpen(false)}
            style={({ pressed }) => [styles.profileDismiss, pressed && styles.pressed]}
          >
            <Text style={styles.profileDismissText}>Fechar</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.bar} accessibilityRole="tablist">
        {items.map((item) => (
          <Link key={item.id} href={item.href} asChild>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: item.selected }}
              onPress={() => setProfileOpen(false)}
              style={({ pressed }) => [
                styles.item,
                item.selected && styles.itemSelected,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.label, item.selected && styles.labelSelected]}>
                {item.label}
              </Text>
            </Pressable>
          </Link>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Abrir perfil"
          accessibilityState={{ expanded: profileOpen }}
          onPress={() => setProfileOpen((current) => !current)}
          style={({ pressed }) => [
            styles.item,
            profileOpen && styles.itemSelected,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.label, profileOpen && styles.labelSelected]}>Perfil</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: 1,
    borderTopColor: cloudTheme.colors.border,
    backgroundColor: cloudTheme.colors.surface,
  },
  profileSheet: {
    gap: cloudTheme.spacing.xs,
    paddingHorizontal: cloudTheme.spacing.lg,
    paddingTop: cloudTheme.spacing.md,
    paddingBottom: cloudTheme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
    backgroundColor: cloudTheme.colors.surfaceMuted,
  },
  profileName: { ...cloudTheme.type.smallStrong, color: cloudTheme.colors.text },
  profileRole: { ...cloudTheme.type.caption, color: cloudTheme.colors.textMuted },
  profileAction: {
    minHeight: cloudTheme.layout.touchTarget,
    justifyContent: 'center',
  },
  profileActionText: { ...cloudTheme.type.button, color: cloudTheme.colors.danger },
  profileDismiss: {
    minHeight: cloudTheme.layout.touchTarget,
    justifyContent: 'center',
  },
  profileDismissText: { ...cloudTheme.type.button, color: cloudTheme.colors.textSecondary },
  bar: {
    minHeight: cloudTheme.layout.bottomNavHeight,
    flexDirection: 'row',
    paddingBottom: 4,
  },
  item: {
    flex: 1,
    minHeight: cloudTheme.layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  itemSelected: { backgroundColor: cloudTheme.colors.brandSoft },
  label: { ...cloudTheme.type.caption, color: cloudTheme.colors.textSecondary },
  labelSelected: { color: cloudTheme.colors.brand, fontWeight: '800' },
  pressed: { opacity: 0.85 },
});
