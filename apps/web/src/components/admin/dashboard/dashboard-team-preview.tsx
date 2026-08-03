import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { colors, radii, typography } from '../../../theme/tokens';

export interface DashboardTeamMemberPreview {
  id: string;
  name: string;
  completedCount: number;
  occupancyRate: number;
  production: string;
}

export const DashboardTeamPreview = ({
  members,
  currencyLabel,
  onOpenReports,
  testID = 'admin-team-performance-panel',
}: {
  members: DashboardTeamMemberPreview[];
  currencyLabel: (id: string) => string;
  onOpenReports: () => void;
  testID?: string;
}) => (
  <View testID={testID} style={styles.wrap}>
    <View style={styles.header}>
      <Text style={styles.title}>Equipe hoje</Text>
      <Pressable testID="admin-open-reports-button" onPress={onOpenReports} style={styles.link}>
        <Text style={styles.linkText}>Relatórios</Text>
        <ChevronRight color={colors.textSecondary} size={14} />
      </Pressable>
    </View>
    {members.length ? (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {members.map((member) => (
          <View key={member.id} testID={`admin-team-performance-${member.id}`} style={styles.chip}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{member.name.charAt(0).toUpperCase()}</Text></View>
            <View style={styles.copy}>
              <Text style={styles.name} numberOfLines={1}>{member.name}</Text>
              <Text testID={`admin-team-performance-${member.id}-summary`} style={styles.meta} numberOfLines={1}>
                {member.completedCount} concl. · {member.occupancyRate.toFixed(0)}%
              </Text>
              <Text testID={`admin-team-performance-${member.id}-gross`} style={styles.value}>{currencyLabel(member.id)}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    ) : (
      <Text testID="admin-team-performance-empty" style={styles.empty}>Nenhum profissional vinculado.</Text>
    )}
  </View>
);

const styles = StyleSheet.create({
  wrap: { gap: 10, marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11, textTransform: 'uppercase' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  linkText: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 12 },
  row: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  chip: {
    minWidth: 170,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
  },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSecondarySoft },
  avatarText: { color: colors.brandPrimary, fontFamily: typography.bodyStrong, fontSize: 12 },
  copy: { flex: 1, minWidth: 0 },
  name: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12 },
  meta: { color: colors.textMuted, fontFamily: typography.body, fontSize: 10, marginTop: 2 },
  value: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11, marginTop: 2 },
  empty: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12 },
});
