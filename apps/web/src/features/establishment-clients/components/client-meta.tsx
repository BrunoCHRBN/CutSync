import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, typeScale } from '../../../theme/tokens';
import {
  CONSENT_LABELS,
  LINK_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  type EstablishmentClient,
} from '../types/establishment-client';

export const ClientMetaPills = ({ client }: { client: EstablishmentClient }) => (
  <View style={styles.row}>
    <Text style={styles.pill}>{STATUS_LABELS[client.status]}</Text>
    <Text style={styles.pill}>{SOURCE_LABELS[client.source] ?? client.source}</Text>
    <Text style={styles.pill}>{CONSENT_LABELS[client.marketingConsentStatus]}</Text>
    <Text style={styles.pill}>{LINK_LABELS[client.linkStatus]}</Text>
  </View>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    ...typeScale.small,
    color: colors.textMuted,
    backgroundColor: colors.canvasSoft,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});
