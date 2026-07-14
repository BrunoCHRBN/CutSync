import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Copy, ExternalLink, ImagePlus, Link2, MapPin, Palette, Phone, Save, Store } from 'lucide-react-native';
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
  const [openingHours, setOpeningHours] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#F5A524');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
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
        setOpeningHours(shop.openingHours || '');
        setPrimaryColor(shop.primaryColor || '#F5A524');
        setLogoUrl(shop.logoUrl || null);
        setLoading(false);
      },
      error: () => setLoading(false),
    });
    return () => sub.unsubscribe();
  }, [profile]);

  const pickImage = async () => {
    setNotice(null);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) setImageUri(result.assets[0].uri);
  };

  const uploadImage = async () => {
    if (!imageUri || !barbershop) return logoUrl;
    const response = await fetch(imageUri);
    const blob = await response.blob();
    const extension = imageUri.split('.').pop()?.split('?')[0] || 'jpg';
    const path = `${barbershop.id}/logo-${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from('barbershop-logos').upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
    if (error) throw error;
    return supabase.storage.from('barbershop-logos').getPublicUrl(path).data.publicUrl;
  };

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
      const nextLogo = await uploadImage();
      await database.write(async () => {
        await barbershop.update((record) => {
          record.name = name.trim();
          record.slug = cleanSlug;
          record.address = address.trim();
          record.phone = phone.trim();
          record.openingHours = openingHours.trim();
          record.primaryColor = primaryColor.toUpperCase();
          record.logoUrl = nextLogo || undefined;
        });
      });
      setLogoUrl(nextLogo || null);
      setImageUri(null);
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
      <SectionHeading testID="settings-heading" eyebrow="Preferências" title="Identidade e contato" description="Mantenha as informações que seus clientes veem e a marca que sua equipe usa todos os dias." />
      {!!notice && <InlineNotice testID="settings-action-notice" tone={notice.tone} message={notice.message} />}

      <View style={[styles.workspace, isWide && styles.workspaceWide]}>
        <View style={styles.formColumn}>
          <FormSection testID="settings-brand-section" title="Marca da barbearia" description="A cor personaliza detalhes da experiência sem perder a identidade CutSync.">
            <View style={styles.logoRow}>
              <View testID="settings-logo-preview" style={[styles.logoPreview, { borderColor: primaryColor }]}> 
                {imageUri || logoUrl ? <Image source={{ uri: imageUri || logoUrl || '' }} style={styles.logoImage} /> : <Store color={primaryColor} size={30} />}
              </View>
              <View style={styles.logoCopy}>
                <Text style={styles.logoTitle}>Logo da barbearia</Text>
                <Text style={styles.logoHint}>Use uma imagem quadrada de boa qualidade.</Text>
                <AppButton label="Escolher imagem" testID="settings-pick-logo-button" onPress={pickImage} variant="secondary" icon={<ImagePlus color={colors.text} size={16} />} style={styles.compactButton} />
              </View>
            </View>
            <View style={styles.fieldsRow}>
              <AppInput containerStyle={styles.flexField} label="Nome comercial" testID="settings-name-input" icon={<Store color={colors.textMuted} size={17} />} value={name} onChangeText={setName} placeholder="Nome da barbearia" />
              <AppInput containerStyle={styles.colorField} label="Cor da marca" testID="settings-color-input" icon={<Palette color={colors.textMuted} size={17} />} value={primaryColor} onChangeText={setPrimaryColor} autoCapitalize="characters" />
            </View>
          </FormSection>

          <FormSection testID="settings-contact-section" title="Contato e localização" description="Esses dados aparecem no perfil público e ajudam o cliente antes da visita.">
            <AppInput label="Endereço" testID="settings-address-input" icon={<MapPin color={colors.textMuted} size={17} />} value={address} onChangeText={setAddress} placeholder="Rua, número, bairro e cidade" />
            <View style={styles.fieldsRow}>
              <AppInput containerStyle={styles.flexField} label="Telefone" testID="settings-phone-input" icon={<Phone color={colors.textMuted} size={17} />} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="(11) 99999-9999" />
              <AppInput containerStyle={styles.flexField} label="Horário de funcionamento" testID="settings-hours-input" value={openingHours} onChangeText={setOpeningHours} placeholder="Seg–Sáb, 9h às 20h" />
            </View>
          </FormSection>
        </View>

        <View style={styles.previewColumn}>
          <AppCard testID="settings-public-profile-preview" style={styles.previewCard} elevated>
            <Text style={styles.previewEyebrow}>PERFIL PÚBLICO</Text>
            <View style={[styles.previewLogo, { backgroundColor: `${primaryColor}22`, borderColor: `${primaryColor}55` }]}>
              {imageUri || logoUrl ? <Image source={{ uri: imageUri || logoUrl || '' }} style={styles.previewLogoImage} /> : <Store color={primaryColor} size={26} />}
            </View>
            <Text testID="settings-preview-name" style={styles.previewName}>{name || 'Sua barbearia'}</Text>
            <Text testID="settings-preview-address" style={styles.previewMeta}>{address || 'Adicione seu endereço'}</Text>
            <Text testID="settings-preview-phone" style={styles.previewMeta}>{phone || 'Adicione seu telefone'}</Text>
            <View style={styles.linkBox}>
              <Link2 color={colors.brand} size={15} />
              <Text testID="settings-public-link" numberOfLines={1} style={styles.linkText}>cutsync.com/{slug || 'sua-barbearia'}</Text>
              <Pressable testID="settings-copy-public-link-button" onPress={copyPublicLink} style={({ pressed }) => [styles.copyButton, pressed && styles.pressed]}><Copy color={colors.ink} size={14} /></Pressable>
            </View>
            <AppInput label="Endereço digital" testID="settings-slug-input" icon={<ExternalLink color={colors.textMuted} size={17} />} value={slug} onChangeText={setSlug} autoCapitalize="none" hint="Use letras, números e hífens." />
          </AppCard>
          <AppButton label="Salvar alterações" testID="settings-save-button" onPress={saveSettings} loading={saving} fullWidth icon={<Save color={colors.ink} size={17} />} />
        </View>
      </View>
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
});