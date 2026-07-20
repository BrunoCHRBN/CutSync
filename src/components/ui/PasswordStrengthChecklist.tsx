import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Check, Circle } from 'lucide-react-native';
import { PASSWORD_RULES } from '../../utils/passwordPolicy';
import { colors, radii, typography } from '../../theme/tokens';

interface PasswordStrengthChecklistProps {
  password: string;
  testID: string;
}

export const PasswordStrengthChecklist = ({ password, testID }: PasswordStrengthChecklistProps) => (
  <View testID={testID} accessibilityLiveRegion="polite" style={styles.container}>
    <Text testID={`${testID}-title`} style={styles.title}>Sua senha precisa ter</Text>
    <View style={styles.grid}>
      {PASSWORD_RULES.map((rule) => {
        const met = rule.isMet(password);
        return (
          <View key={rule.id} testID={`${testID}-item-${rule.id}`} style={styles.item}>
            {met ? <Check color={colors.success} size={15} strokeWidth={2.4} /> : <Circle color={colors.textMuted} size={13} />}
            <Text style={[styles.label, met && styles.labelMet]}>{rule.label}</Text>
          </View>
        );
      })}
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surfaceRaised, padding: 16 },
  title: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  item: { width: '47%', minWidth: 170, flexDirection: 'row', alignItems: 'center', gap: 7 },
  label: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11 },
  labelMet: { color: colors.success, fontFamily: typography.bodyStrong },
});
