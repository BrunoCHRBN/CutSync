import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  ControlButton,
  ControlCard,
  ControlConfirmPanel,
  ControlField,
  ControlNotice,
  ControlStatusBadge,
} from '@/components/control-ui';
import { FeedbackState } from '@/components/cloud/feedback-state';
import { SectionPage } from '@/components/section-page';
import {
  createCorporateCaseIdempotencyKey,
  getCorporateCaseRuntimeAdministrationContext,
  setCorporateCaseRuntimeSettings,
  type CorporateCaseRuntimeAdministrationContext,
  type CorporateCaseRuntimeChange,
  type CorporateCaseRuntimeFlags,
} from '@/services/corporate-cases';
import { cloudTheme } from '@/theme/cloud-components';

type RuntimeFlagKey = keyof CorporateCaseRuntimeFlags;

const flagDefinitions: readonly {
  key: RuntimeFlagKey;
  label: string;
  description: string;
  dependency: string;
}[] = [
  {
    key: 'enabled',
    label: 'Módulo disponível',
    description: 'Libera a fundação e as consultas protegidas de Chamados.',
    dependency: 'Flag raiz. Desligá-la também desliga todas as capacidades dependentes.',
  },
  {
    key: 'creationEnabled',
    label: 'Abertura de chamados',
    description: 'Permite que perfis autorizados enviem novos chamados.',
    dependency: 'Exige Módulo disponível.',
  },
  {
    key: 'workflowEnabled',
    label: 'Fluxo operacional',
    description: 'Permite assumir, encaminhar, aprovar e executar tarefas.',
    dependency: 'Exige Módulo disponível.',
  },
  {
    key: 'automationEnabled',
    label: 'Automações',
    description: 'Habilita processamentos automáticos e geração de entregas pendentes.',
    dependency: 'Exige Módulo disponível.',
  },
  {
    key: 'emailEnabled',
    label: 'Notificações por e-mail',
    description: 'Autoriza a entrega externa de e-mails gerados pelo módulo.',
    dependency: 'Exige Automações.',
  },
  {
    key: 'legacyRedirectsEnabled',
    label: 'Redirecionamentos legados',
    description: 'Direciona fluxos antigos de solicitação para a nova área de Chamados.',
    dependency: 'Exige Módulo disponível.',
  },
] as const;

function flagsFromContext(context: CorporateCaseRuntimeAdministrationContext): CorporateCaseRuntimeFlags {
  const { settings } = context;
  return {
    enabled: settings.enabled,
    creationEnabled: settings.creationEnabled,
    workflowEnabled: settings.workflowEnabled,
    automationEnabled: settings.automationEnabled,
    emailEnabled: settings.emailEnabled,
    legacyRedirectsEnabled: settings.legacyRedirectsEnabled,
  };
}

function sameFlags(left: CorporateCaseRuntimeFlags, right: CorporateCaseRuntimeFlags): boolean {
  return flagDefinitions.every(({ key }) => left[key] === right[key]);
}

function flagDisabled(key: RuntimeFlagKey, flags: CorporateCaseRuntimeFlags): boolean {
  if (key === 'emailEnabled') return !flags.automationEnabled;
  if (key === 'enabled') return false;
  return !flags.enabled;
}

function toggleFlag(flags: CorporateCaseRuntimeFlags, key: RuntimeFlagKey): CorporateCaseRuntimeFlags {
  const next = { ...flags, [key]: !flags[key] };
  if (key === 'enabled' && !next.enabled) {
    return {
      enabled: false,
      creationEnabled: false,
      workflowEnabled: false,
      automationEnabled: false,
      emailEnabled: false,
      legacyRedirectsEnabled: false,
    };
  }
  if (key === 'automationEnabled' && !next.automationEnabled) {
    next.emailEnabled = false;
  }
  return next;
}

function changedFlagLabels(change: CorporateCaseRuntimeChange): string {
  const labels = flagDefinitions
    .filter(({ key }) => change.previousSettings[key] !== change.newSettings[key])
    .map(({ label }) => label);
  return labels.length > 0 ? labels.join(', ') : 'Sem diferença registrada';
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Não foi possível consultar a configuração dos chamados.';
}

