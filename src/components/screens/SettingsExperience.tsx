import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Copy, ExternalLink, Link2, MapPin, Palette, Phone, Save, Store } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { database } from '../../database';
import { Barbershop } from '../../database/models';
import { useAuth } from '../../contexts/AuthContext';
import { useSync } from '../../hooks/useSync';
import { supabase } from '../../services/supabase';
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
  const [cep, setCep] = useState('');
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

  const fetchAddressByCep = async (rawCep: string) => {
    const cleanCep = rawCep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();
      if (data.erro) {
        setNotice({ tone: 'danger', message: 'CEP não encontrado.' });
        return;
      }
      // Formatar endereço completo: Rua, Bairro, Cidade - UF, Brasil
      const addressString = `${data.logradouro}, ${data.bairro}, ${data.localidade} - ${data.uf}, Brasil`;
      setAddress(addressString);
      setNotice({ tone: 'success', message: 'Endereço preenchido automaticamente!' });
    } catch (err) {
      console.warn('ViaCEP fetch failed:', err);
    }
  };

  const handleCepChange = (val: string) => {
    let formatted = val.replace(/\D/g, '');
    if (formatted.length > 8) {
      formatted = formatted.substring(0, 8);
    }
    if (formatted.length > 5) {
      formatted = `${formatted.substring(0, 5)}-${formatted.substring(5)}`;
    }
    setCep(formatted);

    const clean = formatted.replace(/\D/g, '');
    if (clean.length === 8) {
      fetchAddressByCep(clean);
    }
  };

  const requestPermission = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setNotice({ tone: 'danger', message: 'Permissão de acesso à galeria de fotos é necessária para esta ação.' });
        return false;
      }
    }
    return true;
  };

  const handleImageUpload = async (uri: string, onUploadSuccess: (url: string) => void) => {
    try {
      setSaving(true);
      setNotice(null);

      const response = await fetch(uri);
      const blob = await response.blob();

      const fileExt = uri.split('.').pop()?.split('?')[0] || 'jpg';
      const fileName = `${profile?.barbershop_id || 'public'}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const bucketName = 'banners';

      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(fileName, blob, {
          contentType: blob.type || 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        console.error('Supabase upload error:', uploadError);
        throw uploadError;
      }

      const { data: { publicUrl } } = supabase.storage
        .from(bucketName)
        .getPublicUrl(fileName);

      onUploadSuccess(publicUrl);
      setNotice({ tone: 'success', message: 'Imagem enviada com sucesso!' });
    } catch (error: any) {
      console.error('Image upload failed:', error);
      setNotice({
        tone: 'danger',
        message: `Não foi possível carregar a imagem. Verifique se o bucket 'banners' está configurado no seu Supabase. Detalhe: ${error.message || error}`,
      });
    } finally {
      setSaving(false);
    }
  };

  const pickImage = async (onSelected: (url: string) => void, aspect: [number, number]) => {
    const hasPermission = await requestPermission();
    if (!hasPermission) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      await handleImageUpload(asset.uri, onSelected);
    }
  };

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
                  <AppButton
                    label="Alterar Logo"
                    testID="settings-upload-logo-button"
                    onPress={() => pickImage((url) => setLogoUrl(url), [1, 1])}
                    style={styles.compactUploadButton}
                  />
                </View>
              </View>
              <View style={styles.fieldsRow}>
                <AppInput containerStyle={styles.flexField} label="Nome comercial" testID="settings-name-input" icon={<Store color={colors.textMuted} size={17} />} value={name} onChangeText={setName} placeholder="Nome da barbearia" />
                <AppInput containerStyle={styles.colorField} label="Cor da marca" testID="settings-color-input" icon={<Palette color={colors.textMuted} size={17} />} value={primaryColor} onChangeText={setPrimaryColor} autoCapitalize="characters" />
              </View>
            </FormSection>

            <FormSection testID="settings-contact-section" title="Contato, localização e redes" description="Esses dados aparecem no perfil público e ajudam o cliente antes da visita.">
              <View style={styles.fieldsRow}>
                <AppInput containerStyle={styles.flexField} label="CEP (Preenchimento automático)" testID="settings-cep-input" icon={<MapPin color={colors.textMuted} size={17} />} value={cep} onChangeText={handleCepChange} keyboardType="numeric" placeholder="01001-000" />
                <AppInput containerStyle={styles.flexField} label="Endereço completo" testID="settings-address-input" icon={<MapPin color={colors.textMuted} size={17} />} value={address} onChangeText={setAddress} placeholder="Rua, número, bairro e cidade" />
              </View>
              <View style={styles.fieldsRow}>
                <AppInput containerStyle={styles.flexField} label="Telefone" testID="settings-phone-input" icon={<Phone color={colors.textMuted} size={17} />} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="(11) 99999-9999" />
                <AppInput containerStyle={styles.flexField} label="Instagram (sem @)" testID="settings-instagram-input" value={instagram} onChangeText={setInstagram} placeholder="ex: barbeariadobruno" />
              </View>
              <View style={{ gap: 8 }}>
                <AppInput label="Capa do perfil (URL do Banner)" testID="settings-banner-input" value={bannerUrl} onChangeText={setBannerUrl} placeholder="ex: https://images.unsplash.com/photo-..." />
                <AppButton
                  label="Selecionar Imagem do Banner"
                  testID="settings-upload-banner-button"
                  onPress={() => pickImage((url) => setBannerUrl(url), [16, 9])}
                  style={styles.uploadButton}
                />
              </View>
              <AppInput label="Slogan / Frase de efeito (máx 150 car.)" testID="settings-slogan-input" value={slogan} onChangeText={setSlogan} placeholder="ex: A verdadeira experiência clássica" maxLength={150} />
            </FormSection>

            <FormSection title="Grade de Funcionamento Estruturada" testID="settings-schedule-section" description="Informe as horas exatas de atendimento para que os horários livres coincidam perfeitamente.">
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
  scheduleGrid: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: 16, gap: 10 },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: `${colors.border}44` },
  scheduleDayName: { flex: 1, color: colors.text, fontFamily: typography.bodyStrong, fontSize: 11 },
  scheduleTimes: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 16 },
  timeInput: { width: 56, height: 34, textAlign: 'center', color: colors.text, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, fontSize: 11, paddingHorizontal: 4 },
  closedText: { color: colors.textMuted, fontSize: 11, fontFamily: typography.body, minWidth: 120, textAlign: 'right' },
  compactUploadButton: { minHeight: 32, paddingVertical: 5, paddingHorizontal: 12, alignSelf: 'flex-start', marginTop: 4 },
  uploadButton: { minHeight: 38, paddingVertical: 8, paddingHorizontal: 16, alignSelf: 'flex-start' }
});