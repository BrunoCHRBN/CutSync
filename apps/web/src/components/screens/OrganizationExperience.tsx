import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Building2, Download, Plus, Trash2, UserPlus } from 'lucide-react-native';
import { OrganizationContext, OrganizationReport, OrganizationRole } from '@cutsync/database';
import { useAuth } from '../../contexts/AuthContext';
import { useOperationalContext } from '../../contexts/operational-context';
import { organizationService, MyOrganization } from '../../services/organizations';
import { AdminShell } from '../layout/AdminShell';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
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
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Exclude<OrganizationRole, 'owner'>>('manager');
  const [inviteLink, setInviteLink] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger' | 'info'; message: string } | null>(null);

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
      setNotice(null);
    } catch (cause) {
      setNotice({ tone: 'danger', message: cause instanceof Error ? cause.message : 'Não foi possível carregar o grupo.' });
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const availableToAdd = useMemo(
    () => contexts.filter((item) => !context?.establishments.some((unit) => unit.id === item.establishmentId)),
    [context, contexts],
  );
  const isOwner = context?.role === 'owner';
  const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: report?.units[0]?.currency ?? 'BRL' });

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

  const removeUnit = async (establishmentId: string) => {
    if (!selectedId) return;
    const confirmed = Platform.OS === 'web'
      ? window.confirm('Remover esta unidade do grupo? O histórico será preservado.')
      : await new Promise<boolean>((resolve) => Alert.alert('Remover unidade', 'O histórico será preservado.', [
        { text: 'Voltar', onPress: () => resolve(false) },
        { text: 'Remover', style: 'destructive', onPress: () => resolve(true) },
      ]));
    if (!confirmed) return;
    setSubmitting(true);
    try {
      await organizationService.removeEstablishment(selectedId, establishmentId);
      await load(selectedId);
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
      const invitation = await organizationService.inviteMember(selectedId, email.trim().toLowerCase(), inviteRole);
      const link = `${window.location.origin}/organization-invite/${invitation.invitation_token}`;
      setInviteLink(link);
      setEmail('');
      setNotice({ tone: 'success', message: 'Convite criado. O link expira em sete dias.' });
    } catch (cause) {
      setNotice({ tone: 'danger', message: cause instanceof Error ? cause.message : 'Não foi possível criar o convite.' });
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

  return (
    <AdminShell activeRoute="organization" shopName={activeContext?.establishmentName ?? 'Selecione uma unidade'} userName={profile?.name} onSignOut={signOut}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader testID="organization-page-header" eyebrow="Gestão corporativa" title="Meu grupo" description="Administre unidades sem misturar operação, equipe ou dados financeiros." />
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

            {report ? (
              <AppCard>
                <View style={styles.headingRow}><View><Text style={styles.cardTitle}>Todas as unidades</Text><Text style={styles.muted}>Últimos 30 dias · produção de catálogo, não receita recebida</Text></View><AppButton label="Exportar CSV" variant="secondary" icon={<Download size={17} />} onPress={() => downloadCsv(report)} /></View>
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
                  {(['manager', 'finance'] as const).map((role) => <Pressable key={role} onPress={() => setInviteRole(role)} style={[styles.choice, inviteRole === role && styles.choiceActive]}><Text style={styles.choiceText}>{role === 'manager' ? 'Gestor' : 'Financeiro'}</Text></Pressable>)}
                </View>
                <AppButton label="Gerar convite" icon={<UserPlus size={17} />} onPress={() => { void invite(); }} loading={submitting} />
                {inviteLink ? <AppInput label="Link do convite" value={inviteLink} editable={false} /> : null}
                <View style={styles.section}>
                  <Text style={styles.itemTitle}>Membros corporativos</Text>
                  {context.members.map((member) => (
                    <View key={member.profileId} style={styles.memberItem}>
                      <View style={styles.grow}><Text style={styles.itemTitle}>{member.name}</Text><Text style={styles.muted}>{member.role}</Text></View>
                      {member.role !== 'owner' ? (
                        <View style={styles.rowWrap}>
                          <AppButton label="Gestor" size="sm" variant="secondary" onPress={() => { void changeMember(member.profileId, 'manager'); }} />
                          <AppButton label="Financeiro" size="sm" variant="secondary" onPress={() => { void changeMember(member.profileId, 'finance'); }} />
                          <AppButton label="Transferir propriedade" size="sm" variant="secondary" onPress={() => { void changeMember(member.profileId, 'owner'); }} />
                          <AppButton label="Revogar" size="sm" variant="danger" onPress={() => { void changeMember(member.profileId, 'revoke'); }} />
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              </AppCard>
            ) : null}
          </>
        ) : null}
      </ScrollView>
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
  memberItem: { minHeight: 70, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  grow: { flex: 1 },
  section: { gap: 8, paddingTop: 16 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  metric: { flex: 1, minWidth: 160, padding: 14, borderRadius: radii.md, backgroundColor: colors.canvasSoft },
  metricValue: { ...typeScale.sectionTitle, color: colors.text },
});
