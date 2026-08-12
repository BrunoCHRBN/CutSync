import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RefreshCw, WifiOff } from 'lucide-react-native';
import { colors, typography } from '../../../theme/tokens';

export type DashboardSyncState = 'live' | 'syncing' | 'offline';

export const DashboardSyncIndicator = ({
  state,
  testID = 'admin-sync-indicator',
}: {
  state: DashboardSyncState;
  testID?: string;
}) => {
  if (state === 'live') {
    return (
      <View testID={testID} style={styles.row}>
        <View style={styles.liveDot} />
        <Text style={styles.text}>Ao vivo</Text>
      </View>
    );
  }
  if (state === 'syncing') {
    return (
      <View testID={testID} style={styles.row}>
        <RefreshCw color={colors.textMuted} size={13} />
        <Text style={styles.text}>Sincronizando…</Text>
      </View>
    );
  }
  return (
    <View testID={testID} style={styles.row}>
      <WifiOff color={colors.danger} size={13} />
      <Text style={[styles.text, styles.offline]}>Sem sincronização</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  text: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12 },
  offline: { color: colors.danger },
});
