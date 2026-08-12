import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
import {
  disableBusinessPushNotifications,
  enableBusinessPushNotifications,
  getBusinessPushStatus,
  type BusinessPushStatus,
} from '@/features/notifications/business-push-service';
import { businessTheme } from '@/theme/business-theme';

const roleLabel = {
  owner: 'Proprietário',
  admin: 'Administrador',
  professional: 'Profissional',
  reception: 'Recepção',
  cashier: 'Caixa',
  finance: 'Financeiro',
  manager: 'Gestor',
} as const;

const appVersion = Constants.expoConfig?.version ?? 'desconhecida';
const nativeBuildVersion = Constants.nativeBuildVersion ?? 'desenvolvimento';

export function BusinessAccountScreen() {
  const router = useRouter();
  const { user, requestPasswordReset, signOut } = useBusinessSession();
  const { activeContext, contexts } = useBusinessOperational();
  const [securityBusy, setSecurityBusy] = useState(false);
  const [securityNotice, setSecurityNotice] = useState<string | null>(null);
  const [exitBusy, setExitBusy] = useState(false);
  const [pushStatus, setPushStatus] = useState<BusinessPushStatus>('not_determined');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushNotice, setPushNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getBusinessPushStatus().then((status) => {
      if (active) setPushStatus(status);
    });
    return () => { active = false; };
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

  const enablePush = async () => {
    setPushBusy(true);
    const result = await enableBusinessPushNotifications();
    setPushBusy(false);
    setPushStatus(result.ok ? 'enabled' : result.status);
    setPushNotice(result.ok
      ? 'Notificações operacionais ativadas neste dispositivo.'
      : result.message);
  };

  const disablePush = async () => {
    setPushBusy(true);
    const result = await disableBusinessPushNotifications();
    setPushBusy(false);
    if (result.ok) setPushStatus('not_determined');
    setPushNotice(result.ok
      ? 'Este dispositivo não receberá mais notificações do Business.'
      : result.message);
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
        <BusinessSectionTitle>Notificações operacionais</BusinessSectionTitle>
        <BusinessCard>
          <Text selectable style={styles.cardTitle}>
            {pushStatus === 'enabled' ? 'Ativadas neste dispositivo' : 'Desativadas neste dispositivo'}
          </Text>
          <Text selectable style={styles.cardMeta}>
            Receba alertas de agenda, conflitos e decisões de reatribuição mesmo fora do aplicativo.
          </Text>
          {pushNotice ? (
            <BusinessNotice
              testID="business-push-notice"
              tone={pushStatus === 'enabled' ? 'success' : 'warning'}
              message={pushNotice}
            />
          ) : null}
          <BusinessButton
            testID="business-push-toggle"
            label={pushStatus === 'enabled' ? 'Desativar notificações' : 'Ativar notificações'}
            variant="secondary"
            loading={pushBusy}
            onPress={() => void (pushStatus === 'enabled' ? disablePush() : enablePush())}
          />
        </BusinessCard>
      </View>

      <View style={styles.section}>
        <BusinessSectionTitle>Versão instalada</BusinessSectionTitle>
        <BusinessCard testID="business-installed-version">
          <Text selectable style={styles.cardTitle}>
            CutSync Business {appVersion} · build {nativeBuildVersion}
          </Text>
          <Text selectable style={styles.cardMeta}>
            Para validar a Fase 4 no Android, confirme que esta tela exibe build 2 ou superior.
          </Text>
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
