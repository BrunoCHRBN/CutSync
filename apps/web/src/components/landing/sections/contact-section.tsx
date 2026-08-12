import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, Loader, Send } from 'lucide-react-native';
import { MarketingContactField } from '@cutsync/validation';
import { landingColors, landingLayout, landingRadii, landingTypography } from '../../../theme/landing-tokens';
import { trackLandingEvent } from '../landing-analytics';
import { LANDING_CONTENT, LandingPageAudience } from '../landing-content';
import { submitMarketingContactRequest, validateMarketingContact } from '../marketing-contact';
import { LandingSectionShell } from './section-shell';

interface ContactSectionProps {
  audience: LandingPageAudience;
  onLayout?: (event: never) => void;
}

const GENERIC_SUCCESS = 'Recebemos sua solicitação. A equipe do CutSync responde pelo e-mail informado.';
const GENERIC_ERROR = 'Não foi possível enviar agora. Tente novamente em alguns instantes.';

export const ContactSection = ({ audience, onLayout }: ContactSectionProps) => {
  const content = LANDING_CONTENT[audience].contact;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [establishmentName, setEstablishmentName] = useState('');
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [trap, setTrap] = useState('');
  const [fieldError, setFieldError] = useState<{ field: MarketingContactField; message: string } | null>(null);
  const [formError, setFormError] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (sending) return;
    const input = { origin: audience, name, email, establishmentName, message, consent, honeypot: trap };
    const validation = validateMarketingContact(input);
    if (!validation.ok) {
      setFieldError({ field: validation.field, message: validation.message });
      setFormError('');
      return;
    }
    setFieldError(null);
    setFormError('');
    setSending(true);
    trackLandingEvent({ name: 'contact_submitted', page: audience });
    const outcome = await submitMarketingContactRequest(input);
    setSending(false);
    trackLandingEvent({ name: 'contact_result', page: audience, result: outcome });
    if (outcome === 'received') {
      setSent(true);
      setName('');
      setEmail('');
      setEstablishmentName('');
      setMessage('');
      setConsent(false);
      return;
    }
    setFormError(outcome === 'invalid' ? 'Revise os dados informados e tente novamente.' : GENERIC_ERROR);
  };

  return (
    <LandingSectionShell
      id="contact"
      testID={`landing-${audience}-contact`}
      eyebrow={content.eyebrow}
      title={content.title}
      description={content.description}
      onLayout={onLayout as never}
      onReveal={() => trackLandingEvent({ name: 'contact_opened', page: audience })}
    >
      <View testID={`landing-${audience}-contact-form`} style={styles.form}>
        <View style={styles.row}>
          <View style={styles.field}>
            <Text style={styles.label}>Nome</Text>
            <TextInput
              testID="landing-contact-name"
              accessibilityLabel="Seu nome"
              value={name}
              onChangeText={setName}
              placeholder="Como podemos chamar você"
              placeholderTextColor={landingColors.inkMuted}
              style={[styles.input, fieldError?.field === 'name' && styles.inputError]}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>E-mail</Text>
            <TextInput
              testID="landing-contact-email"
              accessibilityLabel="Seu e-mail"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="nome@dominio.com"
              placeholderTextColor={landingColors.inkMuted}
              style={[styles.input, fieldError?.field === 'email' && styles.inputError]}
            />
          </View>
        </View>

        {audience === 'business' && (
          <View style={styles.field}>
            <Text style={styles.label}>Nome do estabelecimento (opcional)</Text>
            <TextInput
              testID="landing-contact-establishment"
              accessibilityLabel="Nome do estabelecimento, opcional"
              value={establishmentName}
              onChangeText={setEstablishmentName}
              placeholder="Nome usado pelo seu negócio"
              placeholderTextColor={landingColors.inkMuted}
              style={[styles.input, fieldError?.field === 'establishmentName' && styles.inputError]}
            />
          </View>
        )}

        <View style={styles.field}>
          <Text style={styles.label}>Mensagem</Text>
          <TextInput
            testID="landing-contact-message"
            accessibilityLabel="Sua mensagem"
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={5}
            placeholder={audience === 'client' ? 'Conte qual é a sua dúvida' : 'Conte como funciona seu atendimento hoje'}
            placeholderTextColor={landingColors.inkMuted}
            style={[styles.input, styles.textarea, fieldError?.field === 'message' && styles.inputError]}
          />
        </View>

        <TextInput
          testID="landing-contact-honeypot"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          value={trap}
          onChangeText={setTrap}
          style={styles.honeypot}
          {...({ tabIndex: -1, autoComplete: 'off', 'aria-hidden': true } as any)}
        />

        <Pressable
          testID="landing-contact-consent"
          accessibilityRole="checkbox"
          accessibilityState={{ checked: consent }}
          accessibilityLabel={content.consentLabel}
          onPress={() => setConsent((current) => !current)}
          style={styles.consentRow}
        >
          <View style={[styles.checkbox, consent && styles.checkboxChecked]}>
            {consent && <Check size={13} color={landingColors.white} />}
          </View>
          <Text style={[styles.consentText, fieldError?.field === 'consent' && styles.consentTextError]}>{content.consentLabel}</Text>
        </Pressable>

        {fieldError && (
          <Text testID="landing-contact-field-error" style={styles.errorText}>{fieldError.message}</Text>
        )}
        {!!formError && (
          <Text testID="landing-contact-error" style={styles.errorText}>{formError}</Text>
        )}
        {sent && (
          <View testID="landing-contact-success" accessibilityRole="alert" style={styles.successPanel}>
            <Check size={16} color={landingColors.success} />
            <Text style={styles.successText}>{GENERIC_SUCCESS}</Text>
          </View>
        )}

        <View style={styles.actions}>
          <Pressable
            testID="landing-contact-submit"
            accessibilityRole="button"
            accessibilityState={{ busy: sending }}
            onPress={() => void submit()}
            style={({ pressed }) => [styles.submit, pressed && styles.submitPressed]}
          >
            {sending ? <Loader size={16} color={landingColors.white} /> : <Send size={16} color={landingColors.white} />}
            <Text style={styles.submitLabel}>{sending ? 'Enviando…' : content.submitLabel}</Text>
          </Pressable>
          <Text style={styles.privacyNote}>
            Usamos nome, e-mail e mensagem apenas para responder a esta solicitação, conforme a política de privacidade.
          </Text>
        </View>
      </View>
    </LandingSectionShell>
  );
};

