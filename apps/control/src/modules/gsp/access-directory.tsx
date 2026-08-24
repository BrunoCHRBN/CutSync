import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { ControlState } from '@/components/control-state';
import {
  ControlButton,
  ControlConfirmPanel,
  ControlField,
  ControlNotice,
  type ControlTone,
} from '@/components/control-ui';
import { StatusBadge } from '@/components/cloud/status-badge';
import { useControlAuth } from '@/contexts/control-auth-context';
import { resolveCloudActionAvailability } from '@/features/cloud/cloud-action-availability';
import {
  accessStateFilterOptions,
  formatDate,
  labelForRole,
  roleFilterOptions,
  toAccessSummary,
  type GspAccessState,
} from '@/modules/gsp/presentation';
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
import { cloudTheme } from '@/theme/cloud-components';
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

const roleOptions: { role: GovernanceRole; label: string; detail: string }[] = [
  { role: 'SaaS_Viewer', label: 'Leitor', detail: 'Consulta os módulos liberados, sem executar alterações.' },
  { role: 'SaaS_Editor', label: 'Editor', detail: 'Opera os módulos permitidos, sem administrar acessos.' },
  { role: 'SaaS_Owner', label: 'Proprietário', detail: 'Administra o Cloud e pode delegar ou revogar acessos.' },
];

function DefRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.defRow}>
      <Text style={styles.defLabel}>{label}</Text>
      <Text style={styles.defValue} selectable>{value}</Text>
    </View>
  );
}

