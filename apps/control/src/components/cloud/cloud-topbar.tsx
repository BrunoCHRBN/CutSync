import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';

import { GlobalSearch } from '@/components/cloud/global-search';
import { ModuleSwitcher } from '@/components/cloud/module-switcher';
import { useControlAuth } from '@/contexts/control-auth-context';
import {
  loadCloudActionableAlerts,
  type CloudAlertSummary,
} from '@/modules/central/central-alerts';
import { CLOUD_ROUTES } from '@/navigation/cloud-routes';
import { cloudTheme } from '@/theme/cloud-components';

const roleLabels = {
  SaaS_Viewer: 'Visualizador',
  SaaS_Editor: 'Editor',
  SaaS_Owner: 'Proprietário',
} as const;

export function CloudTopbar({
  environmentLabel,
  menuOpen,
  onToggleMenu,
  showMenuButton,
  onNavigate,
}: {
  environmentLabel: string;
  menuOpen: boolean;
  onToggleMenu: () => void;
  showMenuButton: boolean;
  onNavigate?: () => void;
}) {
  const { context, can, signOut } = useControlAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [alerts, setAlerts] = useState<CloudAlertSummary | null>(null);

  const refreshAlerts = useCallback(async () => {
    try {
      setAlerts(await loadCloudActionableAlerts(can));
    } catch {
      setAlerts(null);
    }
  }, [can]);

  useEffect(() => {
    void refreshAlerts();
  }, [refreshAlerts]);

  const alertTotal = alerts?.total ?? 0;
  const alertHref = alerts?.alerts[0]?.href ?? CLOUD_ROUTES.central;

  return (
    <View style={styles.bar}>
      <View style={styles.brandBlock} accessibilityRole="header">
        <Text style={styles.brandMark}>CUTSYNC</Text>
        <Text style={styles.brandProduct}>Cloud</Text>
      </View>

      <View style={styles.switcher}>
        <ModuleSwitcher
          onNavigate={onNavigate}
          alertCounts={alerts?.byArea}
        />
      </View>

      <View style={styles.search}>
        <GlobalSearch
          placeholder="Buscar em todo o CutSync Cloud"
          onNavigate={onNavigate}
        />
      </View>

      <View style={styles.meta}>
        <View style={styles.envBadge}>
          <Text style={styles.envDot}>●</Text>
          <Text style={styles.envText}>{environmentLabel}</Text>
        </View>
        <Link href={alertHref as never} asChild>
          <Pressable
            accessibilityLabel={
              alertTotal > 0
                ? `Alertas, ${alertTotal} avisos acionáveis`
                : 'Alertas'
            }
            accessibilityRole="link"
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Text style={styles.iconButtonText}>Alertas</Text>
            {alertTotal > 0 ? (
              <View style={styles.alertBadge}>
                <Text style={styles.alertBadgeText}>
                  {alertTotal > 99 ? '99+' : String(alertTotal)}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </Link>
        <View>
          <Pressable
            accessibilityLabel="Menu do perfil"
            accessibilityRole="button"
            accessibilityState={{ expanded: profileOpen }}
            onPress={() => setProfileOpen((current) => !current)}
            style={({ pressed }) => [styles.profileButton, pressed && styles.pressed]}
          >
            <Text numberOfLines={1} style={styles.profileName}>
              {context?.name ?? 'Operador'}
            </Text>
            <Text style={styles.profileRole}>
              {context ? roleLabels[context.role] : 'Sessão'}
            </Text>
          </Pressable>
          {profileOpen ? (
            <View style={styles.profileMenu}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setProfileOpen(false);
                  void signOut();
                }}
                style={({ pressed }) => [styles.profileMenuItem, pressed && styles.pressed]}
              >
                <Text style={styles.profileMenuText}>Encerrar sessão</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
        {showMenuButton ? (
          <Pressable
            accessibilityLabel={menuOpen ? 'Fechar menu do módulo' : 'Abrir menu do módulo'}
            accessibilityRole="button"
            accessibilityState={{ expanded: menuOpen }}
            onPress={onToggleMenu}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Text style={styles.iconButtonText}>{menuOpen ? 'Fechar' : 'Menu'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: cloudTheme.layout.topbarHeight,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: cloudTheme.spacing.md,
    paddingHorizontal: cloudTheme.spacing.lg,
    paddingVertical: cloudTheme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
    backgroundColor: cloudTheme.colors.surface,
  },
  brandBlock: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    minWidth: 120,
  },
  brandMark: {
    color: cloudTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  brandProduct: {
    color: cloudTheme.colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  switcher: { minWidth: 148, maxWidth: 220 },
  search: { flexGrow: 1, minWidth: 200, maxWidth: 520 },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: cloudTheme.spacing.xs,
  },
  envBadge: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: cloudTheme.spacing.sm,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: cloudTheme.radii.pill,
    backgroundColor: cloudTheme.colors.surfaceMuted,
  },
  envDot: { color: cloudTheme.colors.success, fontSize: 10 },
  envText: {
    color: cloudTheme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  iconButton: {
    position: 'relative',
    minHeight: cloudTheme.layout.touchTarget,
    minWidth: cloudTheme.layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: cloudTheme.spacing.sm,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: cloudTheme.radii.md,
    backgroundColor: cloudTheme.colors.surface,
  },
  iconButtonText: { ...cloudTheme.type.caption, color: cloudTheme.colors.text },
  alertBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    backgroundColor: cloudTheme.colors.danger,
  },
  alertBadgeText: {
    color: cloudTheme.colors.surface,
    fontSize: 10,
    fontWeight: '800',
  },
  profileButton: {
    minHeight: cloudTheme.layout.touchTarget,
    minWidth: 120,
    justifyContent: 'center',
    paddingHorizontal: cloudTheme.spacing.sm,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: cloudTheme.radii.md,
    backgroundColor: cloudTheme.colors.surface,
  },
  profileName: { ...cloudTheme.type.smallStrong, color: cloudTheme.colors.text },
  profileRole: { ...cloudTheme.type.caption, color: cloudTheme.colors.textMuted },
  profileMenu: {
    position: 'absolute',
    right: 0,
    top: 52,
    zIndex: 20,
    minWidth: 180,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: cloudTheme.radii.md,
    backgroundColor: cloudTheme.colors.surfaceRaised,
    padding: cloudTheme.spacing.xs,
  },
  profileMenuItem: {
    minHeight: cloudTheme.layout.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: cloudTheme.spacing.sm,
    borderRadius: cloudTheme.radii.sm,
  },
  profileMenuText: { ...cloudTheme.type.smallStrong, color: cloudTheme.colors.danger },
  pressed: { opacity: 0.85 },
});
