import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  ControlButton,
  ControlCard,
  ControlConfirmPanel,
  ControlEmptyState,
  ControlField,
  ControlNotice,
  ControlStatusBadge,
} from '@/components/control-ui';
import { SectionPage } from '@/components/section-page';
import { AccessWorkflowNavigation } from '@/modules/gsp/access-workflow-navigation';
import {
  getControlAccessErrorMessage,
  parseControlAccessExpiryInput,
  type ControlAccessProfile,
} from '@/services/control-access';
import {
  createControlAccessRequest,
  createControlIdempotencyKey,
  findControlAccessTargetByEmail,
  listControlDelegatedAccessProfiles,
  type ControlAccessRequestAction,
  type ControlDelegatedAccessProfile,
} from '@/services/control-access-workflow';
import { controlColors, controlSpacing, controlType } from '@/theme/tokens';

interface PendingRequest {
  target: ControlAccessProfile;
  profile: ControlDelegatedAccessProfile;
  action: ControlAccessRequestAction;
  validUntil: string | null;
  justification: string;
  ticketReference: string;
  clientRequestId: string;
}

export function AccessRequestCreateScreen() {
  const [profiles, setProfiles] = useState<ControlDelegatedAccessProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<ControlDelegatedAccessProfile | null>(null);
  const [action, setAction] = useState<ControlAccessRequestAction>('grant');
  const [email, setEmail] = useState('');
  const [target, setTarget] = useState<ControlAccessProfile | null>(null);
  const [searching, setSearching] = useState(false);
  const [expiryInput, setExpiryInput] = useState('');
  const [ticketReference, setTicketReference] = useState('');
  const [justification, setJustification] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadProfiles = useCallback(async () => {
    setLoadingProfiles(true);
    setProfileError('');
    try {
      setProfiles(await listControlDelegatedAccessProfiles());
    } catch (error) {
      setProfileError(getControlAccessErrorMessage(error, 'Não foi possível consultar os perfis disponíveis.'));
    } finally {
      setLoadingProfiles(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadProfiles();
    return undefined;
  }, [loadProfiles]));

  const searchTarget = useCallback(async () => {
    setSearching(true);
    setTarget(null);
    setFormError('');
    setNotice(null);
    try {
      const found = await findControlAccessTargetByEmail(email);
      if (!found) {
        setFormError('Nenhuma conta ativa foi encontrada com esse e-mail exato.');
        return;
      }
      setTarget(found);
    } catch (error) {
      setFormError(getControlAccessErrorMessage(error, 'Não foi possível localizar a conta informada.'));
    } finally {
      setSearching(false);
    }
  }, [email]);

  const prepareRequest = useCallback(() => {
    setFormError('');
    setNotice(null);
    try {
      if (!target) throw new Error('target_required');
      if (!selectedProfile) throw new Error('profile_required');
      const validUntil = action === 'grant'
        ? parseControlAccessExpiryInput(expiryInput)
        : null;
      if (action === 'grant' && selectedProfile.requiresExpiry && !validUntil) {
        throw new Error('expiry_required');
      }
      if (ticketReference.trim().length < 3 || ticketReference.trim().length > 100) {
        throw new Error('ticket_required');
      }
      if (justification.trim().length < 10 || justification.trim().length > 500) {
        throw new Error('reason_required');
      }

      setPending({
        target,
        profile: selectedProfile,
        action,
        validUntil,
        justification: justification.trim(),
        ticketReference: ticketReference.trim(),
        clientRequestId: createControlIdempotencyKey(),
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      const message = {
        target_required: 'Localize e confirme a conta que receberá a alteração.',
        profile_required: 'Selecione o pacote de acesso solicitado.',
        expiry_required: 'O perfil selecionado exige uma data de expiração.',
        ticket_required: 'Informe uma referência de chamado entre 3 e 100 caracteres.',
        reason_required: 'Informe uma justificativa entre 10 e 500 caracteres.',
      }[code] ?? getControlAccessErrorMessage(error, 'Revise os campos antes de continuar.');
      setFormError(message);
    }
  }, [action, expiryInput, justification, selectedProfile, target, ticketReference]);

  const submitRequest = useCallback(async () => {
    if (!pending || submitting) return;
    setSubmitting(true);
    setNotice(null);
    try {
      const result = await createControlAccessRequest({
        targetProfileId: pending.target.profileId,
        requestedProfileKey: pending.profile.profileKey,
        action: pending.action,
        validUntil: pending.validUntil,
        justification: pending.justification,
        ticketReference: pending.ticketReference,
        clientRequestId: pending.clientRequestId,
      });
      setPending(null);
      setSelectedProfile(null);
      setTarget(null);
      setEmail('');
      setExpiryInput('');
      setTicketReference('');
      setJustification('');
      setNotice({
        title: `Solicitação #${result.requestNumber ?? ''} criada`,
        message: `A solicitação aguarda ${result.requiredApprovals ?? 1} aprovação(ões) independente(s).`,
      });
    } catch (error) {
      setFormError(getControlAccessErrorMessage(error, 'Não foi possível criar a solicitação.'));
    } finally {
      setSubmitting(false);
    }
  }, [pending, submitting]);

  return (
    <SectionPage
      eyebrow="GSP · ACESSOS"
      title="Solicitar alteração de acesso"
      description="Abra uma solicitação rastreável. A criação não concede acesso: aprovação e aplicação são etapas independentes."
    >
      <AccessWorkflowNavigation />

      {notice ? <ControlNotice title={notice.title} message={notice.message} tone="success" /> : null}
      {formError ? <ControlNotice title="Revise a solicitação" message={formError} tone="danger" /> : null}

      <ControlCard>
        <Text style={styles.sectionTitle}>1. Pessoa</Text>
        <Text style={styles.description}>A busca aceita somente o e-mail exato de uma conta CutSync existente.</Text>
        <View style={styles.row}>
          <ControlField
            autoCapitalize="none"
            keyboardType="email-address"
            label="E-mail corporativo da conta"
            onChangeText={(value) => {
              setEmail(value);
              setTarget(null);
            }}
            value={email}
            containerStyle={styles.flexField}
          />
          <ControlButton busy={searching} label="Localizar conta" onPress={() => { void searchTarget(); }} />
        </View>
        {target ? (
          <ControlNotice
            title={target.name}
            message={`${target.email} · Identidade confirmada por UUID`}
            tone="success"
          />
        ) : null}
      </ControlCard>

      <ControlCard>
        <Text style={styles.sectionTitle}>2. Ação e perfil</Text>
        <View style={styles.actions}>
          <ControlButton
            label="Conceder perfil"
            onPress={() => setAction('grant')}
            variant={action === 'grant' ? 'primary' : 'secondary'}
          />
          <ControlButton
            label="Revogar perfil"
            onPress={() => setAction('revoke')}
            variant={action === 'revoke' ? 'danger' : 'secondary'}
          />
        </View>

        {loadingProfiles ? (
          <ControlNotice message="Carregando perfis delegáveis..." title="Perfis de acesso" tone="info" />
        ) : profileError ? (
          <ControlEmptyState
            title="Perfis indisponíveis"
            description={profileError}
            action={{ label: 'Tentar novamente', onPress: () => { void loadProfiles(); } }}
          />
        ) : (
          <View style={styles.profileGrid}>
            {profiles.map((profile) => {
              const selected = selectedProfile?.profileId === profile.profileId;
              return (
                <ControlCard key={profile.profileId} tone={selected ? 'info' : 'neutral'} style={styles.profileCard}>
                  <View style={styles.profileHeading}>
                    <Text style={styles.profileTitle}>{profile.label}</Text>
                    <ControlStatusBadge label={profile.riskLevel.toUpperCase()} tone={profile.riskLevel === 'critical' ? 'danger' : profile.riskLevel === 'high' ? 'warning' : 'info'} />
                  </View>
                  <Text style={styles.description}>{profile.description}</Text>
                  <Text style={styles.meta}>
                    {profile.requiredApprovals} aprovação(ões) · revisão a cada {profile.reviewIntervalDays} dias
                  </Text>
                  <ControlButton
                    label={selected ? 'Perfil selecionado' : 'Selecionar perfil'}
                    onPress={() => setSelectedProfile(profile)}
                    variant={selected ? 'primary' : 'outline'}
                  />
                </ControlCard>
              );
            })}
          </View>
        )}
      </ControlCard>

      <ControlCard>
        <Text style={styles.sectionTitle}>3. Evidência e validade</Text>
        <ControlField
          label="Referência do chamado interno"
          helper="Exemplo: JSM-123 ou INT-2026-0042."
          onChangeText={setTicketReference}
          value={ticketReference}
        />
        {action === 'grant' ? (
          <ControlField
            label="Expiração do acesso"
            helper={selectedProfile?.requiresExpiry ? 'Obrigatória para este perfil. Formato AAAA-MM-DD.' : 'Opcional. Formato AAAA-MM-DD.'}
            onChangeText={setExpiryInput}
            placeholder="AAAA-MM-DD"
            value={expiryInput}
          />
        ) : null}
        <ControlField
          label="Justificativa"
          helper="Descreva a necessidade, o escopo esperado e o responsável pela validação."
          multiline
          onChangeText={setJustification}
          value={justification}
        />
        <ControlButton label="Revisar solicitação" onPress={prepareRequest} />
      </ControlCard>

      {pending ? (
        <ControlConfirmPanel
          busy={submitting}
          confirmLabel="Enviar para aprovação"
          description={`${pending.action === 'grant' ? 'Conceder' : 'Revogar'} ${pending.profile.label} para ${pending.target.name}. Nenhum acesso será alterado nesta etapa.`}
          onCancel={() => setPending(null)}
          onConfirm={() => { void submitRequest(); }}
          title="Confirmar solicitação"
          tone={pending.profile.riskLevel === 'critical' ? 'danger' : 'warning'}
        >
          <Text style={styles.meta}>Chamado: {pending.ticketReference}</Text>
        </ControlConfirmPanel>
      ) : null}
    </SectionPage>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { ...controlType.sectionTitle, color: controlColors.text },
  description: { ...controlType.body, color: controlColors.textSecondary },
  meta: { ...controlType.smallStrong, color: controlColors.textMuted },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: controlSpacing.md },
  flexField: { minWidth: 260, flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: controlSpacing.sm },
  profileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: controlSpacing.md },
  profileCard: { minWidth: 260, flex: 1, maxWidth: 520 },
  profileHeading: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: controlSpacing.sm },
  profileTitle: { ...controlType.bodyStrong, color: controlColors.text },
});