export function CorporateCaseRuntimeSettingsScreen() {
  const [context, setContext] = useState<CorporateCaseRuntimeAdministrationContext | null>(null);
  const [draft, setDraft] = useState<CorporateCaseRuntimeFlags | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestSequence.current;
    setLoading(true);
    setError('');
    try {
      const nextContext = await getCorporateCaseRuntimeAdministrationContext(20);
      if (currentRequest !== requestSequence.current) return;
      setContext(nextContext);
      setDraft(flagsFromContext(nextContext));
      setReason('');
      setConfirming(false);
      setPendingRequestId(null);
    } catch (loadError) {
      if (currentRequest === requestSequence.current) {
        setContext(null);
        setDraft(null);
        setError(errorMessage(loadError));
      }
    } finally {
      if (currentRequest === requestSequence.current) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { requestSequence.current += 1; };
  }, [load]));

  const original = useMemo(() => (context ? flagsFromContext(context) : null), [context]);
  const dirty = Boolean(original && draft && !sameFlags(original, draft));
  const reasonLengthValid = reason.trim().length >= 20 && reason.trim().length <= 1000;

  const beginConfirmation = useCallback(() => {
    if (!dirty || !reasonLengthValid) return;
    try {
      setPendingRequestId((current) => current ?? createCorporateCaseIdempotencyKey());
      setConfirming(true);
      setError('');
      setSuccess('');
    } catch (identifierError) {
      setError(errorMessage(identifierError));
    }
  }, [dirty, reasonLengthValid]);

  const save = useCallback(async () => {
    if (!context || !draft || !pendingRequestId) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const result = await setCorporateCaseRuntimeSettings({
        settings: draft,
        expectedVersion: context.settings.version,
        reason,
        requestId: pendingRequestId,
      });
      setSuccess(
        result.idempotent
          ? `Alteração já processada com segurança na versão ${result.resultingVersion}.`
          : `Configuração registrada com auditoria na versão ${result.resultingVersion}.`,
      );
      await load();
    } catch (saveError) {
      setError(errorMessage(saveError));
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  }, [context, draft, load, pendingRequestId, reason]);

  return (
    <SectionPage
      eyebrow="CHAMADOS · CONTROLE CRÍTICO"
      title="Configuração do módulo"
      description="Administre a disponibilidade de Chamados com dependências explícitas, concorrência controlada e trilha imutável."
    >
      <ControlNotice
        title="Barreira de segurança"
        message="Esta tela exige sessão AAL2, role SaaS Owner e a capacidade crítica control.cases.configure. Toda mudança exige justificativa e gera auditoria."
        tone="warning"
      />

      {loading ? (
        <ControlNotice title="Configuração" message="Consultando o estado protegido..." tone="info" />
      ) : null}

      {!loading && error && !context ? (
        <FeedbackState
          kind="error"
          title="Configuração indisponível"
          message={error}
          actionLabel="Tentar novamente"
          onAction={() => { void load(); }}
        />
      ) : null}

      {success ? <ControlNotice title="Alteração concluída" message={success} tone="success" /> : null}
      {error && context ? <ControlNotice title="Alteração não concluída" message={error} tone="danger" /> : null}

      {!loading && context && draft ? (
        <>
          <View style={styles.summaryRow}>
            <ControlCard style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Estado atual</Text>
              <ControlStatusBadge
                label={context.settings.enabled ? 'MÓDULO DISPONÍVEL' : 'MÓDULO DESLIGADO'}
                tone={context.settings.enabled ? 'success' : 'warning'}
              />
            </ControlCard>
            <ControlCard style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Versão de configuração</Text>
              <Text selectable style={styles.version}>{context.settings.version}</Text>
              <Text style={styles.summaryDetail}>
                Atualizada em {new Date(context.settings.updatedAt).toLocaleString('pt-BR')}
              </Text>
            </ControlCard>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Flags operacionais</Text>
              <Text style={styles.sectionDescription}>
                A tela desliga automaticamente flags filhas quando uma dependência é removida.
              </Text>
            </View>
            <View style={styles.flagList}>
              {flagDefinitions.map((definition) => {
                const disabled = flagDisabled(definition.key, draft);
                const active = draft[definition.key];
                return (
                  <Pressable
                    key={definition.key}
                    accessibilityLabel={`${definition.label}: ${active ? 'ativada' : 'desativada'}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: active, disabled }}
                    disabled={disabled}
                    onPress={() => {
                      setDraft((current) => (
                        current ? toggleFlag(current, definition.key) : current
                      ));
                      setPendingRequestId(null);
                    }}
                    style={({ pressed }) => [
                      styles.flagRow,
                      active && styles.flagRowActive,
                      disabled && styles.flagRowDisabled,
                      pressed && !disabled && styles.flagRowPressed,
                    ]}
                  >
                    <View style={[styles.checkbox, active && styles.checkboxActive]}>
                      <Text style={[styles.checkboxMark, active && styles.checkboxMarkActive]}>
                        {active ? '✓' : ''}
                      </Text>
                    </View>
                    <View style={styles.flagCopy}>
                      <Text style={styles.flagLabel}>{definition.label}</Text>
                      <Text style={styles.flagDescription}>{definition.description}</Text>
                      <Text style={styles.flagDependency}>{definition.dependency}</Text>
                    </View>
                    <ControlStatusBadge
                      label={active ? 'ATIVA' : 'INATIVA'}
                      tone={active ? 'success' : 'neutral'}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>

          <ControlField
            label="Justificativa obrigatória"
            helper="Entre 20 e 1.000 caracteres. Não inclua senhas, tokens ou dados pessoais desnecessários."
            multiline
            maxLength={1000}
            onChangeText={(value) => {
              setReason(value);
              setPendingRequestId(null);
            }}
            placeholder="Explique o motivo, a validação realizada e o impacto esperado."
            value={reason}
          />

          <View style={styles.actions}>
            <ControlButton
              disabled={!dirty || !reasonLengthValid || saving}
              label="Revisar alteração"
              onPress={beginConfirmation}
            />
          </View>

          {confirming ? (
            <ControlConfirmPanel
              title="Confirmar alteração crítica"
              description={`A versão ${context.settings.version} será substituída somente se ninguém tiver alterado a configuração desde o carregamento desta tela.`}
              confirmLabel="Registrar configuração"
              onConfirm={() => { void save(); }}
              onCancel={() => {
                setConfirming(false);
                setPendingRequestId(null);
              }}
              busy={saving}
              tone="warning"
            >
              <Text selectable style={styles.confirmReason}>{reason.trim()}</Text>
            </ControlConfirmPanel>
          ) : null}

          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Alterações recentes</Text>
              <Text style={styles.sectionDescription}>
                Histórico imutável exibido apenas para a autoridade desta tela.
              </Text>
            </View>
            {context.recentChanges.length === 0 ? (
              <ControlNotice
                title="Sem alterações"
                message="As flags permanecem no estado inicial e ainda não possuem eventos administrativos."
                tone="info"
              />
            ) : context.recentChanges.map((change) => (
              <ControlCard key={change.changeId} style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <View style={styles.historyCopy}>
                    <Text style={styles.historyActor}>{change.actorName}</Text>
                    <Text style={styles.historyMeta}>
                      {new Date(change.createdAt).toLocaleString('pt-BR')} · versão {change.expectedVersion} → {change.resultingVersion}
                    </Text>
                  </View>
                  <ControlStatusBadge label="AUDITADO" tone="info" />
                </View>
                <Text style={styles.historyFlags}>{changedFlagLabels(change)}</Text>
                <Text selectable style={styles.historyReason}>{change.reason}</Text>
              </ControlCard>
            ))}
          </View>
        </>
      ) : null}
    </SectionPage>
  );
}

const styles = StyleSheet.create({
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: cloudTheme.spacing.md },
  summaryCard: { minWidth: 240, flex: 1 },
  summaryLabel: { ...cloudTheme.type.smallStrong, color: cloudTheme.colors.textSecondary },
  version: { ...cloudTheme.type.metric, color: cloudTheme.colors.brand },
  summaryDetail: { ...cloudTheme.type.small, color: cloudTheme.colors.textMuted },
  section: { gap: cloudTheme.spacing.md },
  sectionHeading: { gap: cloudTheme.spacing.xs },
  sectionTitle: { ...cloudTheme.type.sectionTitle, color: cloudTheme.colors.text },
  sectionDescription: { ...cloudTheme.type.body, color: cloudTheme.colors.textSecondary },
  flagList: { gap: cloudTheme.spacing.sm },
  flagRow: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    gap: cloudTheme.spacing.md,
    padding: cloudTheme.spacing.lg,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: cloudTheme.radii.lg,
    backgroundColor: cloudTheme.colors.surface,
  },
  flagRowActive: { borderColor: cloudTheme.colors.success, backgroundColor: cloudTheme.colors.successSoft },
  flagRowDisabled: { opacity: 0.48 },
  flagRowPressed: { opacity: 0.78 },
  checkbox: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: cloudTheme.colors.borderStrong,
    borderRadius: cloudTheme.radii.sm,
    backgroundColor: cloudTheme.colors.surface,
  },
  checkboxActive: { borderColor: cloudTheme.colors.success, backgroundColor: cloudTheme.colors.success },
  checkboxMark: { color: cloudTheme.colors.surface, fontSize: 15, fontWeight: '900' },
  checkboxMarkActive: { color: cloudTheme.colors.surface },
  flagCopy: { minWidth: 200, flex: 1, gap: 2 },
  flagLabel: { ...cloudTheme.type.bodyStrong, color: cloudTheme.colors.text },
  flagDescription: { ...cloudTheme.type.small, color: cloudTheme.colors.textSecondary },
  flagDependency: { ...cloudTheme.type.caption, color: cloudTheme.colors.textMuted },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
  confirmReason: {
    ...cloudTheme.type.body,
    padding: cloudTheme.spacing.md,
    borderRadius: cloudTheme.radii.md,
    backgroundColor: cloudTheme.colors.surfaceMuted,
    color: cloudTheme.colors.textSecondary,
  },
  historyCard: { gap: cloudTheme.spacing.sm },
  historyHeader: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: cloudTheme.spacing.sm },
  historyCopy: { minWidth: 220, flex: 1, gap: 2 },
  historyActor: { ...cloudTheme.type.bodyStrong, color: cloudTheme.colors.text },
  historyMeta: { ...cloudTheme.type.caption, color: cloudTheme.colors.textMuted },
  historyFlags: { ...cloudTheme.type.smallStrong, color: cloudTheme.colors.accent },
  historyReason: { ...cloudTheme.type.body, color: cloudTheme.colors.textSecondary },
});
