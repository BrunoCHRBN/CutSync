import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
  View,
} from 'react-native';

import {
  controlColors,
  controlLayout,
  controlRadii,
  controlSpacing,
  controlType,
} from '@/theme/tokens';

export type ControlTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface ControlCardProps {
  children: React.ReactNode;
  tone?: ControlTone;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ControlCard({
  children,
  tone = 'neutral',
  style,
  testID,
}: ControlCardProps) {
  return (
    <View
      style={[
        styles.card,
        tone === 'info' && styles.cardInfo,
        tone === 'success' && styles.cardSuccess,
        tone === 'warning' && styles.cardWarning,
        tone === 'danger' && styles.cardDanger,
        style,
      ]}
      testID={testID}
    >
      {children}
    </View>
  );
}

export type ControlButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';

export interface ControlButtonProps {
  label: string;
  onPress: () => void;
  variant?: ControlButtonVariant;
  disabled?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const buttonVariantStyles: Record<ControlButtonVariant, ViewStyle> = {
  primary: {
    borderColor: controlColors.brand,
    backgroundColor: controlColors.brand,
  },
  secondary: {
    borderColor: controlColors.borderStrong,
    backgroundColor: controlColors.surface,
  },
  outline: {
    borderColor: controlColors.brand,
    backgroundColor: 'transparent',
  },
  danger: {
    borderColor: controlColors.danger,
    backgroundColor: controlColors.danger,
  },
  ghost: {
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
};

const buttonTextVariantStyles: Record<ControlButtonVariant, TextStyle> = {
  primary: { color: controlColors.surface },
  secondary: { color: controlColors.brand },
  outline: { color: controlColors.brand },
  danger: { color: controlColors.surface },
  ghost: { color: controlColors.textSecondary },
};

export function ControlButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  accessibilityLabel,
  style,
  testID,
}: ControlButtonProps) {
  const unavailable = disabled || busy;
  const indicatorColor = variant === 'secondary' || variant === 'outline' || variant === 'ghost'
    ? controlColors.brand
    : controlColors.surface;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: unavailable }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        buttonVariantStyles[variant],
        pressed && !unavailable && styles.buttonPressed,
        unavailable && styles.disabled,
        style,
      ]}
      testID={testID}
    >
      {busy ? <ActivityIndicator color={indicatorColor} size="small" /> : null}
      <Text style={[styles.buttonText, buttonTextVariantStyles[variant]]}>{label}</Text>
    </Pressable>
  );
}

