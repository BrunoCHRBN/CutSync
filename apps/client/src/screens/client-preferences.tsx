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
import {
  disableClientPushNotifications,
  enableClientPushNotifications,
  getClientPushStatus,
  syncClientPushNotifications,
  type ClientPushStatus,
} from '@/features/notifications/client-push-service';

export function ClientPreferencesScreen() {
  const { profile, isLoading, isSaving, error, updatePreferences } = useClientProfile();
  const [channels, setChannels] = useState<ClientNotificationChannel[]>([]);
  const [marketingAccepted, setMarketingAccepted] = useState(false);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pushStatus, setPushStatus] = useState<ClientPushStatus>('unsupported');
  const [isChangingPush, setIsChangingPush] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setChannels(profile.notificationChannels);
    setMarketingAccepted(profile.marketingAccepted);
    void getClientPushStatus().then(setPushStatus);
    if (profile.notificationChannels.includes('push')) {
      void syncClientPushNotifications();
    }
  }, [profile]);

  const toggleChannel = (channel: ClientNotificationChannel, enabled: boolean) => {
    setSaved(false);
    setChannels((current) => (
      enabled
        ? [...current.filter((item) => item !== channel), channel]
        : current.filter((item) => item !== channel)
    ));
  };

  const handlePushChange = async (enabled: boolean) => {
    setSaved(false);
    setLocalMessage(null);
    setIsChangingPush(true);

    const result = enabled
      ? await enableClientPushNotifications()
      : await disableClientPushNotifications();

    setIsChangingPush(false);
    if (!result.ok) {
      setPushStatus(result.status);
      setLocalMessage(result.message);
      return;
    }

    setPushStatus(enabled ? 'enabled' : 'not_determined');
    toggleChannel('push', enabled);
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
          subtitle={
            pushStatus === 'denied'
              ? 'Permissão bloqueada no aparelho. Libere-a nas configurações do sistema.'
              : 'Confirmações, alterações e lembretes deste dispositivo.'
          }
          value={channels.includes('push')}
          disabled={disabled || isChangingPush}
          onValueChange={(value) => { void handlePushChange(value); }}
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
        disabled={disabled || isChangingPush}
        loading={isSaving}
        onPress={() => { void handleSave(); }}
      />
    </ClientSettingsPage>
  );
}

const styles = StyleSheet.create({
  privacyNote: { color: '#817A6C', fontSize: 11, lineHeight: 17 },
});
