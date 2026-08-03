import type { BusinessInvitationRole, BusinessTeamInvitation, BusinessTeamMember } from '@cutsync/database';
import { createMobileRequestId } from '@cutsync/domain';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';

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
import { BusinessFeatureError } from '@/features/connectivity/business-rpc';
import { businessQueryClient, createBusinessQueryKey } from '@/features/connectivity/business-query';
import { getBusinessInvitationShareUrl } from '@/features/links/business-deep-links';
import { businessTeamApi } from '@/features/team/business-team-api';
import { useBusinessTeam } from '@/features/team/use-business-team';
import { businessTheme } from '@/theme/business-theme';

type TeamCommand =
  | { kind: 'invitation'; invitation: BusinessTeamInvitation; action: 'resend' | 'revoke'; requestId: string }
  | { kind: 'member'; member: BusinessTeamMember; action: 'suspend' | 'reactivate' | 'remove'; requestId: string }
  | { kind: 'commission'; member: BusinessTeamMember; rate: number; requestId: string };
type TeamCommandInput = TeamCommand extends infer Command
  ? Command extends TeamCommand ? Omit<Command, 'requestId'> : never
  : never;

const messageFor = (error: unknown) => error instanceof BusinessFeatureError
  ? error.message
  : 'Não foi possível atualizar a equipe.';

