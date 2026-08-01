import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, Palette } from 'lucide-react-native';
import {
  buildEstablishmentTheme,
  ESTABLISHMENT_COLOR_PRESETS,
  meetsWcagAA,
  normalizeHex,
} from '@cutsync/brand';
import { AppInput } from './AppInput';
import { colors, radii, typography } from '../../theme/tokens';

export interface BrandColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
}

export const BrandColorPicker = ({ value, onChange }: BrandColorPickerProps) => {
  const normalized = normalizeHex(value);
  const theme = useMemo(() => buildEstablishmentTheme(value), [value]);
  const accessible = meetsWcagAA(theme);
  const selectedPresetId = ESTABLISHMENT_COLOR_PRESETS.find((preset) => preset.hex === normalized)?.id;

  return (
    <View testID="settings-brand-color-picker" style={styles.root}>
      <Text style={styles.label}>Cor da marca</Text>
      <Text style={styles.hint}>Escolha uma cor da paleta ou informe um hex personalizado.</Text>

      <View testID="settings-color-preset-grid" style={styles.presetGrid}>
        {ESTABLISHMENT_COLOR_PRESETS.map((preset) => {
          const selected = selectedPresetId === preset.id;
          return (
            <Pressable
              key={preset.id}
              testID={`settings-color-preset-${preset.id}`}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={preset.label}
              onPress={() => onChange(preset.hex)}
              style={({ pressed }) => [
                styles.presetSwatch,
                { backgroundColor: preset.hex },
                selected && [styles.presetSwatchSelected, { borderColor: theme.primary }],
                pressed && styles.pressed,
              ]}
            >
              {selected ? <Check color={theme.onPrimary} size={14} strokeWidth={3} /> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.customRow}>
        <AppInput
          containerStyle={styles.hexField}
          label="Hex personalizado"
          testID="settings-color-input"
          icon={<Palette color={colors.textMuted} size={17} />}
          value={value}
          onChangeText={onChange}
          autoCapitalize="characters"
          placeholder="#2C4334"
        />
        <View
          testID="settings-color-preview-swatch"
          style={[
            styles.previewSwatch,
            { backgroundColor: normalized ?? 'transparent' },
          ]}
        />
      </View>

      <Text
        testID="settings-color-contrast-hint"
        style={[styles.contrastHint, !accessible && styles.contrastHintWarning]}
      >
        {normalized
          ? accessible
            ? 'Contraste acessível para botões e textos sobre a cor.'
            : 'Contraste baixo — prefira uma cor mais escura ou escolha um preset.'
          : 'Informe um hex válido (#RRGGBB).'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { gap: 10 },
  label: {
    color: colors.textSecondary,
    fontFamily: typography.bodyStrong,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  hint: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetSwatch: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  presetSwatchSelected: {
    borderWidth: 2,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  hexField: { flex: 1, minWidth: 180 },
  previewSwatch: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 5,
  },
  contrastHint: {
    color: colors.success,
    fontFamily: typography.body,
    fontSize: 11,
    lineHeight: 16,
  },
  contrastHintWarning: {
    color: colors.warning,
  },
  pressed: { opacity: 0.85 },
});
