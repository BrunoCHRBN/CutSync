import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FeedbackState } from '@/components/cloud/feedback-state';
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
import { useControlAuth } from '@/contexts/control-auth-context';
import { corporateCasePath } from '@/navigation/cloud-routes';
import {
  createCorporateAccessCase,
  createCorporateCaseIdempotencyKey,
  findCorporateCaseIdentityByEmail,
  getCorporateCasesReadContext,
  listCorporateAccessRequestProfiles,
  parseCorporateAccessExpiryInput,
  type CorporateAccessCaseAction,
  type CorporateAccessRequestProfile,
  type CorporateCaseIdentity,
} from '@/services/corporate-cases';
import { controlColors, controlRadii, controlSpacing, controlType } from '@/theme/tokens';

interface PendingAccessCase {
  beneficiary: CorporateCaseIdentity;
  profile: CorporateAccessRequestProfile;
  action: CorporateAccessCaseAction;
  validUntil: string | null;
  justification: string;
  observers: CorporateCaseIdentity[];
  clientRequestId: string;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function IdentityCard({
  identity,
  role,
  onRemove,
}: {
  identity: CorporateCaseIdentity;
  role: string;
  onRemove?: () => void;
}) {
  return (
    <View style={styles.identityCard}>
      <View style={styles.identityCopy}>
        <Text style={styles.identityName}>{identity.name}</Text>
        <Text style={styles.meta} selectable>{identity.email}</Text>
      </View>
      <ControlStatusBadge label={role} tone="info" />
      {onRemove ? (
        <Pressable accessibilityRole="button" onPress={onRemove} style={styles.removeButton}>
          <Text style={styles.removeButtonText}>Remover</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function CorporateAccessCaseCreateScreen() {
  const router = useRouter();
  const { context: authContext } = useControlAuth();
  const [runtimeEnabled, setRuntimeEnabled] = useState<boolean | null>(null);
  const [creationEnabled, setCreationEnabled] = useState<boolean | null>(null);
  const [profiles, setProfiles] = useState<CorporateAccessRequestProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [beneficiaryEmail, setBeneficiaryEmail] = useState('');
  const [beneficiary, setBeneficiary] = useState<CorporateCaseIdentity | null>(null);
  const [searchingBeneficiary, setSearchingBeneficiary] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<CorporateAccessRequestProfile | null>(null);
  const [action, setAction] = useState<CorporateAccessCaseAction>('grant');
  const [expiryInput, setExpiryInput] = useState('');
  const [justification, setJustification] = useState('');
  const [observerEmail, setObserverEmail] = useState('');
  const [observers, setObservers] = useState<CorporateCaseIdentity[]>([]);
  const [searchingObserver, setSearchingObserver] = useState(false);
  const [formError, setFormError] = useState('');
  const [pending, setPending] = useState<PendingAccessCase | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadForm = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const readContext = await getCorporateCasesReadContext();
      setRuntimeEnabled(readContext.enabled);
      setCreationEnabled(readContext.creationEnabled);
      if (!readContext.enabled || !readContext.creationEnabled) {
        setProfiles([]);
        return;
      }
      setProfiles(await listCorporateAccessRequestProfiles());
    } catch (error) {
      setLoadError(errorMessage(error, 'Não foi possível preparar o formulário protegido.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadForm();
    return undefined;
  }, [loadForm]));

  const searchBeneficiary = useCallback(async () => {
    setSearchingBeneficiary(true);
    setBeneficiary(null);
    setFormError('');
    try {
      const found = await findCorporateCaseIdentityByEmail(beneficiaryEmail);
      if (!found) {
        setFormError('Nenhuma identidade Control ativa foi encontrada com esse e-mail exato.');
        return;
      }
      setBeneficiary(found);
      setObservers((current) => current.filter((observer) => observer.profileId !== found.profileId));
    } catch (error) {
      setFormError(errorMessage(error, 'Não foi possível localizar a pessoa beneficiária.'));
    } finally {
      setSearchingBeneficiary(false);
    }
  }, [beneficiaryEmail]);

  const addObserver = useCallback(async () => {
    if (observers.length >= 10) {
      setFormError('O chamado aceita no máximo 10 observadores.');
      return;
    }
    setSearchingObserver(true);
    setFormError('');
    try {
      const found = await findCorporateCaseIdentityByEmail(observerEmail);
      if (!found) {
        setFormError('Nenhuma identidade Control ativa foi encontrada com esse e-mail exato.');
        return;
      }
      if (found.profileId === authContext?.profileId) {
        setFormError('Você já acompanha o chamado como solicitante.');
        return;
      }
      if (found.profileId === beneficiary?.profileId) {
        setFormError('A pessoa beneficiária já acompanha o chamado automaticamente.');
        return;
      }
      if (observers.some((observer) => observer.profileId === found.profileId)) {
        setFormError('Essa pessoa já foi adicionada como observadora.');
        return;
      }
      setObservers((current) => [...current, found]);
      setObserverEmail('');
    } catch (error) {
      setFormError(errorMessage(error, 'Não foi possível adicionar o observador.'));
    } finally {
      setSearchingObserver(false);
    }
  }, [authContext?.profileId, beneficiary?.profileId, observerEmail, observers]);

  const prepare = useCallback(() => {
    setFormError('');
    try {
      if (!beneficiary) throw new Error('beneficiary_required');
      if (!selectedProfile) throw new Error('profile_required');
      const validUntil = action === 'grant'
        ? parseCorporateAccessExpiryInput(expiryInput)
        : null;
      if (action === 'grant' && selectedProfile.requiresExpiry && !validUntil) {
        throw new Error('expiry_required');
      }
      const normalizedJustification = justification.trim();
      if (normalizedJustification.length < 20 || normalizedJustification.length > 2000) {
        throw new Error('justification_required');
      }
      setPending({
        beneficiary,
        profile: selectedProfile,
        action,
        validUntil,
        justification: normalizedJustification,
        observers,
        clientRequestId: createCorporateCaseIdempotencyKey(),
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      const message = {
        beneficiary_required: 'Localize e confirme a pessoa beneficiária.',
        profile_required: 'Selecione o pacote de acesso solicitado.',
        expiry_required: 'O pacote selecionado exige uma data de expiração.',
        justification_required: 'A justificativa deve ter entre 20 e 2.000 caracteres.',
      }[code] ?? errorMessage(error, 'Revise os campos antes de continuar.');
      setFormError(message);
    }
  }, [action, beneficiary, expiryInput, justification, observers, selectedProfile]);

  const submit = useCallback(async () => {
    if (!pending || submitting) return;
    setSubmitting(true);
    setFormError('');
    try {
      const result = await createCorporateAccessCase({
        beneficiaryProfileId: pending.beneficiary.profileId,
        requestedProfileKey: pending.profile.profileKey,
        action: pending.action,
        validUntil: pending.validUntil,
        justification: pending.justification,
        observerProfileIds: pending.observers.map((observer) => observer.profileId),
        clientRequestId: pending.clientRequestId,
      });
      setPending(null);
      router.replace(corporateCasePath(result.caseId) as never);
    } catch (error) {
      setFormError(errorMessage(error, 'Não foi possível abrir o chamado.'));
    } finally {
      setSubmitting(false);
    }
  }, [pending, router, submitting]);

  return (
    <SectionPage
      eyebrow="CHAMADOS · ACESSOS"
      title="Abrir chamado de liberação de acesso"
      description="Registre a necessidade e os envolvidos. A abertura cria a triagem, mas não aprova nem altera acessos."
    >
      {loading ? <ControlNotice title="Formulário" message="Preparando catálogos e políticas protegidas..." tone="info" /> : null}
      {!loading && loadError ? (
        <FeedbackState kind="error" title="Formulário indisponível" message={loadError} actionLabel="Tentar novamente" onAction={() => { void loadForm(); }} />
      ) : null}
      {!loading && !loadError && (!runtimeEnabled || !creationEnabled) ? (
        <FeedbackState
          kind="maintenance"
          title="Abertura ainda não habilitada"
          message="A leitura do módulo está preparada, mas o piloto de criação continua desligado no backend."
        />
      ) : null}

      {!loading && !loadError && runtimeEnabled && creationEnabled ? (
        <>
          {formError ? <ControlNotice title="Revise o chamado" message={formError} tone="danger" /> : null}

          <ControlCard>
            <Text style={styles.sectionTitle}>1. Pessoa beneficiária</Text>
            <Text style={styles.description}>A busca exige o e-mail exato de uma identidade Control ativa.</Text>
            <View style={styles.row}>
              <ControlField
                autoCapitalize="none"
                containerStyle={styles.flexField}
                keyboardType="email-address"
                label="E-mail corporativo"
                onChangeText={(value) => {
                  setBeneficiaryEmail(value);
                  setBeneficiary(null);
                }}
                value={beneficiaryEmail}
              />
              <ControlButton busy={searchingBeneficiary} label="Localizar pessoa" onPress={() => { void searchBeneficiary(); }} />
            </View>
            {beneficiary ? <IdentityCard identity={beneficiary} role="BENEFICIÁRIO" /> : null}
          </ControlCard>

          <ControlCard>
            <Text style={styles.sectionTitle}>2. Ação e pacote</Text>
            <View style={styles.actions}>
              <ControlButton label="Conceder acesso" onPress={() => setAction('grant')} variant={action === 'grant' ? 'primary' : 'secondary'} />
              <ControlButton label="Revogar acesso" onPress={() => setAction('revoke')} variant={action === 'revoke' ? 'danger' : 'secondary'} />
            </View>
            {profiles.length === 0 ? (
              <ControlEmptyState title="Nenhum pacote disponível" description="Não há pacotes delegáveis ativos para este piloto." />
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
                        Política: {profile.requiredApprovals} aprovação(ões){profile.requiresOwnerApproval ? ' · owner obrigatório' : ''} · revisão em {profile.reviewIntervalDays} dias
                      </Text>
                      <ControlButton label={selected ? 'Pacote selecionado' : 'Selecionar pacote'} onPress={() => setSelectedProfile(profile)} variant={selected ? 'primary' : 'outline'} />
                    </ControlCard>
                  );
                })}
              </View>
            )}
          </ControlCard>

          <ControlCard>
            <Text style={styles.sectionTitle}>3. Necessidade e validade</Text>
            {action === 'grant' ? (
              <ControlField
                helper={selectedProfile?.requiresExpiry ? 'Obrigatória. Formato AAAA-MM-DD, limitada a 366 dias.' : 'Opcional. Formato AAAA-MM-DD, limitada a 366 dias.'}
                label="Expiração do acesso"
                onChangeText={setExpiryInput}
                placeholder="AAAA-MM-DD"
                value={expiryInput}
              />
            ) : null}
            <ControlField
              helper="Informe contexto, necessidade, escopo esperado e impacto. Não inclua senha, token ou documento."
              label="Justificativa"
              multiline
              onChangeText={setJustification}
              value={justification}
            />
          </ControlCard>

          <ControlCard>
            <Text style={styles.sectionTitle}>4. Observadores</Text>
            <Text style={styles.description}>Até 10 pessoas podem acompanhar todas as atualizações visíveis do chamado.</Text>
            <View style={styles.row}>
              <ControlField
                autoCapitalize="none"
                containerStyle={styles.flexField}
                keyboardType="email-address"
                label="E-mail exato do observador"
                onChangeText={setObserverEmail}
                value={observerEmail}
              />
              <ControlButton busy={searchingObserver} disabled={observers.length >= 10} label="Adicionar observador" onPress={() => { void addObserver(); }} variant="secondary" />
            </View>
            {observers.map((observer) => (
              <IdentityCard
                key={observer.profileId}
                identity={observer}
                role="OBSERVADOR"
                onRemove={() => setObservers((current) => current.filter((item) => item.profileId !== observer.profileId))}
              />
            ))}
          </ControlCard>

          <ControlButton label="Revisar chamado" onPress={prepare} />

          {pending ? (
            <ControlConfirmPanel
              busy={submitting}
              confirmLabel="Abrir chamado"
              description={`${pending.action === 'grant' ? 'Conceder' : 'Revogar'} ${pending.profile.label} para ${pending.beneficiary.name}. O chamado seguirá para triagem; nenhum acesso será alterado agora.`}
              onCancel={() => setPending(null)}
              onConfirm={() => { void submit(); }}
              title="Confirmar abertura"
              tone={pending.profile.riskLevel === 'critical' ? 'danger' : 'warning'}
            >
              <Text style={styles.meta}>Observadores: {pending.observers.length}</Text>
              <Text style={styles.meta}>Aprovações previstas pela política: {pending.profile.requiredApprovals}</Text>
            </ControlConfirmPanel>
          ) : null}
        </>
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
  identityCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: controlSpacing.sm,
    padding: controlSpacing.md,
    borderWidth: 1,
    borderColor: controlColors.border,
    borderRadius: controlRadii.md,
    backgroundColor: controlColors.surfaceMuted,
  },
  identityCopy: { flex: 1, minWidth: 220, gap: 2 },
  identityName: { ...controlType.bodyStrong, color: controlColors.text },
  removeButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: controlSpacing.sm },
  removeButtonText: { ...controlType.smallStrong, color: controlColors.danger },
});
