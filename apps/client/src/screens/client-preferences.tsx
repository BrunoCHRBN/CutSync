import { validateClientPreferences, type ClientNotificationChannel } from '@cutsync/validation';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import {
  ClientSettingsPage,
  SettingsButton,
  SettingsCard,
  SettingsNotice,
  SettingsSectionLabel,
  SettingsSwitchRow,
} from '@/components/settings/client-settings-ui';
import { useClientProfile } from '@/contexts/client-profile-context';

export function ClientPreferencesScreen() {
  const { profile, isLoading, isSaving, error, updatePreferences } = useClientProfile();
  const [channels, setChannels] = useState<ClientNotificationChannel[]>([]);
  const [marketingAccepted, setMarketingAccepted] = useState(false);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setChannels(profile.notificationChannels.filter((channel) => channel !== 'push'));
    setMarketingAccepted(profile.marketingAccepted);
  }, [profile]);

  const toggleChannel = (channel: ClientNotificationChannel, enabled: boolean) => {
    setSaved(false);
    setChannels((current) => (
      enabled
        ? [...current.filter((item) => item !== channel), channel]
        : current.filter((item) => item !== channel)
    ));
  };

  const handleSave = async () => {
    setLocalMessage(null);
    setSaved(false);
    const validation = validateClientPreferences(channels, marketingAccepted);
    if (!validation.ok) {
      setLocalMessage(validation.message);
      return;
    }
    const result = await updatePreferences(validation.channels, validation.marketingAccepted);
    if (result.ok) setSaved(true);
    else setLocalMessage(result.message);
  };

  const disabled = isLoading || isSaving || !profile;

  return (
    <ClientSettingsPage
      testID="client-preferences-screen"
      description="Escolha como deseja receber comunicações. Cada canal só será usado quando a entrega correspondente estiver disponível."
    >
      <SettingsSectionLabel>CANAIS</SettingsSectionLabel>
      <SettingsCard>
        <SettingsSwitchRow
          testID="client-preference-email"
          title="E-mail"
          subtitle="Avisos operacionais enviados para o endereço da conta."
          value={channels.includes('email')}
          disabled={disabled}
          onValueChange={(value) => toggleChannel('email', value)}
        />
        <SettingsSwitchRow
          testID="client-preference-whatsapp"
          title="WhatsApp"
          subtitle="Depende de um telefone válido e da futura integração do canal."
          value={channels.includes('whatsapp')}
          disabled={disabled}
          onValueChange={(value) => toggleChannel('whatsapp', value)}
        />
        <SettingsSwitchRow
          testID="client-preference-push"
          title="Notificações no celular"
          subtitle="Será liberado depois da permissão e do registro seguro deste dispositivo."
          value={false}
          disabled
          onValueChange={() => undefined}
        />
      </SettingsCard>

      <SettingsSectionLabel>PRIVACIDADE</SettingsSectionLabel>
      <SettingsCard>
        <SettingsSwitchRow
          testID="client-preference-marketing"
          title="Novidades e promoções"
          subtitle="Consentimento opcional e separado dos avisos necessários da conta."
          value={marketingAccepted}
          disabled={disabled}
          onValueChange={(value) => {
            setSaved(false);
            setMarketingAccepted(value);
          }}
        />
        <Text style={styles.privacyNote}>
          Desativar esta opção não altera os termos já aceitos nem impede mensagens essenciais sobre sua conta.
        </Text>
      </SettingsCard>

      <SettingsNotice
        tone="neutral"
        message="Salvar uma preferência não significa que o canal já realiza envios. A ativação será informada no próprio aplicativo."
      />
      {(localMessage || error) && (
        <SettingsNotice testID="client-preferences-error" message={localMessage || error || ''} />
      )}
      {saved && (
        <SettingsNotice testID="client-preferences-success" tone="success" message="Preferências salvas." />
      )}
      <SettingsButton
        testID="client-preferences-save"
        label="Salvar preferências"
        disabled={disabled}
        loading={isSaving}
        onPress={() => { void handleSave(); }}
      />
    </ClientSettingsPage>
  );
}

const styles = StyleSheet.create({
  privacyNote: { color: '#817A6C', fontSize: 11, lineHeight: 17 },
});
