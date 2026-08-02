import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { CloudSidebar } from '@/components/cloud/cloud-sidebar';
import { CloudToastProvider } from '@/components/cloud/cloud-toast';
import { CloudTopbar } from '@/components/cloud/cloud-topbar';
import { MobileBottomNavigation } from '@/components/cloud/mobile-bottom-navigation';
import { cloudTheme } from '@/theme/cloud-components';

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
  return process.env.NODE_ENV === 'production' ? 'PRODUÇÃO' : 'DESENVOLVIMENTO';
}

export function CloudShell({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const compact = width < cloudTheme.layout.compactBreakpoint;
  const environmentLabel = getEnvironmentLabel();

  return (
    <CloudToastProvider>
      <View style={styles.app}>
        <CloudTopbar
          environmentLabel={environmentLabel}
          menuOpen={menuOpen}
          onToggleMenu={() => setMenuOpen((current) => !current)}
          showMenuButton={compact}
          onNavigate={() => setMenuOpen(false)}
        />

        <View style={[styles.body, compact && styles.bodyCompact]}>
          {!compact ? (
            <CloudSidebar />
          ) : menuOpen ? (
            <View style={styles.compactMenu}>
              <CloudSidebar compact onNavigate={() => setMenuOpen(false)} />
            </View>
          ) : null}

          <View style={[styles.content, compact && styles.contentCompact]}>
            {children}
          </View>
        </View>

        {compact ? <MobileBottomNavigation /> : null}
      </View>
    </CloudToastProvider>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: cloudTheme.colors.canvas,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 0,
  },
  bodyCompact: {
    flexDirection: 'column',
  },
  compactMenu: {
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.brandLine,
    backgroundColor: cloudTheme.colors.brandDark,
  },
  content: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  contentCompact: {
    paddingBottom: cloudTheme.layout.bottomNavHeight + cloudTheme.spacing.sm,
  },
});