export function BusinessTeamScreen() {
  const router = useRouter();
  const { user } = useBusinessSession();
  const { activeContext, hasCapability } = useBusinessOperational();
  const team = useBusinessTeam();
  const [contact, setContact] = useState('');
  const [role, setRole] = useState<BusinessInvitationRole>('professional');
  const inviteRequestId = useRef<string | null>(null);
  const inviteShareToken = useRef<string | null>(null);
  const commandShareToken = useRef<string | null>(null);
  const [lastCommand, setLastCommand] = useState<TeamCommand | null>(null);
  const canManage = hasCapability('manage_team') && activeContext?.accessMode === 'full';
  const canManageAdmins = hasCapability('manage_admins') && activeContext?.accessMode === 'full';

  const shareInvitationToken = async (invitationToken: string | null) => {
    const url = invitationToken ? getBusinessInvitationShareUrl(invitationToken) : null;
    if (!url) {
      Alert.alert('Convite indisponível', 'Atualize a equipe e tente novamente.');
      return;
    }
    try {
      await Share.share({
        title: 'Convite CutSync Business',
        message: `Abra seu convite no CutSync Business: ${url}`,
        url,
      });
    } catch {
      Alert.alert('Não foi possível compartilhar', 'O convite continua pendente. Rotacione-o para gerar um novo link.');
    }
  };

  const invalidate = async () => {
    if (!user || !activeContext) return;
    await Promise.all([
      businessQueryClient.invalidateQueries({
        queryKey: createBusinessQueryKey(user.id, activeContext.establishmentId, 'team'),
      }),
      businessQueryClient.invalidateQueries({
        queryKey: createBusinessQueryKey(user.id, activeContext.establishmentId, 'services'),
      }),
    ]);
  };

  const invite = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!activeContext) throw new BusinessFeatureError('invalid_request');
      inviteRequestId.current ??= createMobileRequestId();
      const result = await businessTeamApi.invite(
        activeContext.establishmentId,
        contact,
        role,
        inviteRequestId.current,
      );
      inviteShareToken.current = result.invitationToken;
      return { ...result, invitationToken: null };
    },
    onSuccess: async () => {
      inviteRequestId.current = null;
      setContact('');
      const invitationToken = inviteShareToken.current;
      inviteShareToken.current = null;
      await shareInvitationToken(invitationToken);
      await invalidate();
    },
    onError: () => {
      inviteShareToken.current = null;
    },
  });

  const command = useMutation({
    retry: false,
    mutationFn: async (input: TeamCommand) => {
      if (!activeContext) throw new BusinessFeatureError('invalid_request');
      setLastCommand(input);
      if (input.kind === 'invitation') {
        const result = await businessTeamApi.invitationAction(
          activeContext.establishmentId,
          input.invitation.id,
          input.action,
          input.requestId,
        );
        commandShareToken.current = result.invitationToken;
        return {
          kind: 'invitation' as const,
          action: input.action,
        };
      }
      if (input.kind === 'member') {
        await businessTeamApi.memberStatus(activeContext.establishmentId, input.member.membershipId, input.action, input.requestId);
        return { kind: 'member' as const };
      }
      await businessTeamApi.updateCommission(activeContext.establishmentId, input.member.membershipId, input.rate, input.requestId);
      return { kind: 'commission' as const };
    },
    onSuccess: async (result) => {
      setLastCommand(null);
      const invitationToken = commandShareToken.current;
      commandShareToken.current = null;
      if (
        result.kind === 'invitation'
        && result.action === 'resend'
        && invitationToken
      ) {
        await shareInvitationToken(invitationToken);
      }
      await invalidate();
    },
    onError: () => {
      commandShareToken.current = null;
    },
  });

  const dispatch = (input: TeamCommandInput) => {
    command.mutate({ ...input, requestId: createMobileRequestId() } as TeamCommand);
  };

  return (
    <BusinessPage testID="business-team-screen">
      <BusinessHeader eyebrow="ACESSOS DA UNIDADE" title="Equipe" description={activeContext?.establishmentName} />
      <BusinessButton label="Voltar" variant="ghost" onPress={() => router.back()} />
      {!canManage ? <BusinessNotice tone="warning" message="A gestão de equipe está bloqueada para seu papel ou modo de acesso." /> : null}

      {canManage ? (
        <BusinessCard style={styles.form}>
          <BusinessSectionTitle>Convidar</BusinessSectionTitle>
          <TextInput
            value={contact}
            onChangeText={(value) => { setContact(value); inviteRequestId.current = null; invite.reset(); }}
            placeholder="E-mail ou telefone confirmado"
            placeholderTextColor={businessTheme.colors.textMuted}
            autoCapitalize="none"
            style={styles.input}
          />
          <View style={styles.roleRow}>
            {(['professional', 'admin'] as const).map((item) => (
              <Pressable
                key={item}
                disabled={item === 'admin' && !canManageAdmins}
                onPress={() => { setRole(item); inviteRequestId.current = null; invite.reset(); }}
                style={[styles.roleButton, role === item && styles.roleButtonSelected, item === 'admin' && !canManageAdmins && styles.disabled]}
              >
                <Text style={styles.roleText}>{item === 'professional' ? 'Profissional' : 'Administrador'}</Text>
              </Pressable>
            ))}
          </View>
          {invite.error ? <BusinessNotice tone="danger" message={messageFor(invite.error)} /> : null}
          <BusinessButton label={invite.isError && inviteRequestId.current ? 'Tentar convite com o mesmo comando' : 'Enviar convite'} loading={invite.isPending} disabled={!contact.trim()} onPress={() => invite.mutate()} />
        </BusinessCard>
      ) : null}

      {command.error ? (
        <BusinessCard>
          <BusinessNotice tone="danger" message={messageFor(command.error)} />
          {lastCommand ? <BusinessButton label="Repetir o mesmo comando" variant="secondary" onPress={() => command.mutate(lastCommand)} /> : null}
        </BusinessCard>
      ) : null}

      <View style={styles.section}>
        <BusinessSectionTitle>Membros</BusinessSectionTitle>
        {team.isLoading ? <BusinessNotice message="Carregando equipe…" /> : null}
        {team.error ? <BusinessNotice tone="danger" message={messageFor(team.error)} /> : null}
        {team.data?.members.map((member) => (
          <MemberCard
            key={member.membershipId}
            member={member}
            busy={command.isPending}
            canManage={canManage && (member.role !== 'admin' || canManageAdmins)}
            onCommand={dispatch}
          />
        ))}
      </View>

      <View style={styles.section}>
        <BusinessSectionTitle>Convites</BusinessSectionTitle>
        {team.data?.invitations.length === 0 ? <BusinessNotice message="Nenhum convite registrado." /> : team.data?.invitations.map((invitation) => {
          const allowed = canManage && (invitation.invitedRole !== 'admin' || canManageAdmins);
          return (
            <BusinessCard key={invitation.id}>
              <View style={styles.row}>
                <View style={styles.copy}>
                  <Text selectable style={styles.title}>{invitation.targetContact}</Text>
                  <Text selectable style={styles.meta}>{invitation.invitedRole === 'admin' ? 'Administrador' : 'Profissional'} · {invitation.status}</Text>
                </View>
                <BusinessPill label={invitation.status} tone={invitation.status === 'pending' ? 'warning' : 'neutral'} />
              </View>
              {allowed && invitation.status !== 'accepted' ? (
                <View style={styles.actions}>
                  <BusinessButton label="Rotacionar e compartilhar" variant="secondary" disabled={command.isPending} onPress={() => dispatch({ kind: 'invitation', invitation, action: 'resend' })} />
                  {invitation.status === 'pending' ? <BusinessButton label="Revogar" variant="danger" disabled={command.isPending} onPress={() => dispatch({ kind: 'invitation', invitation, action: 'revoke' })} /> : null}
                </View>
              ) : null}
            </BusinessCard>
          );
        })}
      </View>
    </BusinessPage>
  );
}

