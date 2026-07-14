import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Building2, Mail, Phone, Scissors, UserRound, UsersRound, LockKeyhole, Link2 } from 'lucide-react-native';
import { supabase } from '../../services/supabase';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { BrandMark } from '../ui/BrandMark';
import { InlineNotice } from '../ui/InlineNotice';
import { ScreenBackground } from '../ui/ScreenBackground';
import { colors, layout, radii, typography } from '../../theme/tokens';

type Role = 'client' | 'admin' | 'barber';

const roleOptions = [
  { value: 'client' as const, title: 'Sou cliente', description: 'Quero encontrar barbearias e marcar horários.', Icon: UserRound },
  { value: 'admin' as const, title: 'Tenho uma barbearia', description: 'Quero organizar agenda, equipe e resultados.', Icon: Building2 },
  { value: 'barber' as const, title: 'Sou profissional', description: 'Quero entrar na equipe de uma barbearia.', Icon: Scissors },
];

export const RegisterExperience = () => {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 920;
  const [role, setRole] = useState<Role>('client');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [shopName, setShopName] = useState('');
  const [slug, setSlug] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#F5A524');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const cleanSlug = useMemo(() => slug.toLowerCase().trim().replace(/[^a-z0-9-_]/g, ''), [slug]);

  const selectRole = (nextRole: Role) => {
    setRole(nextRole);
    setError('');
  };

  const handleRegister = async () => {
    setError('');
    if (!name.trim() || !email.trim() || password.length < 6) {
      setError('Informe nome, e-mail e uma senha com pelo menos 6 caracteres.');
      return;
    }
    if (role === 'admin' && (!shopName.trim() || !cleanSlug)) {
      setError('Informe o nome e o endereço digital da sua barbearia.');
      return;
    }
    if (role === 'barber' && !cleanSlug) {
      setError('Informe o código da barbearia que convidou você.');
      return;
    }
    if (role === 'admin' && !/^#[0-9A-Fa-f]{6}$/.test(primaryColor)) {
      setError('Use uma cor hexadecimal válida, como #F5A524.');
      return;
    }

    setLoading(true);
    try {
      let barbershopId: string | null = null;
      if (role === 'admin') {
        const { data, error: shopError } = await supabase.from('barbershops').insert({
          name: shopName.trim(),
          slug: cleanSlug,
          primary_color: primaryColor,
          timezone: 'America/Sao_Paulo',
          currency: 'BRL',
        }).select('id').single();
        if (shopError) throw new Error(shopError.code === '23505' ? 'Este endereço digital já está em uso.' : 'Não foi possível criar a barbearia.');
        barbershopId = data.id;
      }

      if (role === 'barber') {
        const { data, error: shopError } = await supabase.from('barbershops').select('id').eq('slug', cleanSlug).single();
        if (shopError || !data) throw new Error('Não encontramos uma barbearia com esse código.');
        barbershopId = data.id;
      }

      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: { name: name.trim(), phone: phone.trim(), role, barbershop_id: barbershopId } },
      });
      if (signUpError) throw new Error(signUpError.message.includes('registered') ? 'Este e-mail já possui uma conta.' : 'Não foi possível concluir o cadastro.');
      router.replace('/(auth)/login');
    } catch (registerError: any) {
      setError(registerError.message || 'Não foi possível concluir o cadastro.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenBackground testID="register-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.shell, isWide && styles.shellWide]}>
            <View style={[styles.introPane, isWide && styles.introPaneWide]}>
              <BrandMark testID="register-brand" />
              <View style={styles.introCopy}>
                <Text testID="register-eyebrow" style={styles.eyebrow}>COMECE DO SEU JEITO</Text>
                <Text testID="register-title" style={styles.title}>Uma conta.{`\n`}Três experiências.</Text>
                <Text testID="register-description" style={styles.description}>Escolha seu perfil e o CutSync configura o caminho certo para você.</Text>
              </View>
              {isWide && (
                <View testID="register-benefits" style={styles.benefits}>
                  <Benefit icon={<UsersRound color={colors.brand} size={18} />} title="Feito para a operação real" text="Cliente, profissional e gestor conectados no mesmo fluxo." />
                  <Benefit icon={<Link2 color={colors.info} size={18} />} title="Conexão por convite" text="Profissionais entram usando o código seguro da barbearia." />
                </View>
              )}
            </View>

            <AppCard testID="register-form-card" style={[styles.formCard, isWide && styles.formCardWide]} elevated>
              <Text style={styles.formTitle}>Criar sua conta</Text>
              <Text style={styles.formSubtitle}>Primeiro, conte como você vai usar o CutSync.</Text>

              <View testID="register-role-selector" style={styles.roleGrid}>
                {roleOptions.map(({ value, title, description, Icon }) => {
                  const active = value === role;
                  return (
                    <Pressable
                      key={value}
                      testID={`register-role-${value}`}
                      onPress={() => selectRole(value)}
                      style={({ pressed }) => [styles.roleCard, active && styles.roleCardActive, pressed && styles.pressed]}
                    >
                      <View style={[styles.roleIcon, active && styles.roleIconActive]}><Icon color={active ? colors.ink : colors.textSecondary} size={18} /></View>
                      <Text style={styles.roleTitle}>{title}</Text>
                      <Text style={styles.roleDescription}>{description}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.fields}>
                <AppInput label="Nome completo" testID="register-name-input" icon={<UserRound color={colors.textMuted} size={17} />} placeholder="Como podemos chamar você?" value={name} onChangeText={setName} autoComplete="name" />
                <View style={styles.fieldsRow}>
                  <AppInput containerStyle={styles.halfField} label="E-mail" testID="register-email-input" icon={<Mail color={colors.textMuted} size={17} />} placeholder="voce@exemplo.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
                  <AppInput containerStyle={styles.halfField} label="Telefone" testID="register-phone-input" icon={<Phone color={colors.textMuted} size={17} />} placeholder="(11) 99999-9999" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
                </View>
                <AppInput label="Senha" testID="register-password-input" icon={<LockKeyhole color={colors.textMuted} size={17} />} placeholder="Mínimo de 6 caracteres" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
              </View>

              {role === 'admin' && (
                <View testID="register-admin-fields" style={styles.extraFields}>
                  <Text style={styles.extraTitle}>Sua barbearia</Text>
                  <AppInput label="Nome comercial" testID="register-shop-name-input" icon={<Building2 color={colors.textMuted} size={17} />} placeholder="Ex.: Navalha Studio" value={shopName} onChangeText={setShopName} />
                  <View style={styles.fieldsRow}>
                    <AppInput containerStyle={styles.halfField} label="Endereço digital" testID="register-shop-slug-input" icon={<Link2 color={colors.textMuted} size={17} />} placeholder="navalha-studio" value={slug} onChangeText={setSlug} autoCapitalize="none" hint={cleanSlug ? `cutsync.com/${cleanSlug}` : 'Use letras, números e hífens.'} />
                    <AppInput containerStyle={styles.halfField} label="Cor da marca" testID="register-shop-color-input" placeholder="#F5A524" value={primaryColor} onChangeText={setPrimaryColor} autoCapitalize="characters" />
                  </View>
                </View>
              )}

              {role === 'barber' && (
                <View testID="register-barber-fields" style={styles.extraFields}>
                  <Text style={styles.extraTitle}>Entrar em uma equipe</Text>
                  <AppInput label="Código da barbearia" testID="register-barbershop-code-input" icon={<Link2 color={colors.textMuted} size={17} />} placeholder="Código enviado pelo gestor" value={slug} onChangeText={setSlug} autoCapitalize="none" hint="Peça esse código ao responsável pela barbearia." />
                </View>
              )}

              {!!error && <InlineNotice testID="register-error-message" tone="danger" message={error} />}

              <AppButton label="Criar conta" testID="register-submit-button" onPress={handleRegister} loading={loading} fullWidth />
              <Pressable testID="register-login-link" onPress={() => router.push('/(auth)/login')} style={({ pressed }) => [styles.loginLink, pressed && styles.pressed]}>
                <Text style={styles.loginText}>Já possui uma conta? <Text style={styles.loginAccent}>Entrar</Text></Text>
              </Pressable>
            </AppCard>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
};

const Benefit = ({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) => (
  <View style={styles.benefit}><View style={styles.benefitIcon}>{icon}</View><View style={styles.benefitCopy}><Text style={styles.benefitTitle}>{title}</Text><Text style={styles.benefitText}>{text}</Text></View></View>
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 18, paddingVertical: 32 },
  shell: { width: '100%', maxWidth: 1180, alignSelf: 'center', gap: 28 },
  shellWide: { flexDirection: 'row', alignItems: 'flex-start' },
  introPane: { padding: 10 },
  introPaneWide: { width: '36%', padding: 34, paddingTop: 24, position: 'sticky', top: 20 } as any,
  introCopy: { marginTop: 54 },
  eyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 10, letterSpacing: 2 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 39, lineHeight: 44, letterSpacing: -1.9, marginTop: 12 },
  description: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 13, lineHeight: 21, marginTop: 12, maxWidth: 350 },
  benefits: { gap: 16, marginTop: 48 },
  benefit: { flexDirection: 'row', gap: 12 },
  benefitIcon: { width: 38, height: 38, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  benefitCopy: { flex: 1 },
  benefitTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 11 },
  benefitText: { color: colors.textMuted, fontFamily: typography.body, fontSize: 10, lineHeight: 15, marginTop: 3 },
  formCard: { gap: 20, padding: 22 },
  formCardWide: { flex: 1, padding: 30 },
  formTitle: { color: colors.text, fontFamily: typography.display, fontSize: 23, letterSpacing: -0.7 },
  formSubtitle: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, marginTop: -14 },
  roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  roleCard: { flex: 1, minWidth: 160, minHeight: 126, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: 13 },
  roleCardActive: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  roleIcon: { width: 32, height: 32, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfacePressed },
  roleIconActive: { backgroundColor: colors.brand },
  roleTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 11, marginTop: 10 },
  roleDescription: { color: colors.textMuted, fontFamily: typography.body, fontSize: 9, lineHeight: 14, marginTop: 4 },
  fields: { gap: 16 },
  fieldsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  halfField: { flex: 1, minWidth: 210 },
  extraFields: { gap: 16, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 20 },
  extraTitle: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2 },
  loginLink: { alignItems: 'center', paddingVertical: 4 },
  loginText: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11 },
  loginAccent: { color: colors.brand, fontFamily: typography.bodyStrong },
  pressed: { opacity: 0.65, transform: [{ scale: 0.99 }] },
});