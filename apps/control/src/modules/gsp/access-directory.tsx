import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { ControlState } from '@/components/control-state';
import {
  ControlButton,
  ControlCard,
  ControlConfirmPanel,
  ControlEmptyState,
  ControlField,
  ControlNotice,
  ControlStatusBadge,
  type ControlTone,
} from '@/components/control-ui';
import { SectionPage } from '@/components/section-page';
import { useControlAuth } from '@/contexts/control-auth-context';
import { resolveCloudActionAvailability } from '@/features/cloud/cloud-action-availability';
import {
  findControlProfileByEmail,
  getControlAccessErrorMessage,
  isControlAccessEffective,
  listControlAccessUsers,
  parseControlAccessExpiryInput,
  revokeControlUserAccess,
  setControlUserAccess,
  toControlAccessDateInput,
  validateControlAccessReason,
  type ControlAccessProfile,
  type ControlAccessUser,
} from '@/services/control-access';
import {
  controlColors,
  controlLayout,
  controlSpacing,
  controlType,
} from '@/theme/tokens';
import type { GovernanceRole } from '@/types/control';

type EditorIntent = 'grant' | 'edit' | 'reactivate' | 'revoke';

interface AccessTarget extends ControlAccessProfile {
  current: ControlAccessUser | null;
  intent: EditorIntent;
}

type PendingAction =
  | {
    kind: 'set';
    target: AccessTarget;
    role: GovernanceRole;
    expiresAt: string | null;
    expiryLabel: string;
    reason: string;
  }
  | {
    kind: 'revoke';
    target: AccessTarget;
    reason: string;
  };

interface NoticeState {
  title: string;
  message: string;
  tone: Exclude<ControlTone, 'neutral'>;
}

const roleOptions: {
  role: GovernanceRole;
  label: string;
  detail: string;
}[] = [
  {
    role: 'SaaS_Viewer',
    label: 'SaaS_Viewer',
    detail: 'Consulta os módulos liberados, sem executar alterações.',
  },
  {
    role: 'SaaS_Editor',
    label: 'SaaS_Editor',
    detail: 'Opera os módulos permitidos, sem administrar acessos.',
  },
  {
    role: 'SaaS_Owner',
    label: 'SaaS_Owner',
    detail: 'Administra o Cloud e pode delegar ou revogar acessos.',
  },
];

const intentLabels: Record<EditorIntent, string> = {
  grant: 'Novo acesso',
  edit: 'Alterar acesso',
  reactivate: 'Reativar acesso',
  revoke: 'Revogar acesso',
};

function roleLabel(role: GovernanceRole): string {
  return role.replace('SaaS_', '');
}