function MemberCard({ member, canManage, busy, onCommand }: {
  member: BusinessTeamMember;
  canManage: boolean;
  busy: boolean;
  onCommand: (input: TeamCommandInput) => void;
}) {
  const [commission, setCommission] = useState(String(Math.round(member.commissionRate * 100)));
  return (
    <BusinessCard>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text selectable style={styles.title}>{member.name}</Text>
          <Text selectable style={styles.meta}>{member.role === 'admin' ? 'Administrador' : 'Profissional'} · {member.email ?? member.phone ?? 'Contato protegido'}</Text>
          <Text selectable style={styles.projection}>{Math.round(member.commissionRate * 100)}% de repasse projetado — não é receita recebida</Text>
        </View>
        <BusinessPill label={member.status === 'active' ? 'Ativo' : 'Suspenso'} tone={member.status === 'active' ? 'success' : 'warning'} />
      </View>
      {canManage ? (
        <>
          <View style={styles.commissionRow}>
            <TextInput value={commission} onChangeText={setCommission} keyboardType="number-pad" style={[styles.input, styles.commissionInput]} />
            <BusinessButton label="Atualizar %" variant="secondary" disabled={busy} onPress={() => onCommand({ kind: 'commission', member, rate: Number(commission) / 100 })} />
          </View>
          <BusinessButton
            label={member.status === 'active' ? 'Suspender acesso' : 'Reativar acesso'}
            variant="secondary"
            disabled={busy}
            onPress={() => onCommand({ kind: 'member', member, action: member.status === 'active' ? 'suspend' : 'reactivate' })}
          />
          <BusinessButton
            label="Remover acesso"
            variant="danger"
            disabled={busy}
            onPress={() => Alert.alert('Remover acesso?', 'O vínculo será revogado; o perfil da pessoa não será apagado.', [
              { text: 'Voltar', style: 'cancel' },
              { text: 'Remover', style: 'destructive', onPress: () => onCommand({ kind: 'member', member, action: 'remove' }) },
            ])}
          />
        </>
      ) : null}
    </BusinessCard>
  );
}

const styles = StyleSheet.create({
  section: { gap: businessTheme.spacing.sm },
  form: { gap: businessTheme.spacing.sm },
  input: { minHeight: businessTheme.sizing.control, borderWidth: 1, borderColor: businessTheme.colors.borderStrong, borderRadius: businessTheme.radii.md, paddingHorizontal: businessTheme.spacing.md, backgroundColor: businessTheme.colors.canvasRaised, color: businessTheme.colors.text },
  roleRow: { flexDirection: 'row', gap: businessTheme.spacing.sm },
  roleButton: { flex: 1, minHeight: businessTheme.sizing.control, alignItems: 'center', justifyContent: 'center', borderRadius: businessTheme.radii.md, backgroundColor: businessTheme.colors.surfaceMuted },
  roleButtonSelected: { borderWidth: 1, borderColor: businessTheme.colors.accent },
  roleText: { ...businessTheme.typography.bodyStrong, color: businessTheme.colors.text },
  disabled: { opacity: businessTheme.opacity.disabled },
  row: { flexDirection: 'row', gap: businessTheme.spacing.md, alignItems: 'flex-start' },
  copy: { flex: 1, gap: businessTheme.spacing.xxs },
  title: { ...businessTheme.typography.heading, color: businessTheme.colors.text },
  meta: { ...businessTheme.typography.body, color: businessTheme.colors.textSoft },
  projection: { ...businessTheme.typography.caption, color: businessTheme.colors.accent },
  actions: { gap: businessTheme.spacing.sm },
  commissionRow: { flexDirection: 'row', gap: businessTheme.spacing.sm, alignItems: 'center' },
  commissionInput: { width: 82 },
});
