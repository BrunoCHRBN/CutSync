import { formatClientPhone, validateClientProfile } from '@cutsync/validation';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Alert, Keyboard, StyleSheet, Text, View } from 'react-native';

import {
  ClientAvatar,
  ClientSettingsPage,
  SettingsButton,
  SettingsCard,
  SettingsField,
  SettingsNotice,
  SettingsSectionLabel,
} from '@/components/settings/client-settings-ui';
import { useClientProfile } from '@/contexts/client-profile-context';

export function ClientProfileScreen() {
  const { profile, isLoading, isSaving, error, updateAvatar, updateProfile, removeAvatar } = useClientProfile();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setName(profile.name);
    setPhone(formatClientPhone(profile.phone));
  }, [profile]);

  const handleSave = async () => {
    Keyboard.dismiss();
    setLocalMessage(null);
    setSuccessMessage(null);
    const validation = validateClientProfile(name, phone);
    if (!validation.ok) {
      setLocalMessage(validation.message);
      return;
    }
    const result = await updateProfile(validation.name, validation.phone);
    if (result.ok) setSuccessMessage('Perfil atualizado com segurança.');
    else setLocalMessage(result.message);
  };

  const handlePickAvatar = async () => {
    setLocalMessage(null);
    setSuccessMessage(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled) return;
    const updateResult = await updateAvatar(result.assets[0]);
    if (updateResult.ok) setSuccessMessage('Foto de perfil atualizada.');
    else setLocalMessage(updateResult.message);
  };

  const confirmRemoveAvatar = () => {
    Alert.alert(
      'Remover foto?',
      'Suas iniciais serão exibidas no lugar da imagem.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: () => {
            void removeAvatar().then((result) => {
              if (result.ok) setSuccessMessage('Foto removida.');
              else setLocalMessage(result.message);
            });
          },
        },
      ],
    );
  };

  const disabled = isLoading || isSaving || !profile;

  return (
    <ClientSettingsPage
      testID="client-profile-screen"
      description="Mantenha seus dados de contato atualizados para facilitar seus agendamentos."
    >
      <SettingsSectionLabel>FOTO</SettingsSectionLabel>
      <SettingsCard>
        <View style={styles.avatarRow}>
          <ClientAvatar avatarUrl={profile?.avatarUrl ?? null} name={name || 'Cliente CutSync'} size={88} />
          <View style={styles.avatarActions}>
            <SettingsButton
              testID="client-avatar-select"
              label="Escolher foto"
              tone="secondary"
              disabled={disabled}
              loading={isSaving}
              onPress={() => { void handlePickAvatar(); }}
            />
            {profile?.avatarUrl && (
              <SettingsButton
                testID="client-avatar-remove"
                label="Remover"
                tone="danger"
                disabled={disabled}
                onPress={confirmRemoveAvatar}
              />
            )}
          </View>
        </View>
        <Text style={styles.photoHelper}>JPEG, PNG ou WebP, com no máximo 5 MB. SVG não é aceito.</Text>
      </SettingsCard>

      <SettingsSectionLabel>DADOS PESSOAIS</SettingsSectionLabel>
      <SettingsCard>
        <SettingsField
          testID="client-profile-name"
          label="Nome"
          autoCapitalize="words"
          autoComplete="name"
          editable={!disabled}
          maxLength={80}
          onChangeText={setName}
          onUnsafeInput={setLocalMessage}
          placeholder="Seu nome"
          returnKeyType="next"
          value={name}
        />
        <SettingsField
          testID="client-profile-phone"
          label="Telefone"
          autoComplete="tel"
          editable={!disabled}
          helper="Use um número com DDD. O telefone é opcional."
          keyboardType="phone-pad"
          maxLength={22}
          onChangeText={setPhone}
          onUnsafeInput={setLocalMessage}
          placeholder="(11) 99999-9999"
          returnKeyType="done"
          transformValue={formatClientPhone}
          value={phone}
        />
        <SettingsField
          testID="client-profile-email"
          label="E-mail"
          editable={false}
          helper="A alteração de e-mail terá um fluxo de confirmação próprio."
          onUnsafeInput={() => undefined}
          value={profile?.email ?? ''}
        />
      </SettingsCard>

      {(localMessage || error) && (
        <SettingsNotice testID="client-profile-error" message={localMessage || error || ''} />
      )}
      {successMessage && (
        <SettingsNotice testID="client-profile-success" tone="success" message={successMessage} />
      )}
      <SettingsButton
        testID="client-profile-save"
        label="Salvar perfil"
        disabled={disabled}
        loading={isSaving}
        onPress={() => { void handleSave(); }}
      />
      <Text style={styles.securityNote}>Emojis, HTML e SVG são bloqueados antes do envio.</Text>
    </ClientSettingsPage>
  );
}

const styles = StyleSheet.create({
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  avatarActions: { flex: 1, gap: 10 },
  photoHelper: { color: '#817A6C', fontSize: 11, lineHeight: 17 },
  securityNote: { color: '#817A6C', fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
