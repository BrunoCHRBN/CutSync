import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Copy, ExternalLink, Link2, MapPin, Palette, Phone, Save, Store } from 'lucide-react-native';
import { database } from '../../database';
import { Barbershop } from '../../database/models';
import { useAuth } from '../../contexts/AuthContext';
import { useSync } from '../../hooks/useSync';
import { AdminShell } from '../layout/AdminShell';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { FormSection } from '../ui/FormSection';
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

const defaultSchedule: DaySchedule[] = [
  { day: 1, name: 'Segunda-feira', isOpen: true, open: '09:00', close: '20:00' },
  { day: 2, name: 'Terça-feira', isOpen: true, open: '09:00', close: '20:00' },
  { day: 3, name: 'Quarta-feira', isOpen: true, open: '09:00', close: '20:00' },
  { day: 4, name: 'Quinta-feira', isOpen: true, open: '09:00', close: '20:00' },
  { day: 5, name: 'Sexta-feira', isOpen: true, open: '09:00', close: '20:00' },
  { day: 6, name: 'Sábado', isOpen: true, open: '09:00', close: '20:00' },
  { day: 0, name: 'Domingo', isOpen: false, open: '09:00', close: '18:00' },
];

export const SettingsExperience = () => {
  const { width } = useWindowDimensions();
  const isWide = width >= layout.desktopBreakpoint;
  const { profile, signOut } = useAuth();
  const { sync } = useSync();
  
  const [barbershop, setBarbershop] = useState<Barbershop | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [schedule, setSchedule] = useState<DaySchedule[]>(defaultSchedule);
  const [primaryColor, setPrimaryColor] = useState('#F5A524');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  
  // Novos campos estéticos
  const [slogan, setSlogan] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [instagram, setInstagram] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);

  useEffect(() => {
    if (!profile?.barbershop_id) { setLoading(false); return; }
    const sub = database.collections.get<Barbershop>('barbershops').findAndObserve(profile.barbershop_id).subscribe({
      next: (shop) => {
        setBarbershop(shop);
        setName(shop.name || '');
        setSlug(shop.slug || '');
        setAddress(shop.address || '');
        setPhone(shop.phone || '');
        setPrimaryColor(shop.primaryColor || '#F5A524');
        setLogoUrl(shop.logoUrl || null);
        setSlogan(shop.slogan || '');
        setBannerUrl(shop.bannerUrl || '');
        setInstagram(shop.instagram || '');

        let parsedHours = defaultSchedule;
        if (shop.openingHours) {
          try {
            parsedHours = JSON.parse(shop.openingHours);
          } catch {
            // Caso seja texto livre legado, mantém o default estruturado
          }
        }
        setSchedule(parsedHours);
        setLoading(false);
      },
      error: () => setLoading(false),
    });
    return () => sub.unsubscribe();
  }, [profile]);

  const saveSettings = async () => {
    setNotice(null);
    const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-_]/g, '');
    if (!name.trim() || !cleanSlug) {
      setNotice({ tone: 'danger', message: 'Nome e endereço digital são obrigatórios.' });
      return;
    }
    if (!/^#[0-9A-Fa-f]{6}$/.test(primaryColor)) {
      setNotice({ tone: 'danger', message: 'Use uma cor hexadecimal válida, como #F5A524.' });
      return;
    }
    if (!barbershop) return;

    setSaving(true);
    try {
      await database.write(async () => {
        await barbershop.update((record) => {
          record.name = name.trim();
          record.slug = cleanSlug;
          record.address = address.trim();
          record.phone = phone.trim();
          record.slogan = slogan.trim() || null;
          record.bannerUrl = bannerUrl.trim() || null;
          record.instagram = instagram.trim() || null;
          record.openingHours = JSON.stringify(schedule);
          record.primaryColor = primaryColor.toUpperCase();
          record.logoUrl = logoUrl || undefined;
        });
      });
      setSlug(cleanSlug);
      setNotice({ tone: 'success', message: 'Configurações atualizadas com sucesso.' });
      sync();
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível salvar todas as alterações.' });
    } finally {
      setSaving(false);
    }
  };

  const copyPublicLink = async () => {
    const link = `cutsync.com/${slug || 'sua-barbearia'}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) await navigator.clipboard.writeText(link);
      setNotice({ tone: 'success', message: 'Link público copiado.' });
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível copiar automaticamente.' });
    }
  };

  if (loading) {
    return <View testID="settings-loading-screen" style={styles.loading}><ActivityIndicator color={colors.brand} size="large" /></View>;
  }

  return (
    <AdminShell testID="settings-screen" activeRoute="settings" shopName={barbershop?.name || 'Sua barbearia'} userName={profile?.name} onSignOut={signOut}>
      <SectionHeading testID="settings-heading" eyebrow="Preferências" title="Identidade e funcionamento" description="Mantenha as informações que seus clientes veem e a marca que sua equipe usa todos os dias." />
      {!!notice && <InlineNotice testID="settings-action-notice" tone={notice.tone} message={notice.message} />}

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.workspace, isWide && styles.workspaceWide]}>
          <View style={styles.formColumn}>
            <FormSection testID="settings-brand-section" title="Marca da barbearia" description="A cor personaliza detalhes da experiência sem perder a identidade CutSync.">
              <View style={styles.logoRow}>
                <View testID="settings-logo-preview" style={[styles.logoPreview, { borderColor: primaryColor }]}> 
                  {logoUrl ? <Image source={{ uri: logoUrl }} style={styles.logoImage} /> : <Store color={primaryColor} size={30} />}
                </View>
                <View style={styles.logoCopy}>
                  <Text style={styles.logoTitle}>Logo da barbearia</Text>
                  <Text style={styles.logoHint}>A logo atual é exibida aqui; nome e cor controlam a identidade principal.</Text>
                </View>
              </View>
              <View style={styles.fieldsRow}>
                <AppInput containerStyle={styles.flexField} label="Nome comercial" testID="settings-name-input" icon={<Store color={colors.textMuted} size={17} />} value={name} onChangeText={setName} placeholder="Nome da barbearia" />
                <AppInput containerStyle={styles.colorField} label="Cor da marca" testID="settings-color-input" icon={<Palette color={colors.textMuted} size={17} />} value={primaryColor} onChangeText={setPrimaryColor} autoCapitalize="characters" />
              </View>
            </FormSection>

            <FormSection testID="settings-contact-section" title="Contato, localização e redes" description="Esses dados aparecem no perfil público e ajudam o cliente antes da visita.">
              <AppInput label="Endereço" testID="settings-address-input" icon={<MapPin color={colors.textMuted} size={17} />} value={address} onChangeText={setAddress} placeholder="Rua, número, bairro e cidade" />
              <View style={styles.fieldsRow}>
                <AppInput containerStyle={styles.flexField} label="Telefone" testID="settings-phone-input" icon={<Phone color={colors.textMuted} size={17} />} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="(11) 99999-9999" />
                <AppInput containerStyle={styles.flexField} label="Instagram (sem @)" value={instagram} onChangeText={setInstagram} placeholder="ex: barbeariadobruno" />
              </View>
              <AppInput label="Capa do perfil (URL do Banner)" value={bannerUrl} onChangeText={setBannerUrl} placeholder="ex: https://images.unsplash.com/photo-..." />
              <AppInput label="Slogan / Frase de efeito (máx 150 car.)" value={slogan} onChangeText={setSlogan} placeholder="ex: A verdadeira experiência clássica" maxLength={150} />
            </FormSection>

            <FormSection title="Grade de Funcionamento Estruturada" description="Informe as horas exatas de atendimento para que os horários livres coincidam perfeitamente.">
              <View style={styles.scheduleGrid}>
                {schedule.map((dayItem, idx) => (
                  <View key={dayItem.day} style={styles.scheduleRow}>
                    <Text style={styles.scheduleDayName}>{dayItem.name}</Text>
                    <Switch
                      value={dayItem.isOpen}
                      onValueChange={(val) => {
                        const copy = [...schedule];
                        copy[idx].isOpen = val;
                        setSchedule(copy);
                      }}
                      trackColor={{ false: '#2C2C2E', true: `${primaryColor}44` }}
                      thumbColor={dayItem.isOpen ? primaryColor : '#8E8E93'}
                    />
                    {dayItem.isOpen ? (
                      <View style={styles.scheduleTimes}>
                        <TextInput
                          style={styles.timeInput}
                          value={dayItem.open}
                          onChangeText={(val) => {
                            const copy = [...schedule];
                            copy[idx].open = val;
                            setSchedule(copy);
                          }}
                          placeholder="09:00"
                          placeholderTextColor="#666"
                        />
                        <Text style={{ color: colors.textMuted, fontSize: 10 }}>às</Text>
                        <TextInput
                          style={styles.timeInput}
                          value={dayItem.close}
                          onChangeText={(val) => {
                            const copy = [...schedule];
                            copy[idx].close = val;
                            setSchedule(copy);
                          }}
                          placeholder="20:00"
                          placeholderTextColor="#666"
                        />
                      </View>
                    ) : (
                      <Text style={styles.closedText}>Fechado</Text>
                    )}
                  </View>
                ))}
              </View>
            </FormSection>
          </View>

          <View style={styles.previewColumn}>
            <AppCard testID="settings-public-profile-preview" style={styles.previewCard} elevated>
              <Text style={styles.previewEyebrow}>PERFIL PÚBLICO</Text>
              <View style={[styles.previewLogo, { backgroundColor: `${primaryColor}22`, borderColor: `${primaryColor}55` }]}>
                {logoUrl ? <Image source={{ uri: logoUrl }} style={styles.previewLogoImage} /> : <Store color={primaryColor} size={26} />}
              </View>
              <Text testID="settings-preview-name" style={styles.previewName}>{name || 'Sua barbearia'}</Text>
              {!!slogan && <Text style={{ color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 9, marginTop: 4, textAlign: 'center' }}>“{slogan}”</Text>}
              <Text testID="settings-preview-address" style={styles.previewMeta}>{address || 'Adicione seu endereço'}</Text>
              <Text testID="settings-preview-phone" style={styles.previewMeta}>{phone || 'Adicione seu telefone'}</Text>
              <View style={styles.linkBox}>
                <Link2 color={colors.brand} size={15} />
                <Text testID="settings-public-link" numberOfLines={1} style={styles.linkText}>cutsync.com/{slug || 'sua-barbearia'}</Text>
                <Pressable testID="settings-copy-public-link-button" onPress={copyPublicLink} style={({ pressed }) => [styles.copyButton, pressed && styles.pressed]}><Copy color={colors.ink} size={14} /></Pressable>
              </View>
              <AppInput label="Endereço digital" testID="settings-slug-input" icon={<ExternalLink color={colors.textMuted} size={17} />} value={slug} onChangeText={setSlug} autoCapitalize="none" hint="Use letras, números e hífens." />
            </AppCard>
            <AppButton label="Salvar configurações" testID="settings-save-button" onPress={saveSettings} loading={saving} fullWidth icon={<Save color={colors.ink} size={17} />} />
          </View>
        </View>
      </ScrollView>
    </AdminShell>
  );
};

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
  workspace: { gap: 18, marginTop: 28 },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start' },
  formColumn: { flex: 1.35, gap: 14 },
  previewColumn: { flex: 0.75, minWidth: 300, gap: 12 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logoPreview: { width: 78, height: 78, borderRadius: radii.lg, borderWidth: 2, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoImage: { width: '100%', height: '100%' },
  logoCopy: { flex: 1 },
  logoTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12 },
  logoHint: { color: colors.textMuted, fontFamily: typography.body, fontSize: 9, marginTop: 4, marginBottom: 10 },
  compactButton: { alignSelf: 'flex-start', minHeight: 38, paddingVertical: 7 },
  fieldsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  flexField: { flex: 1, minWidth: 210 },
  colorField: { width: 190 },
  previewCard: { alignItems: 'center', padding: 24 },
  previewEyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 9, letterSpacing: 1.8, alignSelf: 'flex-start' },
  previewLogo: { width: 74, height: 74, borderRadius: radii.xl, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 28, overflow: 'hidden' },
  previewLogoImage: { width: '100%', height: '100%' },
  previewName: { color: colors.text, fontFamily: typography.display, fontSize: 21, letterSpacing: -0.7, marginTop: 15, textAlign: 'center' },
  previewMeta: { color: colors.textMuted, fontFamily: typography.body, fontSize: 10, marginTop: 5, textAlign: 'center' },
  linkBox: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.brandSoft, borderRadius: radii.md, padding: 9, marginTop: 22, marginBottom: 16 },
  linkText: { flex: 1, color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 10 },
  copyButton: { width: 30, height: 30, borderRadius: radii.sm, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6, transform: [{ scale: 0.97 }] },
  scheduleGrid: { backgroundColor: colors.surface, borderHeight: 1, borderColor: colors.border, borderRadius: radii.lg, padding: 16, gap: 10 },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: `${colors.border}44` },
  scheduleDayName: { flex: 1, color: colors.text, fontFamily: typography.bodyStrong, fontSize: 11 },
  scheduleTimes: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 16 },
  timeInput: { width: 56, height: 34, textAlign: 'center', color: colors.text, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, fontSize: 11, paddingHorizontal: 4 },
  closedText: { color: colors.textMuted, fontSize: 11, fontFamily: typography.body, minWidth: 120, textAlign: 'right' }
});