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
    : 'Conta operacional';

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

  const checkUpdate = async () => {
    setUpdateBusy(true);
    setUpdateNotice(null);
    const result = await downloadAvailableBusinessUpdate();
    setUpdateBusy(false);
    if (result.status === 'downloaded') {
      Alert.alert(
        result.rollbackToEmbedded ? 'Rollback pronto' : 'Atualização pronta',
        'Reinicie agora para carregar o bundle validado.',
        [
          { text: 'Depois', style: 'cancel' },
          { text: 'Reiniciar', onPress: () => void reloadDownloadedBusinessUpdate() },
        ],
      );
      return;
    }
    setUpdateNotice(result.status === 'current'
      ? 'Este build já está no update compatível mais recente.'
      : result.status === 'disabled'
        ? 'Updates ficam disponíveis em builds Development, Preview e Production.'
        : 'Não foi possível consultar updates agora.');
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
        eyebrow="CONTA"
        title={displayName}
        description={user?.email ?? 'Sessão operacional'}
        trailing={activeContext ? (
          <BusinessPill
            label={roleLabel[activeContext.operationalRole]}
            tone={activeContext.accessMode === 'read_only' ? 'warning' : 'success'}
          />
        ) : null}
      />

      <View style={styles.section}>
        <BusinessSectionTitle>Estabelecimento ativo</BusinessSectionTitle>
        <BusinessCard>
          <Text selectable style={styles.cardTitle}>{activeContext?.establishmentName ?? 'Nenhum selecionado'}</Text>
          <Text selectable style={styles.cardMeta}>
            {activeContext
              ? `${activeContext.timezone} · ${activeContext.accessMode === 'full' ? 'Acesso completo' : 'Somente leitura'}`
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
        <BusinessSectionTitle>Perfil profissional</BusinessSectionTitle>
        <BusinessCard>
          <Text selectable style={styles.cardTitle}>Identidade operacional</Text>
          <Text selectable style={styles.cardMeta}>
            Nesta fatia, o Business confirma identidade, papel e unidade. A edição do perfil público entra em Perfil e desempenho.
          </Text>
        </BusinessCard>
      </View>

      <View style={styles.section}>
        <BusinessSectionTitle>Segurança</BusinessSectionTitle>
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
        <BusinessSectionTitle>Notificações Android</BusinessSectionTitle>
        <BusinessCard>
          <Text selectable style={styles.cardMeta}>
            Receba novos atendimentos, cancelamentos, mudanças, convites e conflitos operacionais sem dados pessoais no push.
          </Text>
          {pushNotice ? <BusinessNotice message={pushNotice} tone={pushStatus === 'enabled' ? 'success' : 'neutral'} /> : null}
          <BusinessButton
            label={pushStatus === 'enabled' ? 'Desativar neste dispositivo' : 'Ativar neste dispositivo'}
            variant={pushStatus === 'enabled' ? 'danger' : 'secondary'}
            loading={pushBusy}
            disabled={pushStatus === 'unsupported'}
            onPress={() => void togglePush()}
          />
        </BusinessCard>
      </View>

      <View style={styles.section}>
        <BusinessSectionTitle>Versão e atualizações</BusinessSectionTitle>
        <BusinessCard>
          <Text selectable style={styles.cardMeta}>
            Updates são aceitos somente quando o runtime nativo é compatível com esta versão do aplicativo.
          </Text>
          {updateNotice ? <BusinessNotice message={updateNotice} tone={updateNotice.startsWith('Este build') ? 'success' : 'neutral'} /> : null}
          <BusinessButton label="Verificar update compatível" variant="secondary" loading={updateBusy} onPress={() => void checkUpdate()} />
        </BusinessCard>
      </View>

      <BusinessButton
        testID="business-sign-out"
        label="Sair do Business"
        variant="danger"
        loading={exitBusy}
        onPress={() => void exit()}
      />
    </BusinessPage>
  );
}

const styles = StyleSheet.create({
  section: { gap: businessTheme.spacing.sm },
  cardTitle: { ...businessTheme.typography.heading, color: businessTheme.colors.text },
  cardMeta: { ...businessTheme.typography.body, color: businessTheme.colors.textSoft },
});