const styles = StyleSheet.create({
  form: {
    maxWidth: landingLayout.copyWidth + 140,
    padding: 32,
    gap: 18,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: landingColors.borderStrong,
    backgroundColor: landingColors.surface,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  field: { flex: 1, minWidth: 240, gap: 8 },
  label: { color: landingColors.inkSecondary, fontFamily: landingTypography.bodySemiBold, fontSize: 12, letterSpacing: 0.3 },
  input: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: landingColors.ink,
    fontFamily: landingTypography.body,
    fontSize: 14,
    borderWidth: 1,
    borderColor: landingColors.border,
    borderRadius: landingRadii.md,
    backgroundColor: landingColors.canvas,
    outlineStyle: 'none',
  } as never,
  textarea: { minHeight: 132, textAlignVertical: 'top' },
  inputError: { borderColor: landingColors.danger },
  honeypot: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -9999, top: 0 } as never,
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, minHeight: 44 },
  checkbox: {
    width: 22,
    height: 22,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    borderWidth: 1,
    borderColor: landingColors.borderStrong,
    backgroundColor: landingColors.canvas,
  },
  checkboxChecked: { borderColor: landingColors.brand, backgroundColor: landingColors.brand },
  consentText: { flex: 1, color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 12.5, lineHeight: 19 },
  consentTextError: { color: landingColors.danger },
  errorText: { color: landingColors.danger, fontFamily: landingTypography.bodyMedium, fontSize: 12.5, lineHeight: 19 },
  successPanel: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: landingRadii.md,
    backgroundColor: landingColors.successSoft,
  },
  successText: { flex: 1, color: landingColors.ink, fontFamily: landingTypography.bodyMedium, fontSize: 13, lineHeight: 20 },
  actions: { gap: 12 },
  submit: {
    alignSelf: 'flex-start',
    minHeight: 54,
    paddingHorizontal: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: landingRadii.md,
    backgroundColor: landingColors.brand,
  },
  submitPressed: { opacity: 0.86 },
  submitLabel: { color: landingColors.white, fontFamily: landingTypography.bodySemiBold, fontSize: 14 },
  privacyNote: { maxWidth: 520, color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 12, lineHeight: 18 },
});
