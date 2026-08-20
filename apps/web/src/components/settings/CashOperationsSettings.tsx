import { CashOperationsApiError, createCashOperationsApi } from '@cutsync/database';
import { createMobileRequestId } from '@cutsync/domain';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useFinancialOps } from '../../contexts/financial-ops-context';
import { useOperationalContext } from '../../contexts/operational-context';
import { supabase } from '../../services/supabase';
import { colors, radii, typography } from '../../theme/tokens';
import { AppButton } from '../ui/AppButton';
import { AppInput } from '../ui/AppInput';
import { FormSection } from '../ui/FormSection';
import { InlineNotice } from '../ui/InlineNotice';

const money = (cents: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL',
}).format(cents / 100);
const parseMoney = (value: string): number | null => {
  const normalized = value.trim().replace(/\./g, '').replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
};
const LABELS = {
  cash_in: 'Suprimento', cash_out: 'Sangria', sale_cash: 'Venda em dinheiro', refund_cash: 'Estorno em dinheiro',
} as const;

export function CashOperationsSettings() {
  const { activeEstablishmentId } = useOperationalContext();
  const financialOps = useFinancialOps();
  const api = useMemo(() => createCashOperationsApi(supabase), []);
  const [snapshot, setSnapshot] = useState<Awaited<ReturnType<typeof api.getSnapshot>> | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [declared, setDeclared] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning' | 'danger'; message: string } | null>(null);
  const pending = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const canView = financialOps.hasCapability('view_cash');
  const canOperate = financialOps.hasCapability('operate_cash') && financialOps.accessMode === 'full';
  const canClose = financialOps.hasCapability('close_cash') && financialOps.accessMode === 'full';
  const canReopen = financialOps.hasCapability('reopen_cash') && financialOps.accessMode === 'full';

  const load = useCallback(async () => {
    if (!activeEstablishmentId || !financialOps.financialOpsEnabled || !canView) { setSnapshot(null); return; }
    setBusy('load'); setNotice(null);
    try { setSnapshot(await api.getSnapshot(activeEstablishmentId)); }
    catch { setNotice({ tone: 'danger', message: 'Não foi possível carregar o caixa desta unidade.' }); }
    finally { setBusy(null); }
  }, [activeEstablishmentId, api, canView, financialOps.financialOpsEnabled]);

  useEffect(() => { void load(); }, [load]);

  const run = async (operation: string, fingerprint: string, action: (requestId: string) => Promise<unknown>) => {
    let command = pending.current;
    if (!command || command.fingerprint !== fingerprint) {
      command = { fingerprint, requestId: createMobileRequestId() };
      pending.current = command;
    }
    setBusy(operation); setNotice(null);
    try {
      await action(command.requestId);
      pending.current = null; setAmount(''); setReason(''); setDeclared('');
      await load();
      setNotice({ tone: 'success', message: 'Operação confirmada e registrada pelo servidor.' });
    } catch (error) {
      const network = error instanceof CashOperationsApiError && error.code === 'network_error';
      if (!network) pending.current = null;
      setNotice({ tone: network ? 'warning' : 'danger', message: network
        ? 'Sem confirmação. Tente novamente para reenviar o mesmo protocolo.'
        : error instanceof CashOperationsApiError ? error.message : 'Não foi possível concluir a operação.' });
      if (error instanceof CashOperationsApiError && error.code === 'cash_session_version_conflict') await load();
    } finally { setBusy(null); }
  };

  const session = snapshot?.session ?? null;
  const amountCents = parseMoney(amount);
  const declaredCents = parseMoney(declared);

  return (
    <FormSection testID="settings-cash-operations-section" title="Operações de caixa" description="Posição física em dinheiro, independente da assinatura CutSync e dos recebimentos por PIX ou maquininha.">
      {!financialOps.financialOpsEnabled ? <InlineNotice tone="warning" message="As operações financeiras ainda não estão habilitadas nesta unidade." />
        : !canView ? <InlineNotice tone="danger" message="Seu contexto não possui permissão para consultar o caixa." />
          : busy === 'load' ? <InlineNotice tone="info" message="Carregando posição confirmada pelo servidor…" /> : null}
      {notice ? <InlineNotice tone={notice.tone} message={notice.message} /> : null}
      {snapshot ? <View style={styles.summary}>
        <View><Text style={styles.label}>CAIXA</Text><Text style={styles.value}>{snapshot.cashRegisterName}</Text></View>
        <View><Text style={styles.label}>STATUS</Text><Text style={styles.value}>{session?.status === 'open' ? 'Aberto' : 'Fechado'}</Text></View>
        {session ? <View><Text style={styles.label}>ESPERADO</Text><Text style={styles.value}>{money(session.expectedCountCents)}</Text></View> : null}
      </View> : null}
      {snapshot && !session ? <View style={styles.card}>
        <Text style={styles.title}>Abrir caixa</Text>
        <AppInput label="Fundo de abertura" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" />
        <AppButton label="Abrir caixa" variant="admin" loading={busy === 'open'} disabled={!canOperate || amountCents === null || busy !== null} onPress={() => void run('open', JSON.stringify({ operation: 'open', amountCents }), (requestId) => api.openSession({ establishmentId: activeEstablishmentId!, openingFloatCents: amountCents!, requestId }))} />
      </View> : null}
      {snapshot && session?.status === 'open' ? <>
        <View style={styles.card}>
          <Text style={styles.title}>Movimento manual</Text>
          <AppInput label="Valor" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" />
          <AppInput label="Motivo" value={reason} onChangeText={setReason} maxLength={500} placeholder="Motivo obrigatório" />
          <View style={styles.actions}>{(['cash_in', 'cash_out'] as const).map((movementType) => <AppButton key={movementType} label={movementType === 'cash_in' ? 'Registrar suprimento' : 'Registrar sangria'} variant={movementType === 'cash_in' ? 'admin' : 'secondary'} loading={busy === movementType} disabled={!canOperate || !amountCents || reason.trim().length < 3 || busy !== null} onPress={() => void run(movementType, JSON.stringify({ movementType, amountCents, reason: reason.trim(), version: session.version }), (requestId) => api.recordMovement({ establishmentId: activeEstablishmentId!, cashSessionId: session.id, movementType, amountCents: amountCents!, reason, expectedVersion: session.version, requestId }))} />)}</View>
        </View>
        <View style={styles.card}>
          <Text style={styles.title}>Fechar caixa</Text>
          <AppInput label="Valor contado" value={declared} onChangeText={setDeclared} keyboardType="decimal-pad" placeholder="0,00" hint="A diferença fica registrada para conciliação." />
          <AppButton label="Fechar caixa" variant="danger" loading={busy === 'close'} disabled={!canClose || declaredCents === null || busy !== null} onPress={() => void run('close', JSON.stringify({ operation: 'close', declaredCents, version: session.version }), (requestId) => api.closeSession({ establishmentId: activeEstablishmentId!, cashSessionId: session.id, declaredCountCents: declaredCents!, expectedVersion: session.version, requestId }))} />
        </View>
      </> : null}
      {snapshot && session?.status === 'closed' ? <View style={styles.card}>
        <Text style={styles.title}>Último fechamento</Text>
        <Text style={styles.body}>Contado: {money(session.declaredCountCents ?? 0)} · diferença: {money(session.varianceCents ?? 0)}</Text>
        {canReopen ? <AppButton label="Reabrir com autenticação forte" variant="secondary" loading={busy === 'reopen'} disabled={busy !== null} onPress={() => void run('reopen', JSON.stringify({ operation: 'reopen', sessionId: session.id, version: session.version }), (requestId) => api.reopenSession({ establishmentId: activeEstablishmentId!, closedCashSessionId: session.id, expectedVersion: session.version, requestId }))} /> : null}
      </View> : null}
      {snapshot && session ? <View style={styles.card}>
        <Text style={styles.title}>Movimentos desta sessão</Text>
        {snapshot.movements.length ? snapshot.movements.map((movement) => <View key={movement.id} style={styles.movement}><Text style={styles.body}>{LABELS[movement.movementType]}</Text><Text style={styles.value}>{movement.movementType === 'cash_out' || movement.movementType === 'refund_cash' ? '−' : '+'}{money(movement.amountCents)}</Text>{movement.reason ? <Text style={styles.muted}>{movement.reason}</Text> : null}</View>) : <Text style={styles.muted}>Nenhum movimento registrado.</Text>}
      </View> : null}
    </FormSection>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: 24, padding: 16, borderRadius: radii.lg, backgroundColor: colors.canvasSoft },
  card: { gap: 14, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.canvasSoft },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  label: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 11 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 15 },
  value: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 14 },
  body: { color: colors.text, fontFamily: typography.body, fontSize: 13 },
  muted: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12 },
  movement: { gap: 3, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
});
