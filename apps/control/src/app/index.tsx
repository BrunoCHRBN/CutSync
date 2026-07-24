import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';

type BillingRow = {
  billing_account_id: string;
  organization_id: string;
  organization_name: string;
  subscription_id: string | null;
  plan_code: string | null;
  subscription_status: string | null;
  enforcement_enabled: boolean | null;
  active_units: number;
  current_period_end: string | null;
};

const rpc = async (name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> => {
  const result = await (supabase.rpc as any)(name, args);
  return { data: result.data, error: result.error };
};

export default function ControlHome() {
  const [session, setSession] = useState<Session | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [rows, setRows] = useState<BillingRow[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [planCode, setPlanCode] = useState('multi_unit_standard');
  const [basePrice, setBasePrice] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error || assurance.data.currentLevel !== 'aal2') {
      setNeedsMfa(true);
      setAuthorized(false);
      setLoading(false);
      return;
    }
    setNeedsMfa(false);
    const { data: authUser } = await supabase.auth.getUser();
    const { data: governance } = await supabase
      .from('governance_users')
      .select('role')
      .eq('profile_id', authUser.user?.id ?? '')
      .maybeSingle();
    if (!governance || !['SaaS_Viewer', 'SaaS_Editor', 'SaaS_Owner'].includes(governance.role)) {
      setAuthorized(false);
      setMessage('Esta conta não possui acesso ao CutSync Control.');
      setLoading(false);
      return;
    }
    setAuthorized(true);
    const result = await rpc('list_control_billing_accounts');
    if (result.error) setMessage(result.error.message);
    else setRows((result.data ?? []) as BillingRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) void load();
      else setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) void load();
      else {
        setAuthorized(false);
        setRows([]);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  const signIn = async () => {
    setLoading(true);
    setMessage('');
    const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (result.error) setMessage(result.error.message);
    setLoading(false);
  };

  const changeStatus = async (subscriptionId: string | null, status: string) => {
    if (!subscriptionId || reason.trim().length < 10) {
      setMessage('Informe uma justificativa com pelo menos 10 caracteres.');
      return;
    }
    setLoading(true);
    const result = await rpc('set_control_subscription_status', {
      target_subscription_id: subscriptionId,
      target_status: status,
      reason: reason.trim(),
    });
    if (result.error) setMessage(result.error.message);
    else {
      setReason('');
      setMessage('Assinatura atualizada e auditada.');
      await load();
    }
    setLoading(false);
  };

  const configurePlan = async () => {
    const cents = Math.round(Number(basePrice.replace(',', '.')) * 100);
    if (!Number.isFinite(cents) || cents < 0) {
      setMessage('Informe um preço-base válido.');
      return;
    }
    setLoading(true);
    const result = await rpc('configure_control_plan', {
      target_plan_code: planCode,
      target_base_price_cents: cents,
      target_currency: 'BRL',
    });
    setMessage(result.error?.message ?? 'Preço do plano atualizado.');
    setLoading(false);
  };

  const activateSubscription = async (organizationId: string) => {
    setLoading(true);
    const result = await rpc('activate_control_subscription', {
      target_organization_id: organizationId,
      target_plan_code: planCode,
      target_period_start: new Date().toISOString().slice(0, 10),
    });
    if (result.error) setMessage(result.error.message);
    else {
      setMessage('Assinatura ativada.');
      await load();
    }
    setLoading(false);
  };

  const issueInvoice = async (subscriptionId: string | null) => {
    if (!subscriptionId) return;
    const due = new Date();
    due.setDate(due.getDate() + 7);
    setLoading(true);
    const result = await rpc('issue_manual_billing_invoice', {
      target_subscription_id: subscriptionId,
      target_due_date: due.toISOString().slice(0, 10),
    });
    setMessage(result.error?.message ?? 'Fatura emitida com preços congelados.');
    setLoading(false);
  };

  const changeEnforcement = async (subscriptionId: string | null, enabled: boolean) => {
    if (!subscriptionId || reason.trim().length < 10) {
      setMessage('Informe uma justificativa com pelo menos 10 caracteres.');
      return;
    }
    setLoading(true);
    const result = await rpc('set_control_subscription_enforcement', {
      target_subscription_id: subscriptionId,
      enabled,
      reason: reason.trim(),
    });
    if (result.error) setMessage(result.error.message);
    else {
      setMessage(enabled ? 'Enforcement ativado.' : 'Enforcement desativado.');
      await load();
    }
    setLoading(false);
  };

  const verifyMfa = async () => {
    setLoading(true);
    const factors = await supabase.auth.mfa.listFactors();
    const factor = factors.data?.totp.find((item) => item.status === 'verified');
    if (!factor) {
      setMessage('Esta conta precisa cadastrar um fator TOTP antes de acessar o Control.');
      setLoading(false);
      return;
    }
    const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
    if (challenge.error) {
      setMessage(challenge.error.message);
      setLoading(false);
      return;
    }
    const verification = await supabase.auth.mfa.verify({
      factorId: factor.id,
      challengeId: challenge.data.id,
      code: mfaCode.trim(),
    });
    if (verification.error) {
      setMessage(verification.error.message);
      setLoading(false);
      return;
    }
    setMfaCode('');
    await load();
  };

  if (!session) {
    return <View style={styles.center}><View style={styles.card}><Text style={styles.title}>CutSync Control</Text><Text style={styles.muted}>Acesso interno separado dos aplicativos públicos.</Text><TextInput style={styles.input} placeholder="E-mail" autoCapitalize="none" value={email} onChangeText={setEmail} /><TextInput style={styles.input} placeholder="Senha" secureTextEntry value={password} onChangeText={setPassword} /><Pressable style={styles.primary} onPress={() => { void signIn(); }}><Text style={styles.primaryText}>Entrar</Text></Pressable>{message ? <Text style={styles.error}>{message}</Text> : null}</View></View>;
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" /></View>;
  if (needsMfa) return <View style={styles.center}><View style={styles.card}><Text style={styles.title}>MFA obrigatório</Text><Text style={styles.muted}>Informe o código do autenticador para elevar a sessão a AAL2.</Text><TextInput style={styles.input} value={mfaCode} onChangeText={setMfaCode} placeholder="Código de 6 dígitos" keyboardType="number-pad" maxLength={6} /><Pressable style={styles.primary} onPress={() => { void verifyMfa(); }}><Text style={styles.primaryText}>Verificar</Text></Pressable>{message ? <Text style={styles.error}>{message}</Text> : null}<Pressable style={styles.secondary} onPress={() => supabase.auth.signOut()}><Text>Sair</Text></Pressable></View></View>;
  if (!authorized) return <View style={styles.center}><View style={styles.card}><Text style={styles.title}>Acesso negado</Text><Text style={styles.error}>{message}</Text><Pressable style={styles.secondary} onPress={() => supabase.auth.signOut()}><Text>Sair</Text></Pressable></View></View>;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.header}><View><Text style={styles.title}>Cobrança multiunidade</Text><Text style={styles.muted}>Operação manual, auditada e isolada dos bundles públicos.</Text></View><Pressable style={styles.secondary} onPress={() => supabase.auth.signOut()}><Text>Sair</Text></Pressable></View>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Configuração do plano</Text>
        <TextInput style={styles.input} value={planCode} onChangeText={setPlanCode} placeholder="multi_unit_standard ou network" autoCapitalize="none" />
        <TextInput style={styles.input} value={basePrice} onChangeText={setBasePrice} placeholder="Preço-base em reais" keyboardType="decimal-pad" />
        <Pressable style={styles.primary} onPress={() => { void configurePlan(); }}><Text style={styles.primaryText}>Salvar preço-base</Text></Pressable>
      </View>
      <TextInput style={styles.input} placeholder="Justificativa para alteração (mín. 10 caracteres)" value={reason} onChangeText={setReason} />
      {rows.map((row) => (
        <View key={row.billing_account_id} style={styles.card}>
          <Text style={styles.cardTitle}>{row.organization_name}</Text>
          <Text style={styles.muted}>{row.active_units} unidade(s) · plano {row.plan_code ?? 'não configurado'} · status {row.subscription_status ?? 'sem assinatura'}</Text>
          {row.subscription_id ? <View style={styles.actions}>{['active', 'past_due', 'suspended', 'canceled'].map((status) => <Pressable key={status} style={styles.secondary} onPress={() => { void changeStatus(row.subscription_id, status); }}><Text>{status}</Text></Pressable>)}<Pressable style={styles.secondary} onPress={() => { void issueInvoice(row.subscription_id); }}><Text>Emitir fatura</Text></Pressable><Pressable style={styles.secondary} onPress={() => { void changeEnforcement(row.subscription_id, !row.enforcement_enabled); }}><Text>{row.enforcement_enabled ? 'Desativar bloqueio' : 'Ativar bloqueio'}</Text></Pressable></View> : <Pressable style={styles.primary} onPress={() => { void activateSubscription(row.organization_id); }}><Text style={styles.primaryText}>Ativar assinatura</Text></Pressable>}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#f5f5f2' },
  page: { width: '100%', maxWidth: 1100, alignSelf: 'center', padding: 32, gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
  card: { width: '100%', maxWidth: 620, padding: 22, gap: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#dfe3df', borderRadius: 16 },
  title: { fontSize: 28, fontWeight: '700', color: '#18201b' },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#18201b' },
  muted: { color: '#657067', lineHeight: 20 },
  input: { minHeight: 48, paddingHorizontal: 14, borderWidth: 1, borderColor: '#cfd6d0', borderRadius: 10, backgroundColor: '#fff' },
  primary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#173d2b' },
  primaryText: { color: '#fff', fontWeight: '700' },
  secondary: { minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderWidth: 1, borderColor: '#cfd6d0', borderRadius: 9, backgroundColor: '#fff' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { color: '#a33a31' },
  message: { color: '#285f43' },
});