export function AccessDirectoryScreen() {
  const { can, context } = useControlAuth();
  const params = useLocalSearchParams();
  const section = Array.isArray(params.section) ? params.section[0] : params.section;
  const usersFocus = section === 'users';
  const { width } = useWindowDimensions();
  const compact = width < 900;
  const canManageAccess = can('control.access.manage');
  const accessWrite = resolveCloudActionAvailability({ action: 'access_write', can });

  const [users, setUsers] = useState<ControlAccessUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<GovernanceRole | null>(null);
  const [stateFilter, setStateFilter] = useState<GspAccessState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);

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
      setListError(getControlAccessErrorMessage(error, 'Não foi possível consultar os acessos.'));
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

  const summaries = useMemo(
    () => users.map((user) => toAccessSummary(user, context?.profileId)),
    [users, context?.profileId],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return summaries.filter((row) => {
      if (needle) {
        const hay = `${row.name} ${row.email}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (roleFilter && row.role !== roleFilter) return false;
      if (stateFilter && row.state !== stateFilter) return false;
      return true;
    });
  }, [summaries, query, roleFilter, stateFilter]);

  const selected = filtered.find((row) => row.profileId === selectedId) ?? null;
  const activeCount = summaries.filter((row) => row.state === 'active').length;

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
    if (!accessWrite.enabled) {
      setNotice({
        title: 'Escrita indisponível',
        message: accessWrite.reason ?? 'Concessões e revogações aguardam homologação das operações de escrita.',
        tone: 'warning',
      });
      return;
    }
    setGrantOpen(true);
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
  }, [accessWrite.enabled, accessWrite.reason]);

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
        current ? (isControlAccessEffective(current) ? 'edit' : 'reactivate') : 'grant',
      );
    } catch (error) {
      resetEditor();
      setNotice({
        title: 'Busca não concluída',
        message: getControlAccessErrorMessage(error, 'Não foi possível procurar a conta informada.'),
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
        setPending({ kind: 'revoke', target, reason: validatedReason });
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
      setFormError(getControlAccessErrorMessage(error, 'Revise os campos antes de continuar.'));
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
        await revokeControlUserAccess(pending.target.profileId, pending.reason);
      }
      const refreshed = await refreshUsers(false);
      const operation = pending.kind === 'revoke' ? 'revogado' : 'atualizado';
      resetEditor();
      setGrantOpen(false);
      setEmail('');
      setNotice({
        title: `Acesso ${operation}`,
        message: refreshed
          ? 'A alteração foi registrada e a lista já está atualizada.'
          : 'A alteração foi registrada, mas a lista não pôde ser atualizada.',
        tone: refreshed ? 'success' : 'warning',
      });
    } catch (error) {
      setNotice({
        title: 'Alteração não concluída',
        message: getControlAccessErrorMessage(error, 'Não foi possível concluir a alteração de acesso.'),
        tone: 'danger',
      });
    } finally {
      setMutating(false);
    }
  }, [mutating, pending, refreshUsers, resetEditor]);

  const clearFilters = () => {
    setQuery('');
    setRoleFilter(null);
    setStateFilter(null);
  };

  if (!canManageAccess) {
    return (
      <ControlState
        title="Acesso restrito"
        message="Somente Proprietário com sessão AAL2 pode consultar ou administrar acessos."
      />
    );
  }

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.kicker}>GSP / ACESSOS</Text>
          <Text style={styles.title}>
            {usersFocus ? 'Usuários e grupos' : 'Acessos ao Cloud'}
          </Text>
          <Text style={styles.lead}>
            {usersFocus
              ? 'Identidade das contas autorizadas no Cloud. Grupos formais ainda não são expostos por esta fonte.'
              : 'Gerencie papéis, validade e estado dos acessos administrativos.'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Text style={styles.metaStrong}>
            {activeCount.toLocaleString('pt-BR')} pessoa{activeCount === 1 ? '' : 's'} autorizada{activeCount === 1 ? '' : 's'}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={loading}
            onPress={() => { void refreshUsers(); }}
            style={[styles.secondaryButton, loading && styles.disabled]}
          >
            <Text style={styles.secondaryButtonText}>Atualizar</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !accessWrite.enabled }}
            disabled={!accessWrite.enabled}
            onPress={() => {
              if (!accessWrite.enabled) {
                setNotice({
                  title: 'Conceder acesso',
                  message: accessWrite.reason
                    ?? 'Concessões e revogações aguardam homologação das operações de escrita.',
                  tone: 'warning',
                });
                return;
              }
              setGrantOpen(true);
              resetEditor();
            }}
            style={[styles.primaryButton, !accessWrite.enabled && styles.disabled]}
          >
            <Text style={styles.primaryButtonText}>Conceder acesso</Text>
          </Pressable>
        </View>
      </View>

      {!accessWrite.enabled ? (
        <Text style={styles.writeHint}>
          {accessWrite.reason ?? 'Concessões e revogações aguardam homologação das operações de escrita.'}
        </Text>
      ) : null}

      {notice ? (
        <ControlNotice
          message={notice.message}
          title={notice.title}
          tone={notice.tone}
          testID="control-access-notice"
        />
      ) : null}

      <View style={styles.toolbar}>
        <TextInput
          accessibilityLabel="Buscar por nome ou e-mail"
          onChangeText={setQuery}
          placeholder="Buscar por nome ou e-mail"
          placeholderTextColor={cloudTheme.colors.textMuted}
          style={styles.search}
          value={query}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {roleFilterOptions.map((option) => (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              onPress={() => setRoleFilter((current) => (current === option.value ? null : option.value))}
              style={[styles.filterChip, roleFilter === option.value && styles.filterChipOn]}
            >
              <Text style={styles.filterChipText}>Papel: {option.label}</Text>
            </Pressable>
          ))}
          {accessStateFilterOptions.map((option) => (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              onPress={() => setStateFilter((current) => (current === option.value ? null : option.value))}
              style={[styles.filterChip, stateFilter === option.value && styles.filterChipOn]}
            >
              <Text style={styles.filterChipText}>Estado: {option.label}</Text>
            </Pressable>
          ))}
          {(query || roleFilter || stateFilter) ? (
            <Pressable accessibilityRole="button" onPress={clearFilters} style={styles.clearLink}>
              <Text style={styles.linkText}>Limpar filtros</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </View>

      <Text style={styles.resultsCount}>
        {filtered.length} resultado{filtered.length === 1 ? '' : 's'}
      </Text>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={cloudTheme.colors.brand} />
          <Text style={styles.muted}>Consultando acessos…</Text>
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

      {!loading && !listError ? (
        <View style={[styles.body, compact && styles.bodyCompact]}>
          <View style={styles.tableCol}>
            {!compact ? (
              <View style={styles.table}>
                <View style={styles.tableHead}>
                  <Text style={[styles.headCell, styles.colPerson]}>Pessoa</Text>
                  <Text style={[styles.headCell, styles.colRole]}>Papel</Text>
                  <Text style={[styles.headCell, styles.colState]}>Estado</Text>
                  <Text style={[styles.headCell, styles.colExpiry]}>Validade</Text>
                  <Text style={[styles.headCell, styles.colGranted]}>Concedido</Text>
                  <Text style={[styles.headCell, styles.colActions]}>Ações</Text>
                </View>
                {filtered.map((row) => (
                  <Pressable
                    key={row.profileId}
                    accessibilityRole="button"
                    onPress={() => setSelectedId(row.profileId)}
                    style={[styles.tableRow, selectedId === row.profileId && styles.tableRowSelected]}
                    testID={`control-access-user-${row.profileId}`}
                  >
                    <View style={styles.colPerson}>
                      <View style={styles.personCell}>
                        <View style={styles.avatar}><Text style={styles.avatarText}>{row.initials}</Text></View>
                        <View style={styles.personText}>
                          <Text style={styles.cellStrong} numberOfLines={1}>
                            {row.name}{row.isYou ? ' · Você' : ''}
                          </Text>
                          <Text style={styles.cellMuted} numberOfLines={1}>{row.email || 'E-mail indisponível'}</Text>
                        </View>
                      </View>
                    </View>
                    <Text style={[styles.cell, styles.colRole]}>{row.roleLabel}</Text>
                    <View style={styles.colState}>
                      <StatusBadge
                        label={row.stateLabel}
                        tone={row.state === 'active' ? 'success' : row.state === 'revoked' ? 'danger' : 'warning'}
                      />
                    </View>
                    <Text style={[styles.cell, styles.colExpiry]} numberOfLines={1}>{row.expiresLabel}</Text>
                    <Text style={[styles.cellMuted, styles.colGranted]} numberOfLines={1}>{row.grantedLabel}</Text>
                    <View style={styles.colActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Ações para ${row.name}`}
                        onPress={() => setSelectedId(row.profileId)}
                        style={styles.menuButton}
                      >
                        <Text style={styles.menuButtonText}>⋯</Text>
                      </Pressable>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={styles.cards}>
                {filtered.map((row) => (
                  <Pressable
                    key={row.profileId}
                    accessibilityRole="button"
                    onPress={() => setSelectedId(row.profileId)}
                    style={[styles.card, selectedId === row.profileId && styles.tableRowSelected]}
                  >
                    <Text style={styles.cellStrong}>{row.name}{row.isYou ? ' · Você' : ''}</Text>
                    <Text style={styles.cellMuted}>{row.email}</Text>
                    <View style={styles.cardMeta}>
                      <StatusBadge label={row.roleLabel} tone="info" />
                      <StatusBadge
                        label={row.stateLabel}
                        tone={row.state === 'active' ? 'success' : row.state === 'revoked' ? 'danger' : 'warning'}
                      />
                    </View>
                    <Text style={styles.cellMuted}>{row.expiresLabel} · {row.grantedLabel}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {!loading && filtered.length === 0 ? (
              <Text style={styles.empty}>Nenhum acesso corresponde aos filtros atuais.</Text>
            ) : null}
          </View>

          {selected ? (
            <View style={[styles.drawer, compact && styles.drawerCompact]} accessibilityViewIsModal>
              <View style={styles.drawerHead}>
                <Text style={styles.sectionTitle}>Detalhes do acesso</Text>
                <Pressable accessibilityRole="button" onPress={() => setSelectedId(null)}>
                  <Text style={styles.linkText}>Fechar</Text>
                </Pressable>
              </View>
              <View style={styles.drawerIdentity}>
                <View style={styles.avatarLarge}>
                  <Text style={styles.avatarText}>{selected.initials}</Text>
                </View>
                <Text style={styles.drawerName}>{selected.name}</Text>
                <StatusBadge
                  label={selected.stateLabel}
                  tone={selected.state === 'active' ? 'success' : selected.state === 'revoked' ? 'danger' : 'warning'}
                />
                <Text style={styles.cellMuted} selectable>{selected.email || 'E-mail indisponível'}</Text>
              </View>
              <View style={styles.defList}>
                <DefRow label="Conta" value={selected.email || '—'} />
                <DefRow label="Papel" value={selected.roleLabel} />
                <DefRow label="Validade" value={selected.expiresLabel} />
                <DefRow label="Concedido em" value={formatDate(selected.raw.grantedAt) ?? selected.grantedLabel} />
                <DefRow label="Estado" value={selected.stateLabel} />
                {selected.isYou ? <DefRow label="Contexto" value="Este é o seu próprio acesso" /> : null}
              </View>
              <View style={styles.drawerActions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={!accessWrite.enabled}
                  onPress={() => openEditor(
                    selected.raw,
                    selected.raw,
                    selected.state === 'active' ? 'edit' : 'reactivate',
                  )}
                  style={[styles.secondaryButton, !accessWrite.enabled && styles.disabled]}
                >
                  <Text style={styles.secondaryButtonText}>
                    {selected.state === 'active' ? 'Editar papel' : 'Reativar'}
                  </Text>
                </Pressable>
                {selected.state === 'active' ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={!accessWrite.enabled}
                    onPress={() => openEditor(selected.raw, selected.raw, 'revoke')}
                    style={[styles.dangerButton, !accessWrite.enabled && styles.disabled]}
                  >
                    <Text style={styles.dangerButtonText}>Revogar acesso</Text>
                  </Pressable>
                ) : null}
              </View>
              {!accessWrite.enabled ? (
                <Text style={styles.muted}>
                  Ações de mutação permanecem bloqueadas até a homologação da escrita.
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <Modal
        animationType="fade"
        transparent
        visible={grantOpen}
        onRequestClose={() => {
          if (!mutating) {
            setGrantOpen(false);
            resetEditor();
          }
        }}
      >
        <View style={styles.modalBackdrop}>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <View style={styles.modalCard} accessibilityViewIsModal>
              <Text style={styles.sectionTitle}>
                {target ? (target.intent === 'revoke' ? 'Revogar acesso' : 'Editar acesso') : 'Conceder acesso'}
              </Text>
              {!target ? (
                <>
                  <Text style={styles.muted}>
                    Informe o e-mail exato de uma conta CutSync existente.
                  </Text>
                  <ControlField
                    autoCapitalize="none"
                    editable={accessWrite.enabled && !searching}
                    inputMode="email"
                    label="E-mail da conta"
                    onChangeText={setEmail}
                    placeholder="pessoa@exemplo.com"
                    testID="control-access-email"
                    value={email}
                  />
                  <View style={styles.modalActions}>
                    <ControlButton
                      label="Cancelar"
                      onPress={() => { setGrantOpen(false); resetEditor(); }}
                      variant="secondary"
                    />
                    <ControlButton
                      busy={searching}
                      disabled={!accessWrite.enabled || !email.trim()}
                      label="Buscar conta"
                      onPress={() => void searchProfile()}
                      testID="control-access-search-button"
                    />
                  </View>
                </>
              ) : pending ? (
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
                  <DefRow label="Usuário" value={pending.target.name} />
                  <DefRow label="Conta" value={pending.target.email} />
                  {pending.kind === 'set' ? (
                    <>
                      <DefRow label="Papel" value={labelForRole(pending.role)} />
                      <DefRow label="Expiração" value={pending.expiryLabel} />
                    </>
                  ) : null}
                  <DefRow label="Justificativa" value={pending.reason} />
                </ControlConfirmPanel>
              ) : (
                <>
                  <Text style={styles.cellStrong}>{target.name}</Text>
                  <Text style={styles.cellMuted}>{target.email}</Text>
                  {target.intent !== 'revoke' ? (
                    <>
                      <Text style={styles.fieldLabel}>Perfil de acesso</Text>
                      <View style={styles.roleGrid}>
                        {roleOptions.map((option) => (
                          <Pressable
                            key={option.role}
                            onPress={() => setRole(option.role)}
                            style={[styles.roleOption, role === option.role && styles.roleOptionOn]}
                            testID={`control-access-role-${option.role}`}
                          >
                            <Text style={styles.cellStrong}>{option.label}</Text>
                            <Text style={styles.muted}>{option.detail}</Text>
                          </Pressable>
                        ))}
                      </View>
                      <ControlField
                        label="Expiração opcional (AAAA-MM-DD)"
                        onChangeText={setExpiryInput}
                        placeholder="AAAA-MM-DD"
                        testID="control-access-expiry"
                        value={expiryInput}
                      />
                    </>
                  ) : (
                    <ControlNotice
                      message="A pessoa deixará de acessar todos os módulos do Cloud."
                      tone="warning"
                    />
                  )}
                  <ControlField
                    helper={`${reason.trim().length}/500 · mínimo 10 caracteres`}
                    label="Justificativa"
                    maxLength={500}
                    multiline
                    onChangeText={setReason}
                    testID="control-access-reason"
                    value={reason}
                  />
                  {formError ? <ControlNotice message={formError} tone="danger" /> : null}
                  <View style={styles.modalActions}>
                    <ControlButton
                      label="Cancelar"
                      onPress={() => { setGrantOpen(false); resetEditor(); }}
                      variant="secondary"
                    />
                    <ControlButton
                      disabled={reason.trim().length < 10}
                      label={target.intent === 'revoke' ? 'Revisar revogação' : 'Revisar alteração'}
                      onPress={prepareReview}
                      testID="control-access-review"
                      variant={target.intent === 'revoke' ? 'danger' : 'primary'}
                    />
                  </View>
                </>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: 1360,
    alignSelf: 'center',
    gap: 14,
    paddingHorizontal: 32,
    paddingVertical: cloudTheme.layout.contentPadding,
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 14,
    alignItems: 'flex-end',
  },
  headerText: { flex: 1, minWidth: 260, gap: 4 },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  kicker: { color: cloudTheme.colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: cloudTheme.colors.text, fontSize: 26, fontWeight: '800' },
  lead: { color: cloudTheme.colors.textSecondary, fontSize: 14, lineHeight: 20, maxWidth: 640 },
  metaStrong: { color: cloudTheme.colors.text, fontSize: 13, fontWeight: '700' },
  writeHint: { color: cloudTheme.colors.textMuted, fontSize: 12 },
  toolbar: { gap: 8 },
  search: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: 4,
    paddingHorizontal: 12,
    color: cloudTheme.colors.text,
    backgroundColor: cloudTheme.colors.surface,
  },
  filterRow: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingRight: 8 },
  filterChip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: 4,
    backgroundColor: cloudTheme.colors.surface,
  },
  filterChipOn: { borderColor: '#27523b', backgroundColor: '#f3f8f4' },
  filterChipText: { color: cloudTheme.colors.text, fontSize: 12, fontWeight: '700' },
  clearLink: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 6 },
  resultsCount: { color: cloudTheme.colors.text, fontSize: 13, fontWeight: '700' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  muted: { color: cloudTheme.colors.textSecondary, fontSize: 13, lineHeight: 19 },
  body: { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
  bodyCompact: { flexDirection: 'column' },
  tableCol: { flex: 1, minWidth: 0 },
  table: {
    borderTopWidth: 1,
    borderTopColor: cloudTheme.colors.border,
    backgroundColor: cloudTheme.colors.surface,
  },
  tableHead: {
    flexDirection: 'row',
    gap: 8,
    minHeight: 40,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
    backgroundColor: '#f5f7f4',
  },
  tableRow: {
    flexDirection: 'row',
    gap: 8,
    minHeight: 56,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
  },
  tableRowSelected: { backgroundColor: '#f0f8f3', borderLeftWidth: 3, borderLeftColor: '#1F6B45' },
  headCell: { color: cloudTheme.colors.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  cell: { color: cloudTheme.colors.textSecondary, fontSize: 13 },
  cellStrong: { color: cloudTheme.colors.text, fontSize: 13, fontWeight: '700' },
  cellMuted: { color: cloudTheme.colors.textMuted, fontSize: 12 },
  colPerson: { flex: 1.6, minWidth: 160 },
  colRole: { width: 100 },
  colState: { width: 100 },
  colExpiry: { width: 120 },
  colGranted: { width: 100 },
  colActions: { width: 48, alignItems: 'flex-end' },
  personCell: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  personText: { flex: 1, minWidth: 0, gap: 2 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dcefe3',
  },
  avatarLarge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dcefe3',
  },
  avatarText: { color: '#274936', fontSize: 11, fontWeight: '800' },
  menuButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  menuButtonText: { fontSize: 18, color: cloudTheme.colors.textMuted, fontWeight: '800' },
  cards: { gap: 8 },
  card: {
    gap: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: 4,
    backgroundColor: cloudTheme.colors.surface,
  },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  empty: { paddingVertical: 20, textAlign: 'center', color: cloudTheme.colors.textMuted },
  drawer: {
    width: 340,
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: 4,
    backgroundColor: cloudTheme.colors.surface,
  },
  drawerCompact: { width: '100%' },
  drawerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  drawerIdentity: { gap: 6, alignItems: 'flex-start' },
  drawerName: { color: cloudTheme.colors.text, fontSize: 18, fontWeight: '800' },
  sectionTitle: { color: cloudTheme.colors.text, fontSize: 15, fontWeight: '800' },
  defList: { gap: 0 },
  defRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eef1ee',
  },
  defLabel: { width: 110, color: cloudTheme.colors.textMuted, fontSize: 12, fontWeight: '700' },
  defValue: { flex: 1, color: cloudTheme.colors.text, fontSize: 13, fontWeight: '600' },
  drawerActions: { gap: 8 },
  primaryButton: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderRadius: 4,
    backgroundColor: '#1F6B45',
  },
  primaryButtonText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  secondaryButton: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#1F6B45',
    borderRadius: 4,
    backgroundColor: cloudTheme.colors.surface,
  },
  secondaryButtonText: { color: '#1F6B45', fontWeight: '800', fontSize: 12 },
  dangerButton: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderRadius: 4,
    backgroundColor: cloudTheme.colors.dangerSoft,
    borderWidth: 1,
    borderColor: cloudTheme.colors.danger,
  },
  dangerButtonText: { color: cloudTheme.colors.danger, fontWeight: '800', fontSize: 12 },
  linkText: { color: '#1F6B45', fontSize: 12, fontWeight: '800' },
  disabled: { opacity: 0.45 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 32, 24, 0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalScroll: { flexGrow: 1, justifyContent: 'center' },
  modalCard: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    gap: 12,
    padding: 20,
    borderRadius: 6,
    backgroundColor: cloudTheme.colors.surface,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' },
  fieldLabel: { color: cloudTheme.colors.text, fontSize: 13, fontWeight: '700' },
  roleGrid: { gap: 8 },
  roleOption: {
    gap: 4,
    padding: 12,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: 4,
    backgroundColor: '#f7f9f7',
  },
  roleOptionOn: { borderColor: '#1F6B45', backgroundColor: '#f0f8f3' },
});
