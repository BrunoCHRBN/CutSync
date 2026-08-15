import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { WalkInChoice } from '@/components/appointments/walk-in-choice';
import { BusinessNotice } from '@/components/ui/business-ui';
import { businessTheme } from '@/theme/business-theme';

export interface WalkInSelectionOption { id: string; label: string; meta?: string }

interface WalkInSelectionStepProps {
  testID: string;
  options: WalkInSelectionOption[];
  selectedId: string;
  isLoading?: boolean;
  error?: boolean;
  emptyMessage: string;
  onSelect: (id: string) => void;
}

export function WalkInSelectionStep(props: WalkInSelectionStepProps) {
  if (props.isLoading) {
    return <ActivityIndicator testID={`${props.testID}-loading`} color={businessTheme.colors.accentStrong} />;
  }
  if (props.error) {
    return <BusinessNotice testID={`${props.testID}-error`} tone="danger" message="Não foi possível carregar estas opções agora." />;
  }
  if (props.options.length === 0) {
    return <BusinessNotice testID={`${props.testID}-empty`} message={props.emptyMessage} />;
  }
  return (
    <View testID={props.testID} accessibilityRole="radiogroup" style={styles.list}>
      {props.options.map((option) => (
        <WalkInChoice
          key={option.id}
          testID={`${props.testID}-${option.id}`}
          label={option.label}
          meta={option.meta}
          selected={props.selectedId === option.id}
          onPress={() => props.onSelect(option.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ list: { gap: businessTheme.spacing.xs } });