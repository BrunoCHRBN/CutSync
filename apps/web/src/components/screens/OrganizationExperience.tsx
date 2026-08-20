import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Building2, CreditCard, Download, Plus, Trash2, UserPlus } from 'lucide-react-native';
import { OrganizationContext, OrganizationReport, OrganizationRole } from '@cutsync/database';
import { useAuth } from '../../contexts/AuthContext';
import { useOperationalContext } from '../../contexts/operational-context';
import { organizationService, MyOrganization, OrganizationBillingContext } from '../../services/organizations';
import { supabase } from '../../services/supabase';
import { AdminShell } from '../layout/AdminShell';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState } from '../ui/EmptyState';
import { InlineNotice } from '../ui/InlineNotice';
import { PageHeader } from '../ui/page-header';
import { colors, layout, radii, typeScale } from '../../theme/tokens';

const dateKey = (date: Date) => date.toISOString().slice(0, 10);

const downloadCsv = (report: OrganizationReport) => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const header = ['estabelecimento', 'producao_realizada', 'valor_agendado', 'agendamentos', 'concluidos', 'cancelados'];
  const rows = report.units.map((unit) => [
    unit.name,
    unit.production_realized,
    unit.scheduled_value,
    unit.appointment_count,
    unit.completed_count,
    unit.cancelled_count,
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
    .join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  link.download = `cutsync-grupo-${report.range_start}-${report.range_end}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const OrganizationExperience = () => {
  const { profile, signOut } = useAuth();
  const { contexts, activeContext, activeEstablishmentId } = useOperationalContext();
  const [organizations, setOrganizations] = useState<MyOrganization[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [context, setContext] = useState<OrganizationContext | null>(null);
  const [report, setReport] = useState<OrganizationReport | null>(null);
  const [billing, setBilling] = useState<OrganizationBillingContext | null>(null);
  const [billingSelection, setBillingSelection] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Exclude<OrganizationRole, 'owner'>>('manager');
  const [inviteScopeMode, setInviteScopeMode] = useState<'all' | 'selected'>('all');
  const [inviteEstablishments, setInviteEstablishments] = useState<string[]>([]);
  const [editingScopeProfileId, setEditingScopeProfileId] = useState<string | null>(null);
  const [editScopeMode, setEditScopeMode] = useState<'all' | 'selected'>('all');
  const [editScopeEstablishments, setEditScopeEstablishments] = useState<string[]>([]);
  const [inviteLink, setInviteLink] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger' | 'info'; message: string } | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);
  const [unitToRemove, setUnitToRemove] = useState<string | null>(null);

  const isOwner = context?.role === 'owner';

  const currency = useMemo(() => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }), []);

  const availableToAdd = useMemo(() => {
    if (!context) return [];
    const linked = new Set(context.establishments.map((item) => item.id));
    return contexts.filter((item) => item.membershipRole === 'admin' && !linked.has(item.establishmentId));
  }, [context, contexts]);

  const load = useCallback(async (preferredId?: string) => {
    setLoading(true);
    try {
      const mine = await organizationService.listMine();
      setOrganizations(mine);
      const targetId = preferredId ?? selectedId ?? mine[0]?.organizationId ?? null;
      setSelectedId(targetId);
      if (!targetId) {
        setContext(null);
        setReport(null);
        return;
      }
      const end = new Date();
      const start = new Date(end);
      start.setDate(start.getDate() - 29);
      const [nextContext, nextReport] = await Promise.all([
        organizationService.getContext(targetId),
        organizationService.getReport(targetId, dateKey(start), dateKey(end)),
      ]);
      setContext(nextContext);
      setReport(nextReport);
      if (['owner', 'finance'].includes(nextContext.role)) {
        const nextBilling = await organizationService.getBillingContext(targetId);
        setBilling(nextBilling);
        setBillingSelection(nextBilling.establishments.map((item) => item.establishment_id));
      } else {
        setBilling(null);
        setBillingSelection([]);
      }
      setNotice(null);
    } catch (cause) {
      setNotice({ tone: 'danger', message: cause instanceof Error ? cause.message : 'Não foi possível carregar o grupo.' });
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const params = new URLSearchParams(window.location.search);
    const organizationId = params.get('organization_id');
    if (params.get('checkout') !== 'success' || !organizationId) return undefined;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + 60_000;
    setSelectedId(organizationId);
    setCheckoutNotice('Pagamento configurado. Aguardando confirmação segura da Stripe.');

    const verify = async () => {
      try {
        const nextBilling = await organizationService.getBillingContext(organizationId);
        if (cancelled) return;
        setBilling(nextBilling);
        setBillingSelection(nextBilling.establishments.map((item) => item.establishment_id));
        if (nextBilling.subscription?.has_external_customer) {
          setCheckoutNotice('Meio de pagamento confirmado. A mudança de cobertura ocorrerá somente na data agendada.');
          return;
        }
        if (Date.now() < deadline) {
          timer = setTimeout(() => { void verify(); }, 3000);
        } else {
          setCheckoutNotice('Sessão registrada. O processador pode levar alguns minutos para concluir a autorização.');
        }
      } catch {
        if (Date.now() < deadline) {
          timer = setTimeout(() => { void verify(); }, 3000);
        }
      }
    };

    void verify();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const createOrganization = async () => {
    if (!activeEstablishmentId || name.trim().length < 2) {
      setNotice({ tone: 'danger', message: 'Selecione uma unidade e informe um nome para o grupo.' });
      return;
    }
    setSubmitting(true);
    try {
      const id = await organizationService.create(name.trim(), activeEstablishmentId);
      setName('');
      await load(id);
      setNotice({ tone: 'success', message: 'Grupo criado com segurança.' });
    } catch (cause) {
      setNotice({ tone: 'danger', message: cause instanceof Error ? cause.message : 'Não foi possível criar o grupo.' });
    } finally {
      setSubmitting(false);
    }
  };

  const addUnit = async (establishmentId: string) => {
    if (!selectedId) return;
    setSubmitting(true);
    try {
      await organizationService.addEstablishment(selectedId, establishmentId);
      await load(selectedId);
      setNotice({ tone: 'success', message: 'Unidade adicionada. A cobrança será ajustada no próximo ciclo.' });
    } catch (cause) {
      setNotice({ tone: 'danger', message: cause instanceof Error ? cause.message : 'Não foi possível adicionar a unidade.' });
    } finally {
      setSubmitting(false);
    }
  };

  const removeUnit = (establishmentId: string) => {
    setUnitToRemove(establishmentId);
  };

  const confirmRemoveUnit = async () => {
    if (!selectedId || !unitToRemove) return;
    const establishmentId = unitToRemove;
    setUnitToRemove(null);
    setSubmitting(true);
    try {
      await organizationService.removeEstablishment(selectedId, establishmentId);
      await load(selectedId);
      setNotice({ tone: 'success', message: 'Unidade removida do grupo. O histórico foi preservado.' });
    } catch (cause) {
      setNotice({ tone: 'danger', message: cause instanceof Error ? cause.message : 'Não foi possível remover a unidade.' });
    } finally {
      setSubmitting(false);
    }
  };

  const invite = async () => {
    if (!selectedId || !email.trim()) return;
    setSubmitting(true);
    try {
      const invitation = await organizationService.inviteMemberV2(
        selectedId,
        email.trim().toLowerCase(),
        inviteRole,
        inviteRole === 'finance' ? 'all' : inviteScopeMode,
        inviteRole === 'manager' && inviteScopeMode === 'selected' ? inviteEstablishments : undefined,
      );
      const link = `${window.location.origin}/organization-invite/${invitation.invitation_token}`;
      setInviteLink(link);
      setEmail('');
      setInviteEstablishments([]);
      setInviteScopeMode('all');
      setNotice({ tone: 'success', message: 'Convite criado. O link expira em sete dias.' });
    } catch (cause) {
      setNotice({ tone: 'danger', message: cause instanceof Error ? cause.message : 'Não foi possível criar o convite.' });
    } finally {
      setSubmitting(false);
    }
  };

  const startEditScope = (member: { profileId: string; scope_mode?: 'all' | 'selected'; scoped_establishment_ids?: string[] | null }) => {
    setEditingScopeProfileId(member.profileId);
    setEditScopeMode(member.scope_mode ?? 'all');
    setEditScopeEstablishments(member.scoped_establishment_ids ?? []);
  };

  const saveMemberScope = async (profileId: string) => {
    if (!selectedId) return;
    setSubmitting(true);
    try {
      await organizationService.setMemberUnitScope(
        selectedId,
        profileId,
        editScopeMode,
        editScopeMode === 'selected' ? editScopeEstablishments : undefined,
      );
      setEditingScopeProfileId(null);
      await load(selectedId);
      setNotice({ tone: 'success', message: 'Escopo de unidades do membro atualizado e auditado.' });
    } catch (cause) {
      setNotice({ tone: 'danger', message: cause instanceof Error ? cause.message : 'Não foi possível alterar o escopo do membro.' });
    } finally {
      setSubmitting(false);
    }
  };

  const changeMember = async (profileId: string, action: 'manager' | 'finance' | 'owner' | 'revoke') => {
    if (!selectedId) return;
    setSubmitting(true);
    try {
      if (action === 'owner') await organizationService.transferOwnership(selectedId, profileId);
      else if (action === 'revoke') await organizationService.revokeMember(selectedId, profileId);
      else await organizationService.updateMemberRole(selectedId, profileId, action);
      await load(selectedId);
      setNotice({ tone: 'success', message: 'Acesso corporativo atualizado e auditado.' });
    } catch (cause) {
      setNotice({ tone: 'danger', message: cause instanceof Error ? cause.message : 'Não foi possível alterar o membro.' });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleBillingUnit = (establishmentId: string) => {
    setBillingSelection((current) => current.includes(establishmentId)
      ? current.filter((id) => id !== establishmentId)
      : [...current, establishmentId]);
  };

  const scheduleConsolidation = async () => {
    if (!selectedId || billingSelection.length === 0) {
      setNotice({ tone: 'danger', message: 'Selecione ao menos uma unidade para consolidar.' });
      return;
    }
    setSubmitting(true);
    try {
      await organizationService.scheduleBillingCutover(selectedId, billingSelection);
      await load(selectedId);
      setNotice({ tone: 'success', message: 'Migração agendada para depois do último período individual pago. A ativação depende de reconciliação.' });
    } catch (cause) {
      setNotice({ tone: 'danger', message: cause instanceof Error ? cause.message : 'Não foi possível agendar a consolidação.' });
    } finally {
      setSubmitting(false);
    }
  };

  const openOrganizationBilling = async () => {
    if (!selectedId || !activeEstablishmentId || Platform.OS !== 'web') return;
    setSubmitting(true);
    const functionName = billing?.subscription?.has_external_customer
      ? 'create-stripe-portal'
      : 'create-stripe-checkout';
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: {
        establishment_id: activeEstablishmentId,
        organization_id: selectedId,
      },
    });
    setSubmitting(false);
    const target = data?.checkout_url ?? data?.portal_url;
    if (error || !target) {
      setNotice({ tone: 'danger', message: 'Não foi possível abrir o ambiente seguro de cobrança consolidada.' });
      return;
    }
    window.location.assign(target);
  };

  const billingCurrency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const selectedBillingTotal = billingSelection.reduce((total, _id, index) => {
    const position = index + 1;
    const tier = [...(billing?.tiers ?? [])]
      .reverse()
      .find((item) => position >= item.unit_from && (item.unit_to == null || position <= item.unit_to));
    return total + (tier?.unit_price_cents ?? 4990);
  }, 0);
  const requiresNetworkPlan = billingSelection.length >= 5
    && billing?.subscription?.plan_code !== 'network';
  const hasActiveConsolidatedCoverage = billing?.establishments.some(
    (unit) => unit.coverage_scope === 'organization' && unit.coverage_status === 'active',
  ) ?? false;

  const toggleInviteEstablishment = (establishmentId: string) => {
    setInviteEstablishments((prev) => (
      prev.includes(establishmentId)
        ? prev.filter((id) => id !== establishmentId)
        : [...prev, establishmentId]
    ));
  };

  const toggleEditEstablishment = (establishmentId: string) => {
    setEditScopeEstablishments((prev) => (
      prev.includes(establishmentId)
        ? prev.filter((id) => id !== establishmentId)
        : [...prev, establishmentId]
    ));
  };

  return (
    <AdminShell activeRoute="organization" shopName={activeContext?.establishmentName ?? 'Selecione uma unidade'} userName={profile?.name} onSignOut={signOut}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader testID="organization-page-header" eyebrow="Gestão corporativa" title="Meu grupo" description="Administre unidades sem misturar operação, equipe ou dados financeiros." />
        {checkoutNotice ? <InlineNotice tone="info" message={checkoutNotice} /> : null}
        {notice ? <InlineNotice tone={notice.tone} message={notice.message} /> : null}

        {!loading && organizations.length === 0 ? (
          <AppCard>
            <EmptyState title="Crie seu primeiro grupo" description="A unidade ativa será vinculada como a primeira operação do grupo." />
            <AppInput label="Nome do grupo" value={name} onChangeText={setName} placeholder="Ex.: Grupo Mariana Beauty" />
            <AppButton label="Criar grupo" onPress={() => { void createOrganization(); }} loading={submitting} icon={<Building2 size={17} />} />
          </AppCard>
        ) : null}

        {organizations.length > 1 ? (
          <AppCard>
            <Text style={styles.cardTitle}>Grupos disponíveis</Text>
            <View style={styles.rowWrap}>
              {organizations.map((item) => (
                <Pressable key={item.organizationId} onPress={() => { setSelectedId(item.organizationId); void load(item.organizationId); }}
                  style={[styles.choice, selectedId === item.organizationId && styles.choiceActive]}>
                  <Text style={styles.choiceText}>{item.organizationName}</Text>
                </Pressable>
              ))}
            </View>
          </AppCard>
        ) : null}

        {context ? (
          <>
            <AppCard>
              <Text style={styles.cardTitle}>{context.organization.name}</Text>
              <Text style={styles.muted}>Seu papel: {context.role} · {context.establishments.length} unidade(s)</Text>
              <View style={styles.list}>
                {context.establishments.map((unit) => (
                  <View key={unit.id} style={styles.listItem}>
                    <View style={styles.grow}><Text style={styles.itemTitle}>{unit.name}</Text><Text style={styles.muted}>{unit.account_status}</Text></View>
                    {isOwner && context.establishments.length > 1 ? <AppButton label="Remover" variant="secondary" icon={<Trash2 size={17} />} onPress={() => { void removeUnit(unit.id); }} /> : null}
                  </View>
                ))}
              </View>
              {isOwner && availableToAdd.length ? (
                <View style={styles.section}>
                  <Text style={styles.itemTitle}>Adicionar unidade administrada por você</Text>
                  {availableToAdd.map((unit) => <AppButton key={unit.establishmentId} label={`Adicionar ${unit.establishmentName}`} variant="secondary" icon={<Plus size={17} />} onPress={() => { void addUnit(unit.establishmentId); }} />)}
                </View>
              ) : null}
            </AppCard>

            {billing ? (
              <AppCard>
                <View style={styles.headingRow}>
                  <View>
                    <Text style={styles.cardTitle}>Cobrança do grupo</Text>
                    <Text style={styles.muted}>{billing.subscription?.plan_name ?? 'Plano ainda não configurado'}</Text>
                    <Text style={[
                      styles.muted,
                      ['active', 'trialing'].includes(billing.subscription?.status ?? '') && styles.statusOkText,
                      billing.subscription?.status === 'past_due' && styles.statusWarnText,
                      ['canceled', 'cancelled', 'expired'].includes(billing.subscription?.status ?? '') && styles.statusDangerText,
                    ]}>
                      {billing.subscription?.status === 'active' ? 'Assinatura ativa'
                        : billing.subscription?.status === 'trialing' ? 'Em trial'
                        : billing.subscription?.status === 'past_due' ? 'Em tolerância'
                        : billing.subscription?.status
                          ? 'Modo leitura / cobrança inativa'
                          : 'Sem assinatura'}
                      {billing.subscription?.grace_ends_at ? ` · tolerância até ${new Date(billing.subscription.grace_ends_at).toLocaleDateString('pt-BR')}` : ''}
                    </Text>
                  </View>
                  <CreditCard color={colors.brandPrimary} size={22} />
                </View>
                <Text style={styles.muted}>O desconto multiunidade vale somente para unidades na mesma cobrança. Assinaturas separadas permanecem em R$ 49,90 por local.</Text>
                <View style={styles.section}>
                  {billing.establishments.map((unit) => {
                    const selected = billingSelection.includes(unit.establishment_id);
                    return (
                      <Pressable
                        key={unit.establishment_id}
                        disabled={!isOwner || Boolean(billing.cutover)}
                        onPress={() => toggleBillingUnit(unit.establishment_id)}
                        style={[styles.billingUnit, selected && styles.choiceActive]}
                      >
                        <View style={styles.grow}>
                          <Text style={styles.itemTitle}>{unit.name}</Text>
                          <Text style={styles.muted}>
                            {unit.coverage_scope === 'organization' ? 'cobrança consolidada' : 'cobrança individual'}
                            {unit.coverage_status === 'scheduled' ? ' · mudança agendada' : ''}
                          </Text>
                        </View>
                        <Text style={styles.itemTitle}>{selected ? 'Incluída' : 'Separada'}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.billingTotal}>
                  {requiresNetworkPlan
                    ? 'Plano Rede: proposta necessária'
                    : `Estimativa consolidada: ${billingCurrency.format(selectedBillingTotal / 100)} / mês`}
                </Text>
                {billing.cutover ? (
                  <>
                    <InlineNotice
                      tone="info"
                      message={`Corte agendado para ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(billing.cutover.cutover_at))}. Até a reconciliação, as cobranças atuais continuam valendo.`}
                    />
                    {isOwner ? (
                      <AppButton
                        label={billing.subscription?.has_external_customer ? 'Administrar cobrança consolidada' : 'Configurar pagamento consolidado'}
                        variant="secondary"
                        onPress={() => { void openOrganizationBilling(); }}
                        loading={submitting}
                      />
                    ) : null}
                  </>
                ) : isOwner && hasActiveConsolidatedCoverage ? (
                  <AppButton
                    label={billing.subscription?.has_external_customer ? 'Administrar cobrança consolidada' : 'Configurar pagamento consolidado'}
                    variant="secondary"
                    onPress={() => { void openOrganizationBilling(); }}
                    loading={submitting}
                  />
                ) : isOwner && billing.subscription ? (
                  <AppButton
                    label="Agendar cobrança consolidada"
                    onPress={() => { void scheduleConsolidation(); }}
                    loading={submitting}
                    disabled={requiresNetworkPlan}
                  />
                ) : (
                  <Text style={styles.muted}>A equipe CutSync precisa configurar o plano antes da consolidação.</Text>
                )}
                <InlineNotice tone="info" message="Após os sete dias de tolerância, a inadimplência consolidada coloca todas as unidades cobertas em modo leitura." />
              </AppCard>
            ) : null}

            {report ? (
              <AppCard>
                <View style={styles.headingRow}><View><Text style={styles.cardTitle}>Visão consolidada</Text><Text style={styles.muted}>Últimos 30 dias · produção de catálogo, não receita recebida</Text></View><AppButton label="Exportar CSV" variant="secondary" icon={<Download size={17} />} onPress={() => downloadCsv(report)} /></View>
                <View style={styles.metrics}>
                  <View style={styles.metric}><Text style={styles.metricValue}>{currency.format(report.production_realized)}</Text><Text style={styles.muted}>produção realizada</Text></View>
                  <View style={styles.metric}><Text style={styles.metricValue}>{currency.format(report.scheduled_value)}</Text><Text style={styles.muted}>valor agendado</Text></View>
                  <View style={styles.metric}><Text style={styles.metricValue}>{report.appointment_count}</Text><Text style={styles.muted}>agendamentos</Text></View>
                </View>
                {report.units.map((unit) => <View key={unit.id} style={styles.listItem}><Text style={[styles.itemTitle, styles.grow]}>{unit.name}</Text><Text style={styles.itemTitle}>{currency.format(unit.production_realized)}</Text></View>)}
              </AppCard>
            ) : null}

            {isOwner ? (
              <AppCard>
                <Text style={styles.cardTitle}>Delegar gestão do grupo</Text>
                <AppInput label="E-mail confirmado no CutSync" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
                <View style={styles.rowWrap}>
                  {(['manager', 'finance'] as const).map((role) => (
                    <Pressable key={role} onPress={() => setInviteRole(role)} style={[styles.choice, inviteRole === role && styles.choiceActive]}>
                      <Text style={styles.choiceText}>{role === 'manager' ? 'Gestor' : 'Financeiro'}</Text>
                    </Pressable>
                  ))}
                </View>
                {inviteRole === 'manager' ? (
                  <View style={styles.section}>
                    <Text style={styles.itemTitle}>Escopo de unidades</Text>
                    <View style={styles.rowWrap}>
                      <Pressable onPress={() => setInviteScopeMode('all')} style={[styles.choice, inviteScopeMode === 'all' && styles.choiceActive]}>
                        <Text style={styles.choiceText}>Todas as unidades</Text>
                      </Pressable>
                      <Pressable onPress={() => setInviteScopeMode('selected')} style={[styles.choice, inviteScopeMode === 'selected' && styles.choiceActive]}>
                        <Text style={styles.choiceText}>Unidades selecionadas</Text>
                      </Pressable>
                    </View>
                    {inviteScopeMode === 'selected' ? (
                      <View style={styles.rowWrap}>
                        {context.establishments.map((est) => {
                          const isSel = inviteEstablishments.includes(est.id);
                          return (
                            <Pressable key={est.id} onPress={() => toggleInviteEstablishment(est.id)} style={[styles.choice, isSel && styles.choiceActive]}>
                              <Text style={styles.choiceText}>{isSel ? `✓ ${est.name}` : est.name}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                ) : null}
                <AppButton label="Gerar convite" icon={<UserPlus size={17} />} onPress={() => { void invite(); }} loading={submitting} />
                {inviteLink ? <AppInput label="Link do convite" value={inviteLink} editable={false} /> : null}

                <View style={styles.section}>
                  <Text style={styles.itemTitle}>Membros corporativos</Text>
                  {context.members.map((member) => {
                    const isEditingScope = editingScopeProfileId === member.profileId;
                    const scopeLabel = member.role === 'owner'
                      ? 'Proprietário · Todas as unidades'
                      : member.role === 'finance'
                        ? 'Financeiro · Todas as unidades'
                        : member.scope_mode === 'selected'
                          ? `Gestor · ${member.scoped_establishment_ids?.length ?? 0} unidade(s) selecionada(s)`
                          : 'Gestor · Todas as unidades';

                    return (
                      <View key={member.profileId} style={styles.memberContainer}>
                        <View style={styles.memberItem}>
                          <View style={styles.grow}>
                            <Text style={styles.itemTitle}>{member.name}</Text>
                            <Text style={styles.muted}>{scopeLabel}</Text>
                          </View>
                          {member.role !== 'owner' ? (
                            <View style={styles.rowWrap}>
                              {member.role === 'manager' ? (
                                <AppButton
                                  label={isEditingScope ? 'Fechar' : 'Ajustar unidades'}
                                  size="sm"
                                  variant="secondary"
                                  onPress={() => (isEditingScope ? setEditingScopeProfileId(null) : startEditScope(member))}
                                />
                              ) : null}
                              <AppButton label="Gestor" size="sm" variant="secondary" onPress={() => { void changeMember(member.profileId, 'manager'); }} />
                              <AppButton label="Financeiro" size="sm" variant="secondary" onPress={() => { void changeMember(member.profileId, 'finance'); }} />
                              <AppButton label="Transferir propriedade" size="sm" variant="secondary" onPress={() => { void changeMember(member.profileId, 'owner'); }} />
                              <AppButton label="Revogar" size="sm" variant="danger" onPress={() => { void changeMember(member.profileId, 'revoke'); }} />
                            </View>
                          ) : null}
                        </View>

                        {isEditingScope ? (
                          <View style={styles.scopeEditor}>
                            <Text style={styles.itemTitle}>Definir unidades visíveis para {member.name}</Text>
                            <View style={styles.rowWrap}>
                              <Pressable onPress={() => setEditScopeMode('all')} style={[styles.choice, editScopeMode === 'all' && styles.choiceActive]}>
                                <Text style={styles.choiceText}>Todas as unidades</Text>
                              </Pressable>
                              <Pressable onPress={() => setEditScopeMode('selected')} style={[styles.choice, editScopeMode === 'selected' && styles.choiceActive]}>
                                <Text style={styles.choiceText}>Unidades selecionadas</Text>
                              </Pressable>
                            </View>
                            {editScopeMode === 'selected' ? (
                              <View style={styles.rowWrap}>
                                {context.establishments.map((est) => {
                                  const isSel = editScopeEstablishments.includes(est.id);
                                  return (
                                    <Pressable key={est.id} onPress={() => toggleEditEstablishment(est.id)} style={[styles.choice, isSel && styles.choiceActive]}>
                                      <Text style={styles.choiceText}>{isSel ? `✓ ${est.name}` : est.name}</Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            ) : null}
                            <View style={styles.rowWrap}>
                              <AppButton label="Salvar escopo" size="sm" onPress={() => { void saveMemberScope(member.profileId); }} loading={submitting} />
                              <AppButton label="Cancelar" size="sm" variant="secondary" onPress={() => setEditingScopeProfileId(null)} />
                            </View>
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </AppCard>
            ) : null}
          </>
        ) : null}
      </ScrollView>
      <ConfirmDialog
        visible={Boolean(unitToRemove)}
        title="Remover unidade do grupo"
        message="Remover esta unidade do grupo? O histórico será preservado."
        confirmLabel="Remover"
        destructive
        loading={submitting}
        testID="organization-remove-unit-confirm"
        onConfirm={() => { void confirmRemoveUnit(); }}
        onCancel={() => setUnitToRemove(null)}
      />
    </AdminShell>
  );
};

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: layout.operationalMax, alignSelf: 'center', padding: 24, paddingBottom: 120, gap: 18 },
  cardTitle: { ...typeScale.cardTitle, color: colors.text },
  itemTitle: { ...typeScale.bodyStrong, color: colors.text },
  muted: { ...typeScale.small, color: colors.textMuted, marginTop: 3 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  choice: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 14, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
  choiceActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandSecondarySoft },
  choiceText: { ...typeScale.bodyStrong, color: colors.text },
  list: { marginTop: 12 },
  listItem: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  memberContainer: { borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingVertical: 6 },
  memberItem: { minHeight: 70, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  scopeEditor: { marginTop: 8, padding: 12, borderRadius: radii.md, backgroundColor: colors.canvasSoft, gap: 8 },
  grow: { flex: 1 },
  section: { gap: 8, paddingTop: 16 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  metric: { flex: 1, minWidth: 160, padding: 14, borderRadius: radii.md, backgroundColor: colors.canvasSoft },
  metricValue: { ...typeScale.sectionTitle, color: colors.text },
  billingUnit: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md },
  billingTotal: { ...typeScale.sectionTitle, color: colors.text, marginTop: 12 },
  statusOkText: { color: colors.success },
  statusWarnText: { color: colors.warning },
  statusDangerText: { color: colors.danger },
});
