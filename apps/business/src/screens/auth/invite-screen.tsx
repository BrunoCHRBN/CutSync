import type { BusinessInvitationDetails } from '@cutsync/database';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AuthButton } from '@/components/auth/auth-button';
import { AuthNotice } from '@/components/auth/auth-notice';
import { AuthScreen } from '@/components/auth/auth-screen';
import { useBusinessSession } from '@/contexts/business-session';
import { BUSINESS_AUTH_MESSAGES } from '@/features/auth/business-auth-errors';
import {
  getBusinessInvitePath,
  isValidBusinessInvitationToken,
} from '@/lib/business-auth-deep-link';
import { businessApi, BusinessApiError } from '@/services/business-api';

type InvitePhase =
  | 'login-required'
  | 'loading'
  | 'ready'
  | 'expired'
  | 'mismatch'
  | 'used'
  | 'error';

interface InviteScreenProps {
  token?: string | string[];
}

const firstString = (value: string | string[] | undefined) => (
  Array.isArray(value) ? value[0] : value
);

const formatExpiration = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Prazo indisponível';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
};

const phaseForInvitationError = (error: unknown): InvitePhase => {
  if (!(error instanceof BusinessApiError)) return 'error';
  if (error.code === 'invitation_expired') return 'expired';
  if (error.code === 'invitation_email_mismatch') return 'mismatch';
  if (error.code === 'invitation_already_used') return 'used';
  if (error.code === 'invalid_response' || error.code === 'invitation_invalid') {
    return 'mismatch';
  }
  return 'error';
};

export function InviteScreen({ token }: InviteScreenProps) {
  const router = useRouter();
  const { user, isConfigured, signOut } = useBusinessSession();
  const invitationToken = firstString(token);
  const validToken = isValidBusinessInvitationToken(invitationToken)
    ? invitationToken
    : null;
  const redirect = validToken ? getBusinessInvitePath(validToken) : null;
  const [phase, setPhase] = useState<InvitePhase>(
    user ? 'loading' : 'login-required',
  );
  const [details, setDetails] = useState<BusinessInvitationDetails | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [failureMessage, setFailureMessage] = useState<string>(
    BUSINESS_AUTH_MESSAGES.invitationInspect,
  );

  const inspectInvitation = useCallback(async () => {
    if (!user) {
      setDetails(null);
      setPhase('login-required');
      return;
    }
    if (!validToken) {
      setDetails(null);
      setFailureMessage(BUSINESS_AUTH_MESSAGES.invitationInspect);
      setPhase('error');
      return;
    }

    setPhase('loading');
    setFailureMessage(BUSINESS_AUTH_MESSAGES.invitationInspect);
    try {
      const invitation = await businessApi.inspectInvitation(validToken);
      setDetails(invitation);
      if (invitation.status === 'expired') setPhase('expired');
      else if (invitation.status !== 'pending') setPhase('used');
      else setPhase('ready');
    } catch (error) {
      setDetails(null);
      setPhase(phaseForInvitationError(error));
    }
  }, [user, validToken]);

  useEffect(() => {
    void inspectInvitation();
  }, [inspectInvitation]);

  const acceptInvitation = async () => {
    if (!validToken) return;

    setAccepting(true);
    try {
      await businessApi.acceptInvitation(validToken);
      router.replace('/' as never);
    } catch (error) {
      setFailureMessage(BUSINESS_AUTH_MESSAGES.invitationAccept);
      setPhase(phaseForInvitationError(error));
    } finally {
      setAccepting(false);
    }
  };

  const openSignIn = () => {
    router.push({
      pathname: '/sign-in',
      params: redirect ? { redirect } : {},
    } as never);
  };

  const openSignUp = () => {
    router.push({
      pathname: '/sign-up',
      params: redirect ? { redirect } : {},
    } as never);
  };

  const switchAccount = async () => {
    await signOut();
    router.replace({
      pathname: '/sign-in',
      params: redirect ? { redirect } : {},
    } as never);
  };

  const roleLabel = details?.invitedRole === 'admin'
    ? 'Administrador'
    : 'Profissional';

  return (
    <AuthScreen
      testID="business-invite-screen"
      eyebrow="CONVITE PROTEGIDO"
      title={user ? 'Confirme seu vínculo.' : 'Entre para verificar o convite.'}
      description="O convite é pessoal, expira e só pode ser aceito pela conta correspondente."
    >
      {!isConfigured ? (
        <AuthNotice
          testID="business-invite-not-configured"
          tone="danger"
          message={BUSINESS_AUTH_MESSAGES.notConfigured}
        />
      ) : null}
      {!validToken ? (
        <AuthNotice
          testID="business-invite-invalid"
          tone="danger"
          message={BUSINESS_AUTH_MESSAGES.invalidInvitation}
        />
      ) : null}

      {validToken && phase === 'login-required' ? (
        <>
          <AuthNotice
            message="Entre ou crie uma conta usando exatamente o e-mail que recebeu o convite."
          />
          <AuthButton label="Entrar e continuar" onPress={openSignIn} />
          <AuthButton
            label="Criar conta com o convite"
            variant="secondary"
            onPress={openSignUp}
          />
        </>
      ) : null}

      {phase === 'loading' ? (
        <AuthNotice testID="business-invite-loading" message="Verificando convite e identidade…" />
      ) : null}

      {phase === 'ready' && details ? (
        <>
          <View style={styles.details}>
            <Detail label="Estabelecimento" value={details.establishmentName} />
            <Detail label="Papel" value={roleLabel} />
            <Detail label="E-mail autorizado" value={details.invitedEmail} />
            <Detail label="Expira em" value={formatExpiration(details.expiresAt)} />
          </View>
          <AuthButton
            testID="business-invite-accept"
            label={`Aceitar como ${roleLabel}`}
            busy={accepting}
            onPress={() => void acceptInvitation()}
          />
          <Text style={styles.currentAccount}>Conectado como {user?.email}</Text>
        </>
      ) : null}

      {phase === 'expired' ? (
        <AuthNotice
          testID="business-invite-expired"
          tone="danger"
          message={BUSINESS_AUTH_MESSAGES.expiredInvitation}
        />
      ) : null}
      {phase === 'used' ? (
        <AuthNotice
          testID="business-invite-used"
          tone="danger"
          message={BUSINESS_AUTH_MESSAGES.usedInvitation}
        />
      ) : null}
      {phase === 'mismatch' ? (
        <AuthNotice
          testID="business-invite-mismatch"
          tone="danger"
          message={BUSINESS_AUTH_MESSAGES.invitationMismatch}
        />
      ) : null}
      {phase === 'error' && validToken ? (
        <AuthNotice
          testID="business-invite-error"
          tone="danger"
          message={failureMessage}
        />
      ) : null}

      {user && phase !== 'ready' && phase !== 'loading' ? (
        <>
          <AuthButton
            label="Tentar verificar novamente"
            variant="secondary"
            onPress={() => void inspectInvitation()}
          />
          <AuthButton
            label="Sair e usar outra conta"
            variant="text"
            onPress={() => void switchAccount()}
          />
        </>
      ) : null}
    </AuthScreen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  details: {
    gap: 9,
  },
  detail: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#30483D',
    backgroundColor: '#15241E',
    padding: 13,
    gap: 3,
  },
  detailLabel: {
    color: '#839188',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  detailValue: {
    color: '#F5F8F6',
    fontSize: 14,
    fontWeight: '700',
  },
  currentAccount: {
    color: '#839188',
    fontSize: 12,
    textAlign: 'center',
  },
});