function formatDate(value: string | null): string {
  if (!value) return 'Sem expiração';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Data indisponível';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

function accessStatus(user: ControlAccessUser): {
  label: string;
  tone: ControlTone;
} {
  if (user.revokedAt) return { label: 'Revogado', tone: 'danger' };
  if (!user.isActive) return { label: 'Inativo', tone: 'warning' };
  if (user.expiresAt && new Date(user.expiresAt).getTime() <= Date.now()) {
    return { label: 'Expirado', tone: 'warning' };
  }
  return { label: 'Ativo', tone: 'success' };
}

export function AccessDirectoryScreen() {
  const { can, context } = useControlAuth();
  const { width } = useWindowDimensions();
  const mobile = width < controlLayout.mobileBreakpoint;
  const canManageAccess = can('control.access.manage');
  const accessWrite = resolveCloudActionAvailability({
    action: 'access_write',
    can,
  });

  const [users, setUsers] = useState<ControlAccessUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const [email, setEmail] = useState('');
  const [searching, setSearching] = useState(false);
  const [target, setTarget] = useState<AccessTarget | null>(null);
  const [role, setRole] = useState<GovernanceRole>('SaaS_Viewer');
  const [expiryInput, setExpiryInput] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState('');
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [mutating, setMutating] = useState(false);

  const refreshUsers = useCallback(async (showLoading = true): Promise<boolean> => {
    if (showLoading) setLoading(true);
    setListError('');
    try {
      setUsers(await listControlAccessUsers());
      return true;
    } catch (error) {
      setListError(getControlAccessErrorMessage(
        error,
        'Não foi possível consultar os acessos.',
      ));
      return false;
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    if (!canManageAccess) return undefined;
    void refreshUsers();
    return undefined;
  }, [canManageAccess, refreshUsers]));

  const resetEditor = useCallback(() => {
    setTarget(null);
    setRole('SaaS_Viewer');
    setExpiryInput('');
    setReason('');
    setFormError('');
    setPending(null);
  }, []);

  const openEditor = useCallback((
    profile: ControlAccessProfile,
    current: ControlAccessUser | null,
    intent: EditorIntent,
  ) => {
    setTarget({ ...profile, current, intent });
    setRole(current?.role ?? 'SaaS_Viewer');
    setExpiryInput(
      current?.expiresAt && new Date(current.expiresAt).getTime() > Date.now()
        ? toControlAccessDateInput(current.expiresAt)
        : '',
    );
    setReason('');
    setFormError('');
    setPending(null);
    setNotice(null);
  }, []);

  const searchProfile = useCallback(async () => {
    setSearching(true);
    setNotice(null);
    setFormError('');
    try {
      const profile = await findControlProfileByEmail(email);
      if (!profile) {
        resetEditor();
        setNotice({
          title: 'Conta não encontrada',
          message: 'Confirme o e-mail exato. A pessoa precisa possuir uma conta CutSync antes de receber acesso.',
          tone: 'warning',
        });
        return;
      }

      const current = users.find((user) => user.profileId === profile.profileId) ?? null;
      openEditor(
        profile,
        current,
        current
          ? (isControlAccessEffective(current) ? 'edit' : 'reactivate')
          : 'grant',
      );
    } catch (error) {
      resetEditor();
      setNotice({
        title: 'Busca não concluída',
        message: getControlAccessErrorMessage(
          error,
          'Não foi possível procurar a conta informada.',
        ),
        tone: 'danger',
      });
    } finally {
      setSearching(false);
    }
  }, [email, openEditor, resetEditor, users]);

  const prepareReview = useCallback(() => {
    if (!target) return;
    setFormError('');
    try {
      const validatedReason = validateControlAccessReason(reason);
      if (target.intent === 'revoke') {
        setPending({
          kind: 'revoke',
          target,
          reason: validatedReason,
        });
        return;
      }

      const expiresAt = parseControlAccessExpiryInput(expiryInput);
      setPending({
        kind: 'set',
        target,
        role,
        expiresAt,
        expiryLabel: expiryInput.trim() || 'Sem expiração',
        reason: validatedReason,
      });
    } catch (error) {
      setFormError(getControlAccessErrorMessage(
        error,
        'Revise os campos antes de continuar.',
      ));
    }
  }, [expiryInput, reason, role, target]);

  const executePendingAction = useCallback(async () => {
    if (!pending || mutating) return;
    setMutating(true);
    setNotice(null);
    try {
      if (pending.kind === 'set') {
        await setControlUserAccess(
          pending.target.profileId,
          pending.role,
          pending.expiresAt,
          pending.reason,
        );
      } else {
        await revokeControlUserAccess(
          pending.target.profileId,
          pending.reason,
        );
      }

      const refreshed = await refreshUsers(false);
      const operation = pending.kind === 'revoke' ? 'revogado' : 'atualizado';
      resetEditor();
      setEmail('');
      setNotice({
        title: `Acesso ${operation}`,
        message: refreshed
          ? 'A alteração foi registrada e a lista já está atualizada.'
          : 'A alteração foi registrada, mas a lista não pôde ser atualizada. Use “Atualizar lista”.',
        tone: refreshed ? 'success' : 'warning',
      });
    } catch (error) {
      setNotice({
        title: 'Alteração não concluída',
        message: getControlAccessErrorMessage(
          error,
          'Não foi possível concluir a alteração de acesso.',
        ),
        tone: 'danger',
      });
    } finally {
      setMutating(false);
    }
  }, [mutating, pending, refreshUsers, resetEditor]);

  if (!canManageAccess) {
    return (
      <ControlState
        title="Acesso restrito"
        message="Somente SaaS_Owner com sessão AAL2 pode consultar ou administrar acessos."
      />
    );
  }

  return (
    <SectionPage
      eyebrow="SEGURANÇA"
      title="Acessos ao Cloud"
      description="Conceda o menor privilégio necessário a contas CutSync existentes. Toda alteração exige revisão, justificativa e sessão AAL2."
    >
      {notice ? (
        <ControlNotice
          message={notice.message}
          title={notice.title}
          tone={notice.tone}
          testID="control-access-notice"
        />
      ) : null}

      {!accessWrite.enabled ? (
        <ControlNotice
          message={accessWrite.reason ?? 'Mutações de acesso permanecem bloqueadas nesta etapa.'}
          title="Escrita de acessos desativada"
          tone="warning"
          testID="control-access-write-disabled"
        />
      ) : null}

      <ControlCard style={styles.searchCard} testID="control-access-search">
        <View style={styles.cardHeading}>
          <Text style={styles.cardTitle}>Adicionar pessoa autorizada</Text>
          <Text style={styles.cardDescription}>
            Informe o e-mail exato de uma conta que já foi criada no CutSync.
          </Text>
        </View>
        <View style={[styles.searchRow, mobile && styles.stack]}>
          <ControlField
            autoCapitalize="none"
            autoComplete="email"
            containerStyle={styles.searchField}
            editable={accessWrite.enabled && !searching && !mutating && !pending}
            inputMode="email"
            label="E-mail da conta"
            onChangeText={setEmail}
            onSubmitEditing={() => {
              if (accessWrite.enabled && email.trim()) void searchProfile();
            }}
            placeholder="pessoa@exemplo.com"
            returnKeyType="search"
            testID="control-access-email"
            value={email}
          />
          <ControlButton
            busy={searching}
            disabled={!accessWrite.enabled || !email.trim() || mutating || Boolean(pending)}
            label="Buscar conta"
            onPress={() => void searchProfile()}
            style={[styles.searchButton, mobile && styles.fullButton]}
            testID="control-access-search-button"
          />
        </View>
      </ControlCard>

      {pending ? (
        <ControlConfirmPanel
          busy={mutating}
          confirmLabel={pending.kind === 'revoke' ? 'Confirmar revogação' : 'Confirmar alteração'}
          description={
            pending.kind === 'revoke'
              ? 'O usuário perderá o acesso ao CutSync Cloud. Esta ação ficará registrada na auditoria.'
              : 'Confira o usuário, o papel e a expiração antes de aplicar a alteração.'
          }
          onCancel={() => setPending(null)}
          onConfirm={() => void executePendingAction()}
          testID="control-access-confirmation"
          title={pending.kind === 'revoke' ? 'Revogar acesso' : 'Aplicar acesso'}
          tone={pending.kind === 'revoke' ? 'danger' : 'warning'}
        >
          <View style={styles.reviewGrid}>
            <View style={styles.reviewItem}>
              <Text style={styles.metaLabel}>USUÁRIO</Text>
              <Text selectable style={styles.metaValue}>{pending.target.name}</Text>
              <Text selectable style={styles.metaDetail}>{pending.target.email}</Text>
            </View>
            {pending.kind === 'set' ? (
              <>
                <View style={styles.reviewItem}>
                  <Text style={styles.metaLabel}>PAPEL</Text>
                  <Text style={styles.metaValue}>{pending.role}</Text>
                </View>
                <View style={styles.reviewItem}>
                  <Text style={styles.metaLabel}>EXPIRAÇÃO</Text>
                  <Text style={styles.metaValue}>{pending.expiryLabel}</Text>
                </View>
              </>
            ) : null}
            <View style={styles.reviewReason}>
              <Text style={styles.metaLabel}>JUSTIFICATIVA</Text>
              <Text selectable style={styles.metaValue}>{pending.reason}</Text>
            </View>
          </View>
        </ControlConfirmPanel>
      ) : target ? (
        <ControlCard
          style={styles.editorCard}
          tone={target.intent === 'revoke' ? 'danger' : 'neutral'}
          testID="control-access-editor"
        >
          <View style={styles.editorHeading}>
            <View style={styles.identity}>
              <ControlStatusBadge
                label={intentLabels[target.intent].toUpperCase()}
                tone={target.intent === 'revoke' ? 'danger' : 'info'}
              />
              <Text selectable style={styles.userName}>{target.name}</Text>
              <Text selectable style={styles.userEmail}>{target.email}</Text>
            </View>
            {target.current ? (
              <ControlStatusBadge
                label={target.current.role}
                tone={isControlAccessEffective(target.current) ? 'success' : 'warning'}
              />
            ) : null}
          </View>

          {target.intent !== 'revoke' ? (
            <>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldGroupLabel}>Perfil de acesso</Text>
                <View style={styles.roleGrid}>
                  {roleOptions.map((option) => (
                    <View key={option.role} style={styles.roleOption}>
                      <ControlButton
                        label={option.label}
                        onPress={() => setRole(option.role)}
                        variant={role === option.role ? 'primary' : 'secondary'}
                        testID={`control-access-role-${option.role}`}
                      />
                      <Text style={styles.roleDetail}>{option.detail}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <ControlField
                autoCapitalize="none"
                helper="Deixe vazio para acesso sem expiração. O acesso permanece válido até 23:59 da data informada."
                label="Expiração opcional"
                maxLength={10}
                onChangeText={(value) => {
                  setExpiryInput(value);
                  setFormError('');
                }}
                placeholder="AAAA-MM-DD"
                testID="control-access-expiry"
                value={expiryInput}
              />
            </>
          ) : (
            <ControlNotice
              message="A pessoa deixará de acessar todos os módulos do Cloud. As demais aplicações CutSync não serão afetadas."
              tone="warning"
            />
          )}

          <ControlField
            helper={`${reason.trim().length}/500 caracteres. Informe de 10 a 500 caracteres.`}
            label="Justificativa da alteração"
            maxLength={500}
            multiline
            onChangeText={setReason}
            placeholder="Explique objetivamente por que o acesso está sendo alterado."
            testID="control-access-reason"
            value={reason}
          />
          {formError ? (
            <ControlNotice
              message={formError}
              tone="danger"
              testID="control-access-form-error"
            />
          ) : null}
          <View style={[styles.actions, mobile && styles.stack]}>
            <ControlButton
              label="Cancelar"
              onPress={resetEditor}
              style={mobile && styles.fullButton}
              variant="secondary"
            />
            <ControlButton
              disabled={reason.trim().length < 10}
              label={target.intent === 'revoke' ? 'Revisar revogação' : 'Revisar alteração'}
              onPress={prepareReview}
              style={mobile && styles.fullButton}
              testID="control-access-review"
              variant={target.intent === 'revoke' ? 'danger' : 'primary'}
            />
          </View>
        </ControlCard>
      ) : null}

      <View style={[styles.listHeading, mobile && styles.stack]}>
        <View style={styles.cardHeading}>
          <Text style={styles.sectionTitle}>Pessoas autorizadas</Text>
          <Text style={styles.cardDescription}>
            {users.length.toLocaleString('pt-BR')} acesso(s) registrado(s)
          </Text>
        </View>
        <ControlButton
          disabled={loading || mutating}
          label="Atualizar lista"
          onPress={() => void refreshUsers()}
          style={mobile && styles.fullButton}
          variant="secondary"
        />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={controlColors.brand} />
          <Text style={styles.loadingText}>Consultando acessos...</Text>
        </View>
      ) : null}
      {listError ? (
        <ControlNotice
          action={{ label: 'Tentar novamente', onPress: () => void refreshUsers() }}
          message={listError}
          title="Lista indisponível"
          tone="danger"
        />
      ) : null}
      {!loading && !listError && users.length === 0 ? (
        <ControlEmptyState
          description="Nenhum acesso foi retornado pelo servidor."
          title="Lista vazia"
        />
      ) : null}

      {!loading && !listError ? (
        <View style={styles.list} testID="control-access-list">
          {users.map((user) => {
            const status = accessStatus(user);
            const effective = isControlAccessEffective(user);
            const isCurrentUser = context?.profileId === user.profileId;
            return (
              <ControlCard
                key={user.profileId}
                style={styles.userCard}
                tone={status.tone === 'danger' ? 'danger' : 'neutral'}
                testID={`control-access-user-${user.profileId}`}
              >
                <View style={styles.userHeader}>
                  <View style={styles.identity}>
                    <View style={styles.inlineBadges}>
                      <ControlStatusBadge label={roleLabel(user.role)} tone="info" />
                      <ControlStatusBadge label={status.label} tone={status.tone} />
                      {isCurrentUser ? <ControlStatusBadge label="VOCÊ" tone="success" /> : null}
                    </View>
                    <Text selectable style={styles.userName}>{user.name}</Text>
                    <Text selectable style={styles.userEmail}>
                      {user.email || 'E-mail indisponível'}
                    </Text>
                  </View>
                  <View style={styles.userMeta}>
                    <Text style={styles.metaLabel}>EXPIRAÇÃO</Text>
                    <Text style={styles.metaValue}>{formatDate(user.expiresAt)}</Text>
                    <Text style={styles.metaDetail}>
                      Concedido em {formatDate(user.grantedAt)}
                    </Text>
                  </View>
                </View>
                <View style={[styles.actions, mobile && styles.stack]}>
                  <ControlButton
                    disabled={!accessWrite.enabled}
                    label={effective ? 'Editar acesso' : 'Reativar acesso'}
                    onPress={() => openEditor(
                      user,
                      user,
                      effective ? 'edit' : 'reactivate',
                    )}
                    style={mobile && styles.fullButton}
                    variant="secondary"
                  />
                  {effective ? (
                    <ControlButton
                      disabled={!accessWrite.enabled}
                      label="Revogar acesso"
                      onPress={() => openEditor(user, user, 'revoke')}
                      style={mobile && styles.fullButton}
                      variant="danger"
                    />
                  ) : null}
                </View>
              </ControlCard>
            );
          })}
        </View>
      ) : null}
    </SectionPage>
  );
}

const styles = StyleSheet.create({
  searchCard: { gap: controlSpacing.lg },
  cardHeading: { flex: 1, gap: controlSpacing.xxs },
  cardTitle: { ...controlType.cardTitle, color: controlColors.text },
  cardDescription: { ...controlType.small, color: controlColors.textSecondary },
  sectionTitle: { ...controlType.sectionTitle, color: controlColors.text },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: controlSpacing.sm,
  },
  searchField: { flex: 1 },
  searchButton: { minWidth: 160 },
  editorCard: { maxWidth: controlLayout.formMax },
  editorHeading: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: controlSpacing.md,
  },
  identity: { minWidth: 220, flex: 1, gap: controlSpacing.xxs },
  userName: { ...controlType.bodyStrong, color: controlColors.text },
  userEmail: { ...controlType.small, color: controlColors.textSecondary },
  fieldGroup: { gap: controlSpacing.sm },
  fieldGroupLabel: { ...controlType.smallStrong, color: controlColors.text },
  roleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: controlSpacing.sm,
  },
  roleOption: {
    minWidth: 180,
    flex: 1,
    gap: controlSpacing.xs,
    padding: controlSpacing.sm,
    borderWidth: 1,
    borderColor: controlColors.border,
    borderRadius: 10,
    backgroundColor: controlColors.surfaceMuted,
  },
  roleDetail: { ...controlType.small, color: controlColors.textMuted },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: controlSpacing.sm,
  },
  stack: { flexDirection: 'column', alignItems: 'stretch' },
  fullButton: { width: '100%' },
  reviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: controlSpacing.sm,
  },
  reviewItem: {
    minWidth: 160,
    flexGrow: 1,
    gap: controlSpacing.xxs,
    padding: controlSpacing.sm,
    borderRadius: 8,
    backgroundColor: controlColors.surfaceMuted,
  },
  reviewReason: {
    width: '100%',
    gap: controlSpacing.xxs,
    padding: controlSpacing.sm,
    borderRadius: 8,
    backgroundColor: controlColors.surfaceMuted,
  },
  metaLabel: { ...controlType.eyebrow, color: controlColors.textMuted },
  metaValue: { ...controlType.smallStrong, color: controlColors.text },
  metaDetail: { ...controlType.small, color: controlColors.textSecondary },
  listHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: controlSpacing.md,
  },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: controlSpacing.sm,
    paddingVertical: controlSpacing.md,
  },
  loadingText: { ...controlType.small, color: controlColors.textSecondary },
  list: { width: '100%', gap: controlSpacing.sm },
  userCard: { gap: controlSpacing.md },
  userHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: controlSpacing.lg,
  },
  inlineBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: controlSpacing.xs,
  },
  userMeta: { minWidth: 190, gap: controlSpacing.xxs },
});
