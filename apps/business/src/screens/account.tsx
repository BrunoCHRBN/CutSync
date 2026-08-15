import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  BusinessButton,
  BusinessCard,
  BusinessHeader,
  BusinessNotice,
  BusinessPage,
  BusinessPill,
  BusinessSectionTitle,
} from '@/components/ui/business-ui';
import { useBusinessOperational } from '@/contexts/business-operational-context';
import { useBusinessSession } from '@/contexts/business-session';
import { businessTheme } from '@/theme/business-theme';
import {
  disableBusinessPushNotifications,
  enableBusinessPushNotifications,
  getBusinessPushStatus,
  type BusinessPushStatus,
} from '@/features/notifications/business-push-service';
import {
  downloadAvailableBusinessUpdate,
  reloadDownloadedBusinessUpdate,
} from '@/features/updates/business-updates';

const roleLabel = {
  owner: 'Proprietário',
  admin: 'Administrador',
  professional: 'Profissional',
} as const;

export function BusinessAccountScreen() {
  const router = useRouter();
  const { user, requestPasswordReset, signOut } = useBusinessSession();
  const { activeContext, contexts } = useBusinessOperational();
  const [securityBusy, setSecurityBusy] = useState(false);
  const [securityNotice, setSecurityNotice] = useState<string | null>(null);
  const [exitBusy, setExitBusy] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateNotice, setUpdateNotice] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<BusinessPushStatus>('not_determined');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushNotice, setPushNotice] = useState<string | null>(null);

  useEffect(() => {
    void getBusinessPushStatus().then(setPushStatus);
  }, []);

  const displayName = typeof user?.user_metadata?.name === 'string'
    ? user.user_metadata.name
    : typeof user?.user_metadata?.full_name === 'string'
      ? user.user_metadata.full_name
      : 'Minha conta';

  const sendRecovery = async () => {
    if (!user?.email) return;
    setSecurityBusy(true);
    const result = await requestPasswordReset(user.email);
    setSecurityBusy(false);
    setSecurityNotice(result.ok
      ? 'Se a conta estiver apta, o link de segurança chegará no e-mail cadastrado.'
      : result.message);
  };

  const exit = async () => {
    setExitBusy(true);
    await signOut();
    setExitBusy(false);
  };

  const confirmExit = () => {
    Alert.alert(
      'Sair da sua conta?',
      'Você precisará entrar novamente para acessar a rotina do estabelecimento.',
      [
        { text: 'Continuar conectado', style: 'cancel' },
        { text: 'Sair', style: 'destructive', onPress: () => void exit() },
      ],
    );
  };

  const checkUpdate = async () => {
    setUpdateBusy(true);
    setUpdateNotice(null);
    const result = await downloadAvailableBusinessUpdate();
    setUpdateBusy(false);
    if (result.status === 'downloaded') {
      Alert.alert(
        'Atualização pronta',
        'Reinicie o aplicativo para aplicar a nova versão.',
        [
          { text: 'Depois', style: 'cancel' },
          { text: 'Reiniciar', onPress: () => void reloadDownloadedBusinessUpdate() },
        ],
      );
      return;
    }
    setUpdateNotice(result.status === 'current'
      ? 'Seu aplicativo já está atualizado.'
      : result.status === 'disabled'
        ? 'A busca de atualizações não está disponível nesta versão.'
        : 'Não foi possível buscar atualizações agora.');
  };

  const togglePush = async () => {
    setPushBusy(true);
    setPushNotice(null);
    if (pushStatus === 'enabled') {
      const result = await disableBusinessPushNotifications();
      if (result.ok) {
        setPushStatus('not_determined');
        setPushNotice('Este dispositivo deixou de receber notificações operacionais.');
      } else setPushNotice(result.message);
    } else {
      const result = await enableBusinessPushNotifications();
      if (result.ok) {
        setPushStatus('enabled');
        setPushNotice('Notificações operacionais ativadas neste dispositivo.');
      } else {
        setPushStatus(result.status);
        setPushNotice(result.message);
      }
    }
    setPushBusy(false);
  };

  return (
    <BusinessPage testID="business-account-screen">
      <BusinessHeader
        testID="business-account-header"
        eyebrow="SUA CONTA"
        title={displayName}
        description={user?.email ?? 'Sessão operacional'}
        trailing={activeContext ? (
          <BusinessPill
            testID="business-account-role"
            label={roleLabel[activeContext.operationalRole]}
            tone={activeContext.accessMode === 'read_only' ? 'warning' : 'success'}
          />
        ) : null}
      />

      <View style={styles.section}>
        <BusinessSectionTitle testID="business-account-establishment-title">Estabelecimento</BusinessSectionTitle>
        <BusinessCard testID="business-account-establishment-card">
          <Text testID="business-account-establishment-name" selectable style={styles.cardTitle}>{activeContext?.establishmentName ?? 'Nenhum selecionado'}</Text>
          <Text testID="business-account-establishment-access" selectable style={styles.cardMeta}>
            {activeContext
              ? `${activeContext.timezone} · ${activeContext.accessMode === 'full' ? 'Acesso total' : 'Somente consulta'}`
              : 'Escolha uma unidade para continuar.'}
          </Text>
          <BusinessButton
            testID="business-switch-establishment"
            label={contexts.length > 1 ? 'Trocar estabelecimento' : 'Ver estabelecimento'}
            variant="secondary"
            onPress={() => router.push('/establishments' as never)}
          />
        </BusinessCard>
      </View>

      <View style={styles.section}>
        <BusinessSectionTitle testID="business-account-profile-title">Perfil público</BusinessSectionTitle>
        <BusinessCard testID="business-account-profile-card">
          <View style={styles.cardTitleRow}>
            <Text selectable style={styles.cardTitle}>Sua apresentação aos clientes</Text>
            <BusinessPill testID="business-account-profile-status" label="Em breve" />
          </View>
          <Text selectable style={styles.cardMeta}>
            Em breve você poderá editar foto, apresentação e portfólio diretamente por aqui.
          </Text>
        </BusinessCard>
      </View>

      <View style={styles.section}>
        <BusinessSectionTitle testID="business-account-security-title">Segurança</BusinessSectionTitle>
        <BusinessCard>
          <Text selectable style={styles.cardMeta}>
            Enviaremos um link seguro para redefinir a senha. O Business nunca solicita sua senha por mensagem.
          </Text>
          {securityNotice ? (
            <BusinessNotice
              testID="business-security-notice"
              tone={securityNotice.startsWith('Se a conta') ? 'success' : 'danger'}
              message={securityNotice}
            />
          ) : null}
          <BusinessButton
            testID="business-security-recovery"
            label="Enviar link de redefinição"
            variant="secondary"
            loading={securityBusy}
            disabled={!user?.email}
            onPress={() => void sendRecovery()}
          />
        </BusinessCard>
      </View>

      <View style={styles.section}>
        <BusinessSectionTitle testID="business-account-notifications-title">Notificações</BusinessSectionTitle>
        <BusinessCard>
          <Text selectable style={styles.cardMeta}>
            Receba avisos de novos atendimentos, cancelamentos, mudanças e convites neste dispositivo.
          </Text>
          {pushNotice ? <BusinessNotice testID="business-account-push-notice" message={pushNotice} tone={pushStatus === 'enabled' ? 'success' : 'neutral'} /> : null}
          <BusinessButton
            testID="business-account-toggle-notifications"
            label={pushStatus === 'enabled' ? 'Desativar neste dispositivo' : 'Ativar neste dispositivo'}
            variant={pushStatus === 'enabled' ? 'danger' : 'secondary'}
            loading={pushBusy}
            disabled={pushStatus === 'unsupported'}
            onPress={() => void togglePush()}
          />
        </BusinessCard>
      </View>

      <View style={styles.section}>
        <BusinessSectionTitle testID="business-account-updates-title">Sobre o aplicativo</BusinessSectionTitle>
        <BusinessCard>
          <Text selectable style={styles.cardMeta}>
            Busque melhorias e correções disponíveis para esta versão do CutSync Business.
          </Text>
          {updateNotice ? <BusinessNotice testID="business-account-update-notice" message={updateNotice} tone={updateNotice.startsWith('Seu aplicativo') ? 'success' : 'neutral'} /> : null}
          <BusinessButton testID="business-account-check-updates" label="Buscar atualizações" variant="secondary" loading={updateBusy} onPress={() => void checkUpdate()} />
        </BusinessCard>
      </View>

      <BusinessButton
        testID="business-sign-out"
        label="Sair do Business"
        variant="danger"
        loading={exitBusy}
        onPress={confirmExit}
      />
    </BusinessPage>
  );
}

const styles = StyleSheet.create({
  section: { gap: businessTheme.spacing.sm },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: businessTheme.spacing.sm },
  cardTitle: { ...businessTheme.typography.heading, color: businessTheme.colors.text },
  cardMeta: { ...businessTheme.typography.body, color: businessTheme.colors.textSoft },
});
