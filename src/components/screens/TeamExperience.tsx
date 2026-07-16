import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { AlertTriangle, BadgePercent, Clock, Copy, Mail, ShieldCheck, Trash2, UserPlus, UsersRound } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useEstablishment } from '../../hooks/useEstablishment';
import { useTeam } from '../../hooks/useTeam';
import { supabase } from '../../services/supabase';
import { ProfileRecord } from '../../types/database';
import { AdminShell } from '../layout/AdminShell';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { EmptyState } from '../ui/EmptyState';
import { InlineNotice } from '../ui/InlineNotice';
import { SectionHeading } from '../ui/SectionHeading';
import { colors, layout, radii, typography } from '../../theme/tokens';

interface DaySchedule {
  day: number; // 1 = Segunda, 2 = Terça, etc., 0 = Domingo
  name: string;
  isOpen: boolean;
  open: string;
  close: string;
}

interface InvitationRecord {
  id: string;
  invited_email: string;
  role: string;
  status: string;
  expires_at: string;
  created_at: string;
}

const defaultSchedule: DaySchedule[] = [
  { day: 1, name: 'Segunda-feira', isOpen: true, open: '09:00', close: '20:00' },
  { day: 2, name: 'Terça-feira', isOpen: true, open: '09:00', close: '20:00' },
  { day: 3, name: 'Quarta-feira', isOpen: true, open: '09:00', close: '20:00' },
  { day: 4, name: 'Quinta-feira', isOpen: true, open: '09:00', close: '20:00' },
  { day: 5, name: 'Sexta-feira', isOpen: true, open: '09:00', close: '20:00' },
  { day: 6, name: 'Sábado', isOpen: true, open: '09:00', close: '20:00' },
  { day: 0, name: 'Domingo', isOpen: false, open: '09:00', close: '18:00' },
];