export interface ControlFieldProps extends TextInputProps {
  label: string;
  helper?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export function ControlField({
  label,
  helper,
  error,
  containerStyle,
  style,
  ...inputProps
}: ControlFieldProps) {
  return (
    <View style={[styles.field, containerStyle]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...inputProps}
        accessibilityLabel={inputProps.accessibilityLabel ?? label}
        accessibilityState={{ ...inputProps.accessibilityState, disabled: inputProps.editable === false }}
        style={[
          styles.input,
          inputProps.multiline && styles.inputMultiline,
          error && styles.inputError,
          style,
        ]}
      />
      {error ? (
        <Text accessibilityRole="alert" selectable style={styles.fieldError}>{error}</Text>
      ) : helper ? (
        <Text style={styles.fieldHelper}>{helper}</Text>
      ) : null}
    </View>
  );
}

export interface ControlNoticeAction {
  label: string;
  onPress: () => void;
}

export interface ControlNoticeProps {
  title?: string;
  message: string;
  tone?: Exclude<ControlTone, 'neutral'>;
  action?: ControlNoticeAction;
  testID?: string;
}

export function ControlNotice({
  title,
  message,
  tone = 'info',
  action,
  testID,
}: ControlNoticeProps) {
  return (
    <ControlCard tone={tone} style={styles.notice} testID={testID}>
      <View style={styles.noticeCopy}>
        {title ? <Text style={styles.noticeTitle}>{title}</Text> : null}
        <Text accessibilityRole={tone === 'danger' ? 'alert' : undefined} selectable style={styles.noticeMessage}>
          {message}
        </Text>
      </View>
      {action ? (
        <ControlButton label={action.label} onPress={action.onPress} variant="secondary" />
      ) : null}
    </ControlCard>
  );
}

export interface ControlMetricCardProps {
  label: string;
  value: string | number;
  detail?: string;
  tone?: ControlTone;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ControlMetricCard({
  label,
  value,
  detail,
  tone = 'neutral',
  style,
  testID,
}: ControlMetricCardProps) {
  const displayValue = typeof value === 'number' ? value.toLocaleString('pt-BR') : value;

  return (
    <ControlCard tone={tone} style={[styles.metricCard, style]} testID={testID}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text
        selectable
        style={[
          styles.metricValue,
          tone === 'warning' && styles.metricValueWarning,
          tone === 'danger' && styles.metricValueDanger,
        ]}
      >
        {displayValue}
      </Text>
      {detail ? <Text style={styles.metricDetail}>{detail}</Text> : null}
    </ControlCard>
  );
}

export interface ControlStatusBadgeProps {
  label: string;
  tone?: ControlTone;
  testID?: string;
}

export function ControlStatusBadge({
  label,
  tone = 'neutral',
  testID,
}: ControlStatusBadgeProps) {
  return (
    <View
      style={[
        styles.badge,
        tone === 'info' && styles.badgeInfo,
        tone === 'success' && styles.badgeSuccess,
        tone === 'warning' && styles.badgeWarning,
        tone === 'danger' && styles.badgeDanger,
      ]}
      testID={testID}
    >
      <Text
        style={[
          styles.badgeText,
          tone === 'info' && styles.badgeTextInfo,
          tone === 'success' && styles.badgeTextSuccess,
          tone === 'warning' && styles.badgeTextWarning,
          tone === 'danger' && styles.badgeTextDanger,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export interface ControlEmptyStateProps {
  title: string;
  description: string;
  action?: ControlNoticeAction;
  testID?: string;
}

export function ControlEmptyState({
  title,
  description,
  action,
  testID,
}: ControlEmptyStateProps) {
  return (
    <ControlCard style={styles.emptyState} testID={testID}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
      {action ? <ControlButton label={action.label} onPress={action.onPress} variant="secondary" /> : null}
    </ControlCard>
  );
}

export interface ControlConfirmPanelProps {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  cancelLabel?: string;
  busy?: boolean;
  tone?: 'default' | 'warning' | 'danger';
  children?: React.ReactNode;
  testID?: string;
}

export function ControlConfirmPanel({
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  cancelLabel = 'Cancelar',
  busy = false,
  tone = 'default',
  children,
  testID,
}: ControlConfirmPanelProps) {
  const panelTone = tone === 'default' ? 'neutral' : tone;
  const badgeTone = tone === 'default' ? 'info' : tone;

  return (
    <ControlCard tone={panelTone} style={styles.confirmPanel} testID={testID}>
      <View style={styles.confirmCopy}>
        <ControlStatusBadge
          label={tone === 'danger' ? 'AÇÃO CRÍTICA' : 'CONFIRMAÇÃO NECESSÁRIA'}
          tone={badgeTone}
        />
        <Text style={styles.confirmTitle}>{title}</Text>
        <Text selectable style={styles.confirmDescription}>{description}</Text>
      </View>
      {children}
      <View style={styles.confirmActions}>
        <ControlButton
          disabled={busy}
          label={cancelLabel}
          onPress={onCancel}
          variant="secondary"
        />
        <ControlButton
          busy={busy}
          label={confirmLabel}
          onPress={onConfirm}
          variant={tone === 'danger' ? 'danger' : 'primary'}
        />
      </View>
    </ControlCard>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    gap: controlSpacing.md,
    padding: controlSpacing.lg,
    borderWidth: 1,
    borderColor: controlColors.border,
    borderRadius: controlRadii.lg,
    backgroundColor: controlColors.surface,
  },
  cardInfo: {
    borderColor: '#CAD9EE',
    backgroundColor: controlColors.infoSoft,
  },
  cardSuccess: {
    borderColor: '#B8D8C5',
    backgroundColor: controlColors.successSoft,
  },
  cardWarning: {
    borderColor: '#E6D4AD',
    backgroundColor: controlColors.warningSoft,
  },
  cardDanger: {
    borderColor: '#E6C8C4',
    backgroundColor: controlColors.dangerSoft,
  },
  button: {
    minHeight: controlLayout.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: controlSpacing.sm,
    paddingHorizontal: controlSpacing.lg,
    borderWidth: 1,
    borderRadius: controlRadii.md,
  },
  buttonPressed: { opacity: 0.82 },
  buttonText: { ...controlType.bodyStrong, textAlign: 'center' },
  disabled: { opacity: 0.45 },
  field: { width: '100%', gap: controlSpacing.xs },
  fieldLabel: { ...controlType.smallStrong, color: controlColors.text },
  input: {
    minHeight: controlLayout.touchTarget,
    paddingHorizontal: controlSpacing.md,
    paddingVertical: controlSpacing.sm,
    borderWidth: 1,
    borderColor: controlColors.borderStrong,
    borderRadius: controlRadii.md,
    backgroundColor: controlColors.surface,
    color: controlColors.text,
    fontSize: 14,
  },
  inputMultiline: { minHeight: 92, textAlignVertical: 'top' },
  inputError: { borderColor: controlColors.danger },
  fieldHelper: { ...controlType.small, color: controlColors.textMuted },
  fieldError: { ...controlType.small, color: controlColors.danger },
  notice: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noticeCopy: { minWidth: 220, flex: 1, gap: controlSpacing.xxs },
  noticeTitle: { ...controlType.bodyStrong, color: controlColors.text },
  noticeMessage: { ...controlType.small, color: controlColors.textSecondary },
  metricCard: { minWidth: 180, flexGrow: 1 },
  metricLabel: { ...controlType.smallStrong, color: controlColors.textSecondary },
  metricValue: { ...controlType.metric, color: controlColors.brand },
  metricValueWarning: { color: controlColors.warning },
  metricValueDanger: { color: controlColors.danger },
  metricDetail: { ...controlType.small, color: controlColors.textMuted },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: controlSpacing.sm,
    paddingVertical: controlSpacing.xxs,
    borderRadius: controlRadii.pill,
    backgroundColor: controlColors.surfacePressed,
  },
  badgeInfo: { backgroundColor: controlColors.infoSoft },
  badgeSuccess: { backgroundColor: controlColors.accentSoft },
  badgeWarning: { backgroundColor: controlColors.warningSoft },
  badgeDanger: { backgroundColor: controlColors.dangerSoft },
  badgeText: {
    color: controlColors.textSecondary,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  badgeTextInfo: { color: controlColors.info },
  badgeTextSuccess: { color: controlColors.success },
  badgeTextWarning: { color: controlColors.warning },
  badgeTextDanger: { color: controlColors.danger },
  emptyState: {
    maxWidth: 620,
    alignItems: 'center',
    padding: controlSpacing.xl,
  },
  emptyTitle: { ...controlType.sectionTitle, color: controlColors.text, textAlign: 'center' },
  emptyDescription: {
    ...controlType.body,
    maxWidth: 480,
    color: controlColors.textSecondary,
    textAlign: 'center',
  },
  confirmPanel: { maxWidth: 680 },
  confirmCopy: { gap: controlSpacing.xs },
  confirmTitle: { ...controlType.sectionTitle, color: controlColors.text },
  confirmDescription: { ...controlType.body, color: controlColors.textSecondary },
  confirmActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: controlSpacing.sm,
  },
});
