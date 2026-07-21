import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ShieldCheck, CheckCircle, Search, Award } from 'lucide-react-native';
import { colors, radii, typography } from '../../../theme/tokens';

export const GspValidationSandbox = () => {
  const [documentInput, setDocumentInput] = useState('48.291.042/0001-98');
  const [isValidated, setIsValidated] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleValidate = () => {
    if (!documentInput.trim()) return;
    setLoading(true);
    setIsValidated(false);

    setTimeout(() => {
      setLoading(false);
      setIsValidated(true);
    }, 600);
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <ShieldCheck size={18} color="#113939" />
          <Text style={styles.headerTitle}>Validador Antifraude GSP / CNPJ</Text>
        </View>
        <View style={styles.badge}>
          <Award size={12} color="#113939" />
          <Text style={styles.badgeText}>AUTO-ATIVAÇÃO</Text>
        </View>
      </View>

      <Text style={styles.subtitle}>
        Digite um CNPJ ou CPF para verificar em tempo real a elegibilidade do seu estabelecimento para auto-ativação imediata na região de Araraquara/Matão.
      </Text>

      {/* Document Input & Validate Action */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Digite seu CNPJ ou CPF..."
          placeholderTextColor={colors.textMuted}
          value={documentInput}
          onChangeText={(val) => {
            setDocumentInput(val);
            setIsValidated(false);
          }}
        />
        <Pressable
          style={({ pressed }) => [styles.validateBtn, pressed && styles.btnPressed]}
          onPress={handleValidate}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Search size={14} color="#FFFFFF" />
              <Text style={styles.validateBtnText}>Validar CNPJ</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Validation Result Seal */}
      {isValidated && (
        <View style={styles.sealBox}>
          <CheckCircle size={22} color="#3F7A4C" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.sealTitle}>Empresa Ativa na Receita Federal!</Text>
            <Text style={styles.sealDesc}>
              CNPJ {documentInput} aprovado. Elegível para Auto-Ativação e liberação automática do PIX de comissão na região de Araraquara/Matão.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#E4E5DF',
    padding: 20,
    gap: 14,
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: typography.display,
    color: '#1A1A1E',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0ECE0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: '#113939',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    flex: 1,
    height: 42,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E4E5DF',
    borderRadius: radii.md,
    paddingHorizontal: 14,
    fontSize: 13,
    fontFamily: typography.body,
    color: '#1A1A1E',
  },
  validateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#113939',
    paddingHorizontal: 16,
    borderRadius: radii.md,
    height: 42,
  },
  btnPressed: {
    opacity: 0.85,
  },
  validateBtnText: {
    fontSize: 12,
    fontFamily: typography.bodyStrong,
    color: '#FFFFFF',
  },
  sealBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#E9F2EA',
    borderWidth: 1,
    borderColor: 'rgba(63,122,76,0.3)',
    borderRadius: radii.md,
    padding: 14,
  },
  sealTitle: {
    fontSize: 13,
    fontFamily: typography.bodyStrong,
    color: '#3F7A4C',
  },
  sealDesc: {
    fontSize: 11,
    fontFamily: typography.body,
    color: '#1A1A1E',
    lineHeight: 16,
  },
});
