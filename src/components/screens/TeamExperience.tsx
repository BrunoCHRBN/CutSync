import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { BadgePercent, Copy, Link2, Trash2, UserPlus, UsersRound } from 'lucide-react-native';
import { database } from '../../database';
import { Barbershop, Profile } from '../../database/models';
import { useAuth } from '../../contexts/AuthContext';
import { useSync } from '../../hooks/useSync';
import { AdminShell } from '../layout/AdminShell';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { EmptyState } from '../ui/EmptyState';
import { InlineNotice } from '../ui/InlineNotice';
import { SectionHeading } from '../ui/SectionHeading';
import { colors, layout, radii, typography } from '../../theme/tokens';

export const TeamExperience = () => {
  const { width } = useWindowDimensions();
  const isWide = width >= layout.desktopBreakpoint;
  const { profile, signOut } = useAuth();
  const { sync } = useSync();
  const [barbershop, setBarbershop] = useState<Barbershop | null>(null);
  const [barbers, setBarbers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [commission, setCommission] = useState('50');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);

  useEffect(() => {
    if (!profile?.barbershop_id) {
      setLoading(false);
      return;
    }
    const shopSub = database.collections.get<Barbershop>('barbershops').findAndObserve(profile.barbershop_id)
      .subscribe({ next: setBarbershop, error: () => setLoading(false) });
    const teamSub = database.collections.get<Profile>('profiles')
      .query(Q.where('barbershop_id', profile.barbershop_id), Q.where('role', 'barber'))
      .observe().subscribe({ next: (items) => { setBarbers(items); setLoading(false); }, error: () => setLoading(false) });
    return () => { shopSub.unsubscribe(); teamSub.unsubscribe(); };
  }, [profile]);

  const startEditing = (barber: Profile) => {
    setEditingId(barber.id);
    setCommission(String(Math.round((barber.commissionRate ?? 0.5) * 100)));
    setNotice(null);
  };

  const saveCommission = async (barberId: string) => {
    const value = Number(commission.replace(',', '.'));
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      setNotice({ tone: 'danger', message: 'Informe uma comissão entre 0% e 100%.' });
      return;
    }
    setActionLoading(true);
    try {
      await database.write(async () => {
        const barber = await database.collections.get<Profile>('profiles').find(barberId);
        await barber.update((record) => { record.commissionRate = value / 100; });
      });
      setEditingId(null);
      setNotice({ tone: 'success', message: 'Comissão atualizada e pronta para sincronizar.' });
      sync();
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível atualizar a comissão.' });
    } finally {
      setActionLoading(false);
    }
  };

  const removeBarber = async (barberId: string) => {
    setActionLoading(true);
    try {
      await database.write(async () => {
        const barber = await database.collections.get<Profile>('profiles').find(barberId);
        await barber.update((record) => { record.barbershopId = null; });
      });
      setRemovingId(null);
      setNotice({ tone: 'success', message: 'Profissional removido da equipe.' });
      sync();
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível remover este profissional.' });
    } finally {
      setActionLoading(false);
    }
  };

  const copyCode = async () => {
    const code = barbershop?.slug;
    if (!code) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) await navigator.clipboard.writeText(code);
      setNotice({ tone: 'success', message: 'Código de convite copiado.' });
    } catch {
      setNotice({ tone: 'danger', message: 'Selecione e copie o código manualmente.' });
    }
  };

  return (
    <AdminShell testID="team-screen" activeRoute="team" shopName={barbershop?.name || 'Sua barbearia'} userName={profile?.name} onSignOut={signOut}>
      <SectionHeading testID="team-heading" eyebrow="Pessoas" title="Equipe e comissões" description="Convide profissionais, acompanhe vínculos e mantenha os repasses organizados." />

      {!!notice && <InlineNotice testID="team-action-notice" tone={notice.tone} message={notice.message} />}

      <View style={[styles.workspace, isWide && styles.workspaceWide]}>
        <AppCard testID="team-invite-card" style={styles.inviteCard} elevated>
          <View style={styles.inviteIcon}><UserPlus color={colors.brand} size={22} /></View>
          <Text style={styles.inviteEyebrow}>CONVITE DE EQUIPE</Text>
          <Text testID="team-invite-title" style={styles.inviteTitle}>Traga seu time para o CutSync.</Text>
          <Text style={styles.inviteDescription}>Envie o código abaixo. O profissional escolhe “Sou profissional” no cadastro e entra automaticamente na sua equipe.</Text>
          <View testID="team-invite-code" style={styles.codeBox}>
            <Link2 color={colors.brand} size={17} />
            <Text selectable style={styles.code}>{barbershop?.slug || '—'}</Text>
            <Pressable testID="team-copy-invite-code-button" onPress={copyCode} style={({ pressed }) => [styles.copyButton, pressed && styles.pressed]}>
              <Copy color={colors.ink} size={16} />
            </Pressable>
          </View>
          <Text style={styles.inviteHint}>O código também forma o endereço público cutsync.com/{barbershop?.slug || 'sua-barbearia'}.</Text>
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
            <ActivityIndicator testID="team-loading" color={colors.brand} style={styles.loader} />
          ) : barbers.length === 0 ? (
            <EmptyState testID="team-empty-state" title="Sua equipe começa aqui" description="Compartilhe o código de convite para vincular o primeiro profissional." icon={<UsersRound color={colors.brand} size={22} />} />
          ) : (
            <View style={styles.teamList}>
              {barbers.map((barber) => (
                <AppCard key={barber.id} testID={`team-member-${barber.id}`} style={styles.memberCard}>
                  <View style={styles.memberMain}>
                    <View style={styles.avatar}><Text style={styles.avatarText}>{barber.name.charAt(0).toUpperCase()}</Text></View>
                    <View style={styles.memberCopy}>
                      <Text testID={`team-member-${barber.id}-name`} style={styles.memberName}>{barber.name}</Text>
                      <Text style={styles.memberContact}>{barber.email}</Text>
                      <Text style={styles.memberContact}>{barber.phone || 'Telefone não informado'}</Text>
                    </View>
                    <View style={styles.commissionBadge}>
                      <BadgePercent color={colors.brand} size={14} />
                      <Text testID={`team-member-${barber.id}-commission`} style={styles.commissionText}>{Math.round((barber.commissionRate ?? 0.5) * 100)}%</Text>
                    </View>
                  </View>

                  {editingId === barber.id ? (
                    <View testID={`team-member-${barber.id}-commission-form`} style={styles.inlineForm}>
                      <AppInput containerStyle={styles.commissionInput} label="Nova comissão (%)" testID={`team-member-${barber.id}-commission-input`} value={commission} onChangeText={setCommission} keyboardType="decimal-pad" />
                      <AppButton label="Salvar" testID={`team-member-${barber.id}-commission-save-button`} onPress={() => saveCommission(barber.id)} loading={actionLoading} style={styles.smallButton} />
                      <AppButton label="Cancelar" testID={`team-member-${barber.id}-commission-cancel-button`} onPress={() => setEditingId(null)} variant="secondary" style={styles.smallButton} />
                    </View>
                  ) : removingId === barber.id ? (
                    <InlineNotice
                      testID={`team-member-${barber.id}-remove-confirmation`}
                      tone="danger"
                      title="Remover da equipe?"
                      message="O profissional deixa de aparecer para novos agendamentos."
                      action={<View style={styles.confirmActions}><AppButton label="Remover" testID={`team-member-${barber.id}-remove-confirm-button`} onPress={() => removeBarber(barber.id)} loading={actionLoading} variant="danger" style={styles.smallButton} /><AppButton label="Cancelar" testID={`team-member-${barber.id}-remove-cancel-button`} onPress={() => setRemovingId(null)} variant="secondary" style={styles.smallButton} /></View>}
                    />
                  ) : (
                    <View style={styles.memberActions}>
                      <AppButton label="Editar comissão" testID={`team-member-${barber.id}-edit-commission-button`} onPress={() => startEditing(barber)} variant="secondary" icon={<BadgePercent color={colors.text} size={15} />} style={styles.smallButton} />
                      <AppButton label="Remover" testID={`team-member-${barber.id}-remove-button`} onPress={() => setRemovingId(barber.id)} variant="danger" icon={<Trash2 color={colors.danger} size={15} />} style={styles.smallButton} />
                    </View>
                  )}
                </AppCard>
              ))}
            </View>
          )}
        </View>
      </View>
    </AdminShell>
  );
};