export const TeamExperience = () => {
  const { width } = useWindowDimensions();
  const isWide = width >= layout.desktopBreakpoint;
  const { profile, signOut } = useAuth();
  const { establishment: barbershop } = useEstablishment(profile?.establishment_id);
  const { team: barbers, loading } = useTeam(profile?.establishment_id, false);
  
  // Edição do profissional
  const [editingId, setEditingId] = useState<string | null>(null);
  const [commission, setCommission] = useState('50');
  const [specialties, setSpecialties] = useState('');
  const [barberInstagram, setBarberInstagram] = useState('');
  const [tituloProfissional, setTituloProfissional] = useState('');
  
  // Escalas e jornadas de trabalho do profissional
  const [editingWorkHoursId, setEditingWorkHoursId] = useState<string | null>(null);
  const [workHoursSchedule, setWorkHoursSchedule] = useState<DaySchedule[]>(defaultSchedule);

  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removalReason, setRemovalReason] = useState('');
  const [revokingInvitationId, setRevokingInvitationId] = useState<string | null>(null);
  const [invitationRevocationReason, setInvitationRevocationReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [invitations, setInvitations] = useState<InvitationRecord[]>([]);

  const loadInvitations = async () => {
    if (!profile?.establishment_id) return;
    const { data } = await supabase.rpc('list_establishment_invitations', { target_establishment_id: profile.establishment_id });
    setInvitations((data || []) as InvitationRecord[]);
  };

  React.useEffect(() => { void loadInvitations(); }, [profile?.establishment_id]);

  const startEditing = (barber: ProfileRecord) => {
    setEditingId(barber.id);
    setCommission(String(Math.round((barber.commissionRate ?? 0.5) * 100)));
    setSpecialties(barber.specialties || '');
    setBarberInstagram(barber.instagram || '');
    setTituloProfissional(barber.tituloProfissional || '');
    setNotice(null);
  };

  const startEditingWorkHours = (barber: ProfileRecord) => {
    setEditingWorkHoursId(barber.id);
    let parsedHours = defaultSchedule;
    if (barber.workHours) {
      try {
        parsedHours = JSON.parse(barber.workHours);
      } catch {}
    }
    setWorkHoursSchedule(parsedHours);
    setNotice(null);
  };

  const saveBarberInfo = async (barberId: string) => {
    const value = Number(commission.replace(',', '.'));
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      setNotice({ tone: 'danger', message: 'Informe uma comissão entre 0% e 100%.' });
      return;
    }
    setActionLoading(true);
    try {
      const { error } = await supabase.rpc('admin_update_professional', {
        target_profile_id: barberId,
        target_establishment_id: profile?.establishment_id,
        updates: {
          commission_rate: value / 100,
          specialties: specialties.trim() || null,
          instagram: barberInstagram.trim() || null,
          titulo_profissional: tituloProfissional.trim() || null,
        },
      });
      if (error) throw error;
      setEditingId(null);
      setNotice({ tone: 'success', message: 'Dados do profissional salvos.' });
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível atualizar os dados do profissional.' });
    } finally {
      setActionLoading(false);
    }
  };

  const saveWorkHours = async (barberId: string) => {
    setActionLoading(true);
    try {
      const { error } = await supabase.rpc('admin_update_professional', {
        target_profile_id: barberId,
        target_establishment_id: profile?.establishment_id,
        updates: { work_hours: JSON.stringify(workHoursSchedule) },
      });
      if (error) throw error;
      setEditingWorkHoursId(null);
      setNotice({ tone: 'success', message: 'Jornada e escala salvas.' });
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível atualizar a escala do profissional.' });
    } finally {
      setActionLoading(false);
    }
  };

  const removeBarber = async (barberId: string) => {
    if (removalReason.trim().length < 5) {
      setNotice({ tone: 'danger', message: 'Informe o motivo da remoção com pelo menos 5 caracteres.' });
      return;
    }
    setActionLoading(true);
    try {
      const { error } = await supabase.rpc('remove_professional', {
        target_profile_id: barberId,
        target_establishment_id: profile?.establishment_id,
        reason: removalReason.trim(),
      });
      if (error) throw error;
      setRemovingId(null);
      setRemovalReason('');
      setNotice({ tone: 'success', message: 'Profissional removido da equipe.' });
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível remover este profissional.' });
    } finally {
      setActionLoading(false);
    }
  };

  const revokeInvitation = async () => {
    if (!revokingInvitationId || invitationRevocationReason.trim().length < 5) {
      setNotice({ tone: 'danger', message: 'Informe o motivo da revogação com pelo menos 5 caracteres.' });
      return;
    }
    setActionLoading(true);
    const { error } = await supabase.rpc('revoke_invitation', {
      target_invitation_id: revokingInvitationId,
      reason: invitationRevocationReason.trim(),
    });
    setActionLoading(false);
    if (error) setNotice({ tone: 'danger', message: 'Não foi possível revogar este convite.' });
    else {
      setRevokingInvitationId(null);
      setInvitationRevocationReason('');
      setNotice({ tone: 'success', message: 'Convite revogado e registrado na auditoria.' });
      await loadInvitations();
    }
  };

  const createInvite = async () => {
    if (!profile?.establishment_id || !inviteEmail.trim()) {
      setNotice({ tone: 'danger', message: 'Informe o e-mail do profissional.' });
      return;
    }
    setInviteLoading(true);
    setNotice(null);
    const { data, error } = await supabase.rpc('create_invitation', {
      target_establishment_id: profile.establishment_id,
      target_email: inviteEmail.trim().toLowerCase(),
      target_role: 'professional',
    });
    if (error || !data?.[0]) {
      setNotice({ tone: 'danger', message: 'Não foi possível gerar o convite.' });
    } else {
      const link = typeof window !== 'undefined' ? `${window.location.origin}/invite/${data[0].raw_token}` : `cutsync://invite/${data[0].raw_token}`;
      setInviteLink(link);
      setNotice({ tone: 'success', message: 'Convite criado. Envie o link ao profissional em até 24 horas.' });
      setInviteEmail('');
      await loadInvitations();
    }
    setInviteLoading(false);
  };

  const copyInvite = async () => {
    if (!inviteLink) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) await navigator.clipboard.writeText(inviteLink);
      setNotice({ tone: 'success', message: 'Link de convite copiado.' });
    } catch {
      setNotice({ tone: 'danger', message: 'Selecione e copie o código manualmente.' });
    }
  };

  return (
    <AdminShell testID="team-screen" activeRoute="team" shopName={barbershop?.name || 'Sua barbearia'} userName={profile?.name} onSignOut={signOut}>
      <SectionHeading testID="team-heading" eyebrow="Pessoas" title="Equipe e escalas" description="Convide profissionais, configure jornadas de trabalho, folgas e comissões." />

      {!!notice && <InlineNotice testID="team-action-notice" tone={notice.tone} message={notice.message} />}

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.workspace, isWide && styles.workspaceWide]}>
          <AppCard testID="team-invite-card" style={styles.inviteCard} elevated>
            <View style={styles.inviteIcon}><UserPlus color={colors.text} size={22} /></View>
            <Text style={styles.inviteEyebrow}>CONVITE DE EQUIPE</Text>
            <Text testID="team-invite-title" style={styles.inviteTitle}>Traga seu time para o CutSync.</Text>
            <Text style={styles.inviteDescription}>O link é pessoal, exige o mesmo e-mail, funciona uma vez e expira em 24 horas.</Text>
            <AppInput label="E-mail do profissional" testID="team-invite-email-input" icon={<Mail color={colors.textMuted} size={17} />} value={inviteEmail} onChangeText={setInviteEmail} keyboardType="email-address" autoCapitalize="none" placeholder="profissional@exemplo.com" />
            <AppButton label="Gerar convite seguro" testID="team-create-invite-button" onPress={createInvite} loading={inviteLoading} icon={<ShieldCheck color={colors.ink} size={16} />} fullWidth />
            {!!inviteLink && <View testID="team-generated-invite-link" style={styles.codeBox}>
              <Text selectable numberOfLines={2} style={styles.code}>{inviteLink}</Text>
              <Pressable testID="team-copy-invite-link-button" accessibilityRole="button" accessibilityLabel="Copiar link de convite" onPress={copyInvite} style={({ pressed }) => [styles.copyButton, pressed && styles.pressed]}><Copy color={colors.white} size={16} /></Pressable>
            </View>}
            <Text style={styles.inviteHint}>Nunca compartilhe o endereço público como credencial de equipe.</Text>
            {invitations.length > 0 && <View testID="team-invitations-list" style={styles.invitationList}>{invitations.slice(0, 5).map((invitation) => (
              <View key={invitation.id} testID={`team-invitation-${invitation.id}`} style={styles.invitationRow}>
                <View style={styles.invitationCopy}><Text style={styles.invitationEmail}>{invitation.invited_email}</Text><Text style={styles.invitationMeta}>{invitation.status === 'pending' ? 'Pendente' : invitation.status === 'accepted' ? 'Aceito' : invitation.status === 'expired' ? 'Expirado' : 'Revogado'} · {new Date(invitation.expires_at).toLocaleString('pt-BR')}</Text></View>
                {invitation.status === 'pending' && <Pressable testID={`team-invitation-${invitation.id}-revoke-button`} onPress={() => { setRevokingInvitationId(invitation.id); setInvitationRevocationReason(''); }} style={styles.invitationRevokeButton}><Trash2 color={colors.danger} size={14} /></Pressable>}
              </View>
            ))}</View>}
            {!!revokingInvitationId && <View testID="team-invitation-revoke-form" style={styles.revocationForm}><AppInput testID="team-invitation-revoke-reason-input" label="Motivo da revogação" value={invitationRevocationReason} onChangeText={setInvitationRevocationReason} maxLength={500} placeholder="Ex.: convite emitido para o e-mail incorreto" /><View style={styles.confirmActions}><AppButton testID="team-invitation-revoke-confirm-button" label="Revogar convite" onPress={revokeInvitation} loading={actionLoading} variant="danger" /><AppButton testID="team-invitation-revoke-cancel-button" label="Cancelar" onPress={() => setRevokingInvitationId(null)} variant="secondary" /></View></View>}
          </AppCard>

          <View style={styles.teamColumn}>
            <View style={styles.listHeader}>
              <View>
                <Text testID="team-list-title" style={styles.listTitle}>Profissionais vinculados</Text>
                <Text style={styles.listSubtitle}>{barbers.length} {barbers.length === 1 ? 'pessoa na equipe' : 'pessoas na equipe'}</Text>
              </View>
              <UsersRound color={colors.textMuted} size={22} />
            </View>

            {loading ? (
              <ActivityIndicator testID="team-loading" color={colors.accent} style={styles.loader} />
            ) : barbers.length === 0 ? (
              <EmptyState testID="team-empty-state" title="Sua equipe começa aqui" description="Compartilhe o código de convite para vincular o primeiro profissional." icon={<UsersRound color={colors.textSecondary} size={22} />} />
            ) : (
              <View style={styles.teamList}>
                {barbers.map((barber) => (
                  <AppCard key={barber.id} testID={`team-member-${barber.id}`} style={styles.memberCard}>
                    <View style={styles.memberMain}>
                      <View style={styles.avatar}><Text style={styles.avatarText}>{barber.name.charAt(0).toUpperCase()}</Text></View>
                      <View style={styles.memberCopy}>
                        <Text testID={`team-member-${barber.id}-name`} style={styles.memberName}>{barber.name}</Text>
                        <Text testID={`team-member-${barber.id}-title`} style={{ color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 9, marginTop: 2 }}>
                          {barber.tituloProfissional || 'Especialista'}{barber.specialties ? ` • ${barber.specialties}` : ''}
                        </Text>
                        <Text style={styles.memberContact}>{barber.email}</Text>
                        <Text style={styles.memberContact}>{barber.phone || 'Telefone não informado'}</Text>
                      </View>
                      <View style={styles.commissionBadge}>
                        <BadgePercent color={colors.textSecondary} size={14} />
                        <Text testID={`team-member-${barber.id}-commission`} style={styles.commissionText}>{Math.round((barber.commissionRate ?? 0.5) * 100)}%</Text>
                      </View>
                    </View>

                    {(!barber.workHours || !barber.tituloProfissional || !barber.tituloProfissional.trim()) && (
                      <View testID={`team-member-${barber.id}-warning`} style={styles.warningContainer}>
                        <AlertTriangle color={colors.warning} size={14} />
                        <Text style={styles.warningText}>
                          Profissional não aparecerá na vitrine até que tenha uma jornada de trabalho salva ou título profissional cadastrado.
                        </Text>
                      </View>
                    )}

                    {editingId === barber.id ? (
                      <View testID={`team-member-${barber.id}-commission-form`} style={styles.expandedForm}>
                        <Text style={styles.workHoursTitle}>Configurações do Profissional (LGPD Safe)</Text>
                        <View style={styles.fieldsRow}>
                          <AppInput containerStyle={{ flex: 0.5, minWidth: 100 }} label="Comissão (%)" testID={`team-member-${barber.id}-commission-input`} value={commission} onChangeText={setCommission} keyboardType="decimal-pad" />
                          <AppInput containerStyle={{ flex: 1, minWidth: 180 }} label="Instagram (sem @)" testID={`team-member-${barber.id}-instagram-input`} value={barberInstagram} onChangeText={setBarberInstagram} placeholder="ex: joaobarber" />
                        </View>
                        <AppInput label="Título Profissional (Ex: Nail Designer, Barbeiro, Manicure)" testID={`team-member-${barber.id}-title-input`} value={tituloProfissional} onChangeText={setTituloProfissional} placeholder="Ex: Nail Designer" />
                        <AppInput label="Especialidades / Portfólio" testID={`team-member-${barber.id}-specialties-input`} value={specialties} onChangeText={setSpecialties} placeholder="ex: Especialista em Degradê e Barboterapia" />
                        <View style={styles.formActions}>
                          <AppButton label="Salvar" testID={`team-member-${barber.id}-commission-save-button`} onPress={() => saveBarberInfo(barber.id)} loading={actionLoading} variant="admin" style={styles.smallButton} />
                          <AppButton label="Cancelar" testID={`team-member-${barber.id}-commission-cancel-button`} onPress={() => setEditingId(null)} variant="secondary" style={styles.smallButton} />
                        </View>
                      </View>
                    ) : editingWorkHoursId === barber.id ? (
                      <View testID={`team-member-${barber.id}-hours-form`} style={styles.workHoursForm}>
                        <Text style={styles.workHoursTitle}>Jornada e Escala de Trabalho</Text>
                        <View style={styles.scheduleGrid}>
                          {workHoursSchedule.map((dayItem, idx) => (
                            <View key={dayItem.day} style={styles.scheduleRow}>
                              <Text style={styles.scheduleDayName}>{dayItem.name}</Text>
                              <Switch
                                testID={`team-member-${barber.id}-schedule-switch-${dayItem.day}`}
                                value={dayItem.isOpen}
                                onValueChange={(val) => {
                                  const copy = [...workHoursSchedule];
                                  copy[idx].isOpen = val;
                                  setWorkHoursSchedule(copy);
                                }}
                                trackColor={{ false: colors.borderStrong, true: colors.accent }}
                                thumbColor={colors.white}
                              />
                              {dayItem.isOpen ? (
                                <View style={styles.scheduleTimes}>
                                  <TextInput
                                    testID={`team-member-${barber.id}-schedule-open-${dayItem.day}`}
                                    style={styles.timeInput}
                                    value={dayItem.open}
                                    onChangeText={(val) => {
                                      const copy = [...workHoursSchedule];
                                      copy[idx].open = val;
                                      setWorkHoursSchedule(copy);
                                    }}
                                    placeholder="09:00"
                                    placeholderTextColor="#666"
                                  />
                                  <Text style={{ color: colors.textMuted, fontSize: 10 }}>às</Text>
                                  <TextInput
                                    testID={`team-member-${barber.id}-schedule-close-${dayItem.day}`}
                                    style={styles.timeInput}
                                    value={dayItem.close}
                                    onChangeText={(val) => {
                                      const copy = [...workHoursSchedule];
                                      copy[idx].close = val;
                                      setWorkHoursSchedule(copy);
                                    }}
                                    placeholder="20:00"
                                    placeholderTextColor="#666"
                                  />
                                </View>
                              ) : (
                                <Text style={styles.closedText}>Folga</Text>
                              )}
                            </View>
                          ))}
                        </View>
                        <View style={styles.workHoursActions}>
                          <AppButton label="Salvar Escala" testID={`team-member-${barber.id}-hours-save-button`} onPress={() => saveWorkHours(barber.id)} loading={actionLoading} variant="admin" style={styles.smallButton} />
                          <AppButton label="Cancelar" testID={`team-member-${barber.id}-hours-cancel-button`} onPress={() => setEditingWorkHoursId(null)} variant="secondary" style={styles.smallButton} />
                        </View>
                      </View>
                    ) : removingId === barber.id ? (
                      <InlineNotice
                        testID={`team-member-${barber.id}-remove-confirmation`}
                        tone="danger"
                        title="Remover da equipe?"
                        message="O profissional deixa de aparecer para novos agendamentos."
                        action={<View style={styles.removalForm}><AppInput testID={`team-member-${barber.id}-removal-reason-input`} label="Motivo obrigatório" value={removalReason} onChangeText={setRemovalReason} maxLength={500} placeholder="Ex.: encerramento do vínculo profissional" /><View style={styles.confirmActions}><AppButton label="Remover" testID={`team-member-${barber.id}-remove-confirm-button`} onPress={() => removeBarber(barber.id)} loading={actionLoading} variant="danger" style={styles.smallButton} /><AppButton label="Cancelar" testID={`team-member-${barber.id}-remove-cancel-button`} onPress={() => { setRemovingId(null); setRemovalReason(''); }} variant="secondary" style={styles.smallButton} /></View></View>}
                      />
                    ) : (
                      <View style={styles.memberActions}>
                        <AppButton label="Editar perfil" testID={`team-member-${barber.id}-edit-commission-button`} onPress={() => startEditing(barber)} variant="secondary" icon={<BadgePercent color={colors.text} size={15} />} style={styles.smallButton} />
                        <AppButton label="Jornada / Escala" testID={`team-member-${barber.id}-edit-hours-button`} onPress={() => startEditingWorkHours(barber)} variant="secondary" icon={<Clock color={colors.text} size={15} />} style={styles.smallButton} />
                        <AppButton label="Remover" testID={`team-member-${barber.id}-remove-button`} onPress={() => { setRemovingId(barber.id); setRemovalReason(''); }} variant="danger" icon={<Trash2 color={colors.danger} size={15} />} style={styles.smallButton} />
                      </View>
                    )}
                  </AppCard>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </AdminShell>
  );
};

const styles = StyleSheet.create({
  workspace: { gap: 18, marginTop: 28 },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start' },
  inviteCard: { flex: 0.75, minWidth: 300 },
  inviteIcon: { width: 46, height: 46, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfacePressed, borderWidth: 1, borderColor: colors.border },
  inviteEyebrow: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 9, letterSpacing: 1.6, marginTop: 22 },
  inviteTitle: { color: colors.text, fontFamily: typography.display, fontSize: 23, lineHeight: 28, letterSpacing: -0.8, marginTop: 7 },
  inviteDescription: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 11, lineHeight: 18, marginTop: 10 },
  codeBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: 10, marginTop: 22 },
  code: { flex: 1, color: colors.text, fontFamily: typography.display, fontSize: 15, letterSpacing: 0.5 },
  copyButton: { width: 34, height: 34, borderRadius: radii.sm, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  inviteHint: { color: colors.textMuted, fontFamily: typography.body, fontSize: 9, lineHeight: 14, marginTop: 10 },
  invitationList: { gap: 8, marginTop: 16, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 },
  invitationRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: colors.canvasSoft, borderRadius: radii.sm },
  invitationCopy: { flex: 1 },
  invitationEmail: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12 },
  invitationMeta: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 11, marginTop: 3 },
  invitationRevokeButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.dangerSoft },
  revocationForm: { gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  teamColumn: { flex: 1.4 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  listTitle: { color: colors.text, fontFamily: typography.display, fontSize: 18, letterSpacing: -0.5 },
  listSubtitle: { color: colors.textMuted, fontFamily: typography.body, fontSize: 10, marginTop: 3 },
  loader: { margin: 50 },
  teamList: { gap: 10 },
  memberCard: { gap: 14 },
  memberMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfacePressed, borderWidth: 1, borderColor: colors.border },
  avatarText: { color: colors.text, fontFamily: typography.display, fontSize: 17, letterSpacing: -0.4 },
  memberCopy: { flex: 1, minWidth: 0 },
  memberName: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13 },
  memberContact: { color: colors.textMuted, fontFamily: typography.body, fontSize: 9, marginTop: 3 },
  commissionBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.surfacePressed, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 7 },
  commissionText: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11 },
  memberActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  expandedForm: { padding: 14, gap: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, backgroundColor: colors.surface, borderRadius: radii.md },
  fieldsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  formActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  smallButton: { minHeight: 38, paddingVertical: 7, paddingHorizontal: 12 },
  pressed: { opacity: 0.65, transform: [{ scale: 0.98 }] },
  confirmActions: { gap: 6 },
  removalForm: { gap: 10, width: '100%' },
  workHoursForm: { padding: 14, gap: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  workHoursTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12 },
  scheduleGrid: { backgroundColor: colors.canvas, borderRadius: radii.md, padding: 12, gap: 8, borderWidth: 1, borderColor: colors.border },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: `${colors.border}44` },
  scheduleDayName: { flex: 1, color: colors.text, fontFamily: typography.body, fontSize: 11 },
  scheduleTimes: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 16 },
  timeInput: { width: 52, height: 32, textAlign: 'center', color: colors.text, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, fontSize: 10, paddingHorizontal: 4 },
  closedText: { color: colors.textMuted, fontSize: 10, fontFamily: typography.body, minWidth: 110, textAlign: 'right' },
  workHoursActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: `${colors.warning}33`,
    borderRadius: radii.md,
    padding: 10,
    marginTop: 8,
  },
  warningText: {
    flex: 1,
    color: colors.warning,
    fontFamily: typography.body,
    fontSize: 10,
    lineHeight: 14,
  },
});