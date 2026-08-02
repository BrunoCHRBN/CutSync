import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { CloudSidebar } from '@/components/cloud/cloud-sidebar';
import { CloudToastProvider } from '@/components/cloud/cloud-toast';
import { CloudTopbar } from '@/components/cloud/cloud-topbar';
import { useControlAuth } from '@/contexts/control-auth-context';
import { cloudTheme } from '@/theme/cloud-components';

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

  const supabaseUrlKey = ['EXPO', 'PUBLIC', 'SUPABASE', 'URL'].join('_');
  const supabaseUrl = process.env[supabaseUrlKey]?.toLowerCase() ?? '';
  if (supabaseUrl.includes('localhost') || supabaseUrl.includes('127.0.0.1')) return 'LOCAL';
  return process.env.NODE_ENV === 'production' ? 'PRODUÇÃO' : 'DESENVOLVIMENTO';
}

export function CloudShell({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const { context, signOut } = useControlAuth();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const compact = width < cloudTheme.layout.compactBreakpoint;
  const environmentLabel = getEnvironmentLabel();

  const account = (
    <View style={styles.account}>
      <View style={styles.accountCopy}>
        <Text numberOfLines={1} style={styles.accountName}>{context?.name}</Text>
        <Text style={styles.accountRole}>
          {context ? roleLabels[context.role] : 'Acesso privado'}
        </Text>
      </View>
      <Pressable
        accessibilityLabel="Encerrar sessão do CutSync Cloud"
        accessibilityRole="button"
        onPress={() => { void signOut(); }}
        style={({ pressed }) => [styles.signOut, pressed && styles.signOutPressed]}
      >
        <Text style={styles.signOutText}>Encerrar sessão</Text>
      </Pressable>
    </View>
  );

  return (
    <CloudToastProvider>
      <View style={[styles.app, compact && styles.appCompact]}>
        {compact ? (
          <View style={styles.compactShell}>
            <CloudTopbar
              environmentLabel={environmentLabel}
              menuOpen={menuOpen}
              onToggleMenu={() => setMenuOpen((current) => !current)}
              showMenuButton
            />
            {menuOpen ? (
              <View style={styles.compactMenu}>
                <CloudSidebar compact onNavigate={() => setMenuOpen(false)} />
                {account}
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.sidebar}>
            <View style={styles.brand}>
              <Text style={styles.eyebrow}>CUTSYNC</Text>
              <Text style={styles.brandTitle}>Cloud</Text>
              <Text style={styles.privateLabel}>Workspace interno</Text>
              <View style={styles.environmentBadge}>
                <Text style={styles.environmentText}>{environmentLabel}</Text>
              </View>
            </View>
            <CloudSidebar />
            {account}
          </View>
        )}

        <View style={styles.main}>
          {!compact ? (
            <CloudTopbar
              environmentLabel={environmentLabel}
              menuOpen={false}
              onToggleMenu={() => undefined}
              showMenuButton={false}
            />
          ) : null}
          <View style={styles.content}>{children}</View>
        </View>
      </View>
    </CloudToastProvider>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, flexDirection: 'row', backgroundColor: cloudTheme.colors.canvas },
  appCompact: { flexDirection: 'column' },
  sidebar: {
    width: cloudTheme.layout.sidebarWidth,
    gap: cloudTheme.spacing.lg,
    padding: cloudTheme.spacing.xl,
    borderRightWidth: 1,
    borderRightColor: cloudTheme.colors.brandLine,
    backgroundColor: cloudTheme.colors.brandDark,
  },
  compactShell: {
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.brandLine,
    backgroundColor: cloudTheme.colors.brandDark,
  },
  compactMenu: {
    gap: cloudTheme.spacing.lg,
    paddingHorizontal: cloudTheme.spacing.lg,
    paddingBottom: cloudTheme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: cloudTheme.colors.brandLine,
  },
  brand: { gap: cloudTheme.spacing.xxs, paddingBottom: cloudTheme.spacing.sm },
  eyebrow: {
    color: cloudTheme.colors.accentSoft,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
  },
  brandTitle: { color: cloudTheme.colors.sidebarTextStrong, fontSize: 27, fontWeight: '800' },
  privateLabel: { ...cloudTheme.type.small, color: cloudTheme.colors.sidebarText },
  environmentBadge: {
    alignSelf: 'flex-start',
    marginTop: cloudTheme.spacing.xs,
    paddingHorizontal: cloudTheme.spacing.sm,
    paddingVertical: cloudTheme.spacing.xxs,
    borderWidth: 1,
    borderColor: cloudTheme.colors.brandLine,
    borderRadius: cloudTheme.radii.pill,
    backgroundColor: cloudTheme.colors.brandPanel,
  },
  environmentText: {
    color: cloudTheme.colors.accentSoft,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  account: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: cloudTheme.spacing.sm,
    paddingTop: cloudTheme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: cloudTheme.colors.brandLine,
  },
  accountCopy: { minWidth: 120, flex: 1, gap: cloudTheme.spacing.xxs },
  accountName: { color: cloudTheme.colors.sidebarTextStrong, fontWeight: '700' },
  accountRole: { ...cloudTheme.type.small, color: cloudTheme.colors.sidebarTextMuted },
  signOut: {
    minHeight: cloudTheme.layout.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: cloudTheme.spacing.sm,
    borderRadius: cloudTheme.radii.sm,
  },
  signOutPressed: { backgroundColor: cloudTheme.colors.brandPanel },
  signOutText: { color: cloudTheme.colors.sidebarText, fontSize: 12, fontWeight: '700' },
  main: { flex: 1, minWidth: 0, minHeight: 0 },
  content: { flex: 1, minWidth: 0, minHeight: 0 },
});