const styles = StyleSheet.create({
  workspace: { gap: 18, marginTop: 28 },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start' },
  inviteCard: { flex: 0.75, minWidth: 300 },
  inviteIcon: { width: 46, height: 46, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft },
  inviteEyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 9, letterSpacing: 1.6, marginTop: 22 },
  inviteTitle: { color: colors.text, fontFamily: typography.display, fontSize: 23, lineHeight: 28, letterSpacing: -0.8, marginTop: 7 },
  inviteDescription: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 11, lineHeight: 18, marginTop: 10 },
  codeBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.brandBorder, borderRadius: radii.md, padding: 10, marginTop: 22 },
  code: { flex: 1, color: colors.brand, fontFamily: typography.display, fontSize: 15, letterSpacing: 0.5 },
  copyButton: { width: 34, height: 34, borderRadius: radii.sm, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  inviteHint: { color: colors.textMuted, fontFamily: typography.body, fontSize: 9, lineHeight: 14, marginTop: 10 },
  teamColumn: { flex: 1.4 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  listTitle: { color: colors.text, fontFamily: typography.display, fontSize: 18, letterSpacing: -0.5 },
  listSubtitle: { color: colors.textMuted, fontFamily: typography.body, fontSize: 10, marginTop: 3 },
  loader: { margin: 50 },
  teamList: { gap: 10 },
  memberCard: { gap: 14 },
  memberMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft },
  avatarText: { color: colors.brand, fontFamily: typography.display, fontSize: 17 },
  memberCopy: { flex: 1, minWidth: 0 },
  memberName: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13 },
  memberContact: { color: colors.textMuted, fontFamily: typography.body, fontSize: 9, marginTop: 3 },
  commissionBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.brandSoft, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 7 },
  commissionText: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 11 },
  memberActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  inlineForm: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  commissionInput: { flex: 1, minWidth: 160 },
  confirmActions: { gap: 6 },
  smallButton: { minHeight: 38, paddingVertical: 7, paddingHorizontal: 12 },
  pressed: { opacity: 0.65, transform: [{ scale: 0.98 }] },
});