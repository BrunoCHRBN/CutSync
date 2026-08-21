import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import {
  BusinessButton,
  BusinessCard,
  BusinessHeader,
  BusinessMetric,
  BusinessNotice,
  BusinessPage,
  BusinessPill,
  BusinessSectionTitle,
} from '@/components/ui/business-ui';
import { useBusinessOperational } from '@/contexts/business-operational-context';
import { useBusinessSession } from '@/contexts/business-session';
import { createBusinessQueryKey, shouldRetryBusinessQuery } from '@/features/connectivity/business-query';
import { createMobileRequestId } from '@/lib/mobile-request-id';
import { businessApi, BusinessApiError } from '@/services/business-api';
import { businessTheme } from '@/theme/business-theme';

const formatMoney = (cents: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL',
}).format(cents / 100);

const parseMoney = (value: string): number | null => {
  const normalized = value.trim().replace(/\./g, '').replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
};

const MOVEMENT_LABELS = {
  cash_in: 'Suprimento',
  cash_out: 'Sangria',
  sale_cash: 'Venda em dinheiro',
  refund_cash: 'Estorno em dinheiro',
} as const;

export function BusinessCashScreen() {
  const router = useRouter();
  const { user } = useBusinessSession();
  const { activeContext, hasCapability } = useBusinessOperational();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [declared, setDeclared] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning' | 'danger'; message: string } | null>(null);
  const pendingRequest = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const canView = hasCapability('view_cash');
  const canOperate = hasCapability('operate_cash') && activeContext?.accessMode === 'full';
  const canClose = hasCapability('close_cash') && activeContext?.accessMode === 'full';
  const canReopen = hasCapability('reopen_cash') && activeContext?.accessMode === 'full';
  const enabled = Boolean(activeContext?.financialOpsEnabled && canView);

  const cashQuery = useQuery({
    queryKey: user && activeContext
      ? createBusinessQueryKey(user.id, activeContext.establishmentId, 'cash-register')
      : ['business', 'anonymous', 'none', 'cash-register'],
    queryFn: () => businessApi.getCashSnapshot(activeContext!.establishmentId),
    enabled,
    retry: shouldRetryBusinessQuery,
  });

  const run = async (operation: string, fingerprint: string, action: (requestId: string) => Promise<unknown>) => {
    let command = pendingRequest.current;
    if (!command || command.fingerprint !== fingerprint) {
      command = { fingerprint, requestId: createMobileRequestId() };
      pendingRequest.current = command;
    }
    setBusy(operation);
    setNotice(null);
    try {
      await action(command.requestId);
      pendingRequest.current = null;
      setAmount(''); setReason(''); setDeclared('');
      await cashQuery.refetch();
      setNotice({ tone: 'success', message: 'Operação confirmada e registrada pelo servidor.' });
    } catch (error) {
      const network = error instanceof BusinessApiError && error.code === 'network_error';
      if (!network) pendingRequest.current = null;
      setNotice({
        tone: network ? 'warning' : 'danger',
        message: network
          ? 'Sem confirmação do servidor. Tente novamente para reenviar o mesmo protocolo.'
          : error instanceof BusinessApiError ? error.message : 'Não foi possível concluir a operação.',
      });
      if (error instanceof BusinessApiError && error.code === 'cash_session_version_conflict') {
        await cashQuery.refetch();
      }
    } finally { setBusy(null); }
  };

  const session = cashQuery.data?.session ?? null;
  const amountCents = parseMoney(amount);
  const declaredCents = parseMoney(declared);

  return (
    <BusinessPage testID="business-cash-screen">
      <BusinessHeader
        eyebrow="CAIXA"
        title={cashQuery.data?.cashRegisterName ?? 'Caixa principal'}
        description="Abertura, suprimentos, sangrias, vendas em dinheiro e fechamento auditável."
        trailing={<BusinessPill label={session?.status === 'open' ? 'ABERTO' : 'FECHADO'} tone={session?.status === 'open' ? 'success' : 'warning'} />}
      />
      <BusinessButton label="Voltar" variant="ghost" onPress={() => router.back()} />
      {!activeContext?.financialOpsEnabled ? (
        <BusinessNotice tone="warning" message="As operações financeiras ainda não estão habilitadas nesta unidade." />
      ) : !canView ? (
        <BusinessNotice tone="danger" message="Seu contexto não possui permissão para consultar o caixa." />
      ) : cashQuery.isLoading ? (
        <BusinessNotice message="Carregando posição confirmada pelo servidor…" />
      ) : cashQuery.error ? (
        <><BusinessNotice tone="danger" message="Não foi possível carregar o caixa." /><BusinessButton label="Tentar novamente" variant="secondary" onPress={() => void cashQuery.refetch()} /></>
      ) : (
        <View style={styles.list}>
          {notice ? <BusinessNotice tone={notice.tone} message={notice.message} /> : null}
          {session ? (
            <View style={styles.metrics}>
              <BusinessMetric label="Abertura" value={formatMoney(session.openingFloatCents)} />
              <BusinessMetric label="Esperado" value={formatMoney(session.expectedCountCents)} emphasis="accent" />
              {session.varianceCents !== null ? <BusinessMetric label="Diferença" value={formatMoney(session.varianceCents)} emphasis={session.varianceCents === 0 ? 'accent' : 'warning'} /> : null}
            </View>
          ) : null}

          {!session ? (
            <BusinessCard>
              <BusinessSectionTitle>Abrir caixa</BusinessSectionTitle>
              <Text style={styles.hint}>Informe o fundo de troco contado no início do turno.</Text>
              <TextInput accessibilityLabel="Fundo de abertura" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={businessTheme.colors.textMuted} style={styles.input} />
              <BusinessButton label="Abrir caixa" loading={busy === 'open'} disabled={!canOperate || amountCents === null || busy !== null} onPress={() => void run('open', JSON.stringify({ operation: 'open', amountCents }), (requestId) => businessApi.openCashSession({ establishmentId: activeContext!.establishmentId, openingFloatCents: amountCents!, requestId }))} />
            </BusinessCard>
          ) : session.status === 'open' ? (
            <>
              <BusinessCard>
                <BusinessSectionTitle>Movimento manual</BusinessSectionTitle>
                <TextInput accessibilityLabel="Valor do movimento" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={businessTheme.colors.textMuted} style={styles.input} />
                <TextInput accessibilityLabel="Motivo do movimento" value={reason} onChangeText={setReason} placeholder="Motivo obrigatório" maxLength={500} placeholderTextColor={businessTheme.colors.textMuted} style={styles.input} />
                <View style={styles.actions}>
                  {(['cash_in', 'cash_out'] as const).map((movementType) => (
                    <BusinessButton key={movementType} label={movementType === 'cash_in' ? 'Registrar suprimento' : 'Registrar sangria'} variant={movementType === 'cash_out' ? 'secondary' : 'primary'} loading={busy === movementType} disabled={!canOperate || !amountCents || reason.trim().length < 3 || busy !== null} onPress={() => void run(movementType, JSON.stringify({ movementType, amountCents, reason: reason.trim(), version: session.version }), (requestId) => businessApi.recordCashMovement({ establishmentId: activeContext!.establishmentId, cashSessionId: session.id, movementType, amountCents: amountCents!, reason, expectedVersion: session.version, requestId }))} />
                  ))}
                </View>
              </BusinessCard>
              <BusinessCard>
                <BusinessSectionTitle>Fechar caixa</BusinessSectionTitle>
                <Text style={styles.hint}>Conte o dinheiro físico. A diferença fica registrada para a etapa de conciliação.</Text>
                <TextInput accessibilityLabel="Valor contado no fechamento" value={declared} onChangeText={setDeclared} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={businessTheme.colors.textMuted} style={styles.input} />
                <BusinessButton label="Fechar caixa" variant="danger" loading={busy === 'close'} disabled={!canClose || declaredCents === null || busy !== null} onPress={() => void run('close', JSON.stringify({ operation: 'close', declaredCents, version: session.version }), (requestId) => businessApi.closeCashSession({ establishmentId: activeContext!.establishmentId, cashSessionId: session.id, declaredCountCents: declaredCents!, expectedVersion: session.version, requestId }))} />
              </BusinessCard>
            </>
          ) : (
            <BusinessCard>
              <BusinessSectionTitle>Último fechamento</BusinessSectionTitle>
              <Text style={styles.hint}>Contado: {formatMoney(session.declaredCountCents ?? 0)} · diferença: {formatMoney(session.varianceCents ?? 0)}</Text>
              {canReopen ? <BusinessButton label="Reabrir com autenticação forte" variant="secondary" loading={busy === 'reopen'} disabled={busy !== null} onPress={() => void run('reopen', JSON.stringify({ operation: 'reopen', sessionId: session.id, version: session.version }), (requestId) => businessApi.reopenCashSession({ establishmentId: activeContext!.establishmentId, closedCashSessionId: session.id, expectedVersion: session.version, requestId }))} /> : null}
            </BusinessCard>
          )}

          <BusinessCard>
            <BusinessSectionTitle>Movimentos desta sessão</BusinessSectionTitle>
            {cashQuery.data?.movements.length ? cashQuery.data.movements.map((movement) => (
              <View key={movement.id} style={styles.movement}>
                <Text style={styles.movementTitle}>{MOVEMENT_LABELS[movement.movementType]}</Text>
                <Text style={styles.movementValue}>{movement.movementType === 'cash_out' || movement.movementType === 'refund_cash' ? '−' : '+'}{formatMoney(movement.amountCents)}</Text>
                {movement.reason ? <Text style={styles.hint}>{movement.reason}</Text> : null}
              </View>
            )) : <Text style={styles.hint}>Nenhum movimento registrado.</Text>}
          </BusinessCard>
        </View>
      )}
    </BusinessPage>
  );
}

const styles = StyleSheet.create({
  list: { gap: businessTheme.spacing.md },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: businessTheme.spacing.sm },
  actions: { gap: businessTheme.spacing.sm },
  hint: { ...businessTheme.typography.caption, color: businessTheme.colors.textMuted },
  input: { minHeight: businessTheme.sizing.control, borderWidth: 1, borderColor: businessTheme.colors.borderStrong, borderRadius: businessTheme.radii.md, paddingHorizontal: businessTheme.spacing.md, color: businessTheme.colors.text, backgroundColor: businessTheme.colors.surfaceRaised },
  movement: { gap: businessTheme.spacing.xxs, borderTopWidth: 1, borderTopColor: businessTheme.colors.border, paddingTop: businessTheme.spacing.sm },
  movementTitle: { ...businessTheme.typography.bodyStrong, color: businessTheme.colors.text },
  movementValue: { ...businessTheme.typography.heading, color: businessTheme.colors.text },
});
