import React from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';

import { CloudSidebar } from '@/components/cloud/cloud-sidebar';
import { CloudToastProvider } from '@/components/cloud/cloud-toast';
import { CloudTopbar } from '@/components/cloud/cloud-topbar';
import { MobileBottomNavigation } from '@/components/cloud/mobile-bottom-navigation';
import { getCloudEnvironmentLabel } from '@/navigation/environment-label';
import { cloudTheme } from '@/theme/cloud-components';

export function CloudShell({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const compact = width < cloudTheme.layout.compactBreakpoint;
  const environmentLabel = getCloudEnvironmentLabel();
  const bottomPad = compact
    ? cloudTheme.layout.bottomNavHeight + cloudTheme.spacing.xl
    : cloudTheme.spacing.xxl;

  const webContentStyle = {
    ...styles.content,
    paddingBottom: bottomPad,
    overflow: 'scroll',
    // RN Web scrollport extras (not in core ViewStyle).
    overflowY: 'auto',
    overscrollBehavior: 'contain',
  } as ViewStyle & {
    overflowY?: 'auto' | 'scroll';
    overscrollBehavior?: 'contain' | 'auto';
  };

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

          {Platform.OS === 'web' ? (
            <View style={webContentStyle}>{children}</View>
          ) : (
            <ScrollView
              style={styles.content}
              contentContainerStyle={[styles.contentContainer, { paddingBottom: bottomPad }]}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              {children}
            </ScrollView>
          )}
        </View>

        {compact ? <MobileBottomNavigation /> : null}
      </View>
    </CloudToastProvider>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    height: '100%',
    maxHeight: '100%',
    backgroundColor: cloudTheme.colors.canvas,
    overflow: 'hidden',
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 0,
    minWidth: 0,
  },
  bodyCompact: {
    flexDirection: 'column',
  },
  compactMenu: {
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.brandLine,
    backgroundColor: cloudTheme.colors.brandDark,
    maxHeight: '45%',
  },
  content: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  contentContainer: {
    flexGrow: 1,
  },
});
