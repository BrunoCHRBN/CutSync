import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppInput } from '../../../components/ui/AppInput';
import { colors, radii, typeScale } from '../../../theme/tokens';
import {
  CONSENT_LABELS,
  type EstablishmentClientConsentStatus,
  type EstablishmentClientFormValues,
} from '../types/establishment-client';

const CONSENT_OPTIONS: EstablishmentClientConsentStatus[] = ['unknown', 'granted', 'revoked'];

interface ClientFormFieldsProps {
  values: EstablishmentClientFormValues;
  onChange: (next: EstablishmentClientFormValues) => void;
  showConsent?: boolean;
}

export const ClientFormFields = ({
  values,
  onChange,
  showConsent = false,
}: ClientFormFieldsProps) => {
  const set = <K extends keyof EstablishmentClientFormValues>(
    key: K,
    value: EstablishmentClientFormValues[K],
  ) => onChange({ ...values, [key]: value });

  return (
    <View style={styles.form}>
      <AppInput
        testID="client-form-name"
        label="Nome"
        value={values.name}
        onChangeText={(value) => set('name', value)}
        placeholder="Nome completo"
      />
      <AppInput
        testID="client-form-phone"
        label="Telefone"
        value={values.phone}
        onChangeText={(value) => set('phone', value)}
        placeholder="(11) 99999-9999"
        keyboardType="phone-pad"
      />
      <AppInput
        testID="client-form-email"
        label="E-mail"
        value={values.email}
        onChangeText={(value) => set('email', value)}
        placeholder="cliente@email.com"
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <AppInput
        testID="client-form-tags"
        label="Etiquetas"
        value={values.tags}
        onChangeText={(value) => set('tags', value)}
        placeholder="VIP, indicado, ..."
      />
      <AppInput
        testID="client-form-notes"
        label="Observações internas"
        value={values.notes}
        onChangeText={(value) => set('notes', value)}
        placeholder="Notas visíveis só para a equipe"
        multiline
        style={styles.notes}
      />
      {showConsent ? (
        <View style={styles.consentBlock}>
          <Text style={styles.consentLabel}>Consentimento promocional</Text>
          <View style={styles.consentRow}>
            {CONSENT_OPTIONS.map((option) => {
              const active = values.marketingConsentStatus === option;
              return (
                <Pressable
                  key={option}
                  testID={`client-form-consent-${option}`}
                  onPress={() => set('marketingConsentStatus', option)}
                  style={[styles.consentChip, active && styles.consentChipActive]}
                >
                  <Text style={[styles.consentChipText, active && styles.consentChipTextActive]}>
                    {CONSENT_LABELS[option]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  form: { gap: 12 },
  notes: { minHeight: 96, textAlignVertical: 'top' },
  consentBlock: { gap: 8 },
  consentLabel: { ...typeScale.label, color: colors.text },
  consentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  consentChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  consentChipActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  consentChipText: { ...typeScale.small, color: colors.textMuted },
  consentChipTextActive: { color: colors.brand, fontWeight: '600' },
});
