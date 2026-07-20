import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Clock3, Copy, ExternalLink, ImageIcon, KeyRound, Link2, MapPin, Palette, Phone, Save, ShieldCheck, Store, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../contexts/AuthContext';
import { useEstablishment } from '../../hooks/useEstablishment';
import { supabase } from '../../services/supabase';
import { AdminShell } from '../layout/AdminShell';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { FormSection } from '../ui/FormSection';
import { InlineNotice } from '../ui/InlineNotice';
import { SectionHeading } from '../ui/SectionHeading';
import { colors, layout, radii, typography } from '../../theme/tokens';
import { getErrorMessage } from '../../utils/errors';
import { StickyActionBar } from '../ui/sticky-action-bar';

type SettingsSection = 'brand' | 'contact' | 'images' | 'schedule' | 'security';

interface SettingsSnapshot {
  name: string;
  slug: string;
  address: string;
  phone: string;
  schedule: DaySchedule[];
  primaryColor: string;
  logoUrl: string | null;
  galleryUrls: string[];
  slogan: string;
  bannerUrl: string;
  instagram: string;
}

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

const settingsSections: { key: SettingsSection; label: string; Icon: typeof Store }[] = [
  { key: 'brand', label: 'Marca', Icon: Store },
  { key: 'contact', label: 'Contato', Icon: Phone },
  { key: 'images', label: 'Imagens', Icon: ImageIcon },
  { key: 'schedule', label: 'Funcionamento', Icon: Clock3 },
  { key: 'security', label: 'Segurança', Icon: ShieldCheck },
];

export const SettingsExperience = () => {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= layout.desktopBreakpoint;
  const { profile, signOut } = useAuth();
  const { establishment: barbershop, loading } = useEstablishment(profile?.establishment_id);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [address, setAddress] = useState('');
  const [cep, setCep] = useState('');
  const [phone, setPhone] = useState('');
  const [schedule, setSchedule] = useState<DaySchedule[]>(defaultSchedule);
  const [primaryColor, setPrimaryColor] = useState('#F5A524');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  
  // Novos campos estéticos
  const [slogan, setSlogan] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [instagram, setInstagram] = useState('');

  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSection>('brand');
  const [savedSnapshot, setSavedSnapshot] = useState('');

  const currentSnapshot = useMemo(() => JSON.stringify({
    name,
    slug,
    address,
    phone,
    schedule,
    primaryColor,
    logoUrl,
    galleryUrls,
    slogan,
    bannerUrl,
    instagram,
  }), [address, bannerUrl, galleryUrls, instagram, logoUrl, name, phone, primaryColor, schedule, slogan, slug]);
  const isDirty = Boolean(savedSnapshot && currentSnapshot !== savedSnapshot);
  const invalidSchedule = schedule.some((day) => day.isOpen && (!/^\d{2}:\d{2}$/.test(day.open) || !/^\d{2}:\d{2}$/.test(day.close) || day.open >= day.close));
  const formError = !name.trim() || !slug.trim()
    ? 'Nome e endereço digital são obrigatórios.'
    : !/^#[0-9A-Fa-f]{6}$/.test(primaryColor)
      ? 'Informe uma cor hexadecimal válida.'
      : invalidSchedule
        ? 'Revise o funcionamento: a abertura deve ser anterior ao fechamento.'
        : null;

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

  const handleImageUpload = async (uri: string): Promise<string | null> => {
    try {
      setSaving(true);
      setNotice(null);

      const response = await fetch(uri);
      const blob = await response.blob();

      const fileExt = uri.split('.').pop()?.split('?')[0] || 'jpg';
      const fileName = `${profile?.establishment_id || 'public'}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
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

      return publicUrl;
    } catch (error: unknown) {
      console.error('Image upload failed:', error);
      setNotice({
        tone: 'danger',
        message: `Não foi possível carregar a imagem. Verifique se o bucket 'banners' está configurado no seu Supabase. Detalhe: ${getErrorMessage(error, 'erro desconhecido')}`,
      });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const pickImage = async (aspect: [number, number]): Promise<string | null> => {
    const hasPermission = await requestPermission();
    if (!hasPermission) return null;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      return handleImageUpload(asset.uri);
    }
    return null;
  };

  const handleAddGalleryPhoto = async () => {
    const url = await pickImage([4, 5]);
    if (!url) return;
    const nextGallery = [...galleryUrls, url];
    setGalleryUrls(nextGallery);
    setNotice({ tone: 'success', message: 'Foto adicionada ao preview. Salve para publicar.' });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (barbershop) {
      const shop = barbershop;
        setName(shop.name || '');
        setSlug(shop.slug || '');
        setAddress(shop.address || '');
        setPhone(shop.phone || '');
        setPrimaryColor(shop.primaryColor || '#F5A524');
        setLogoUrl(shop.logoUrl || null);
        setSlogan(shop.slogan || '');
        setBannerUrl(shop.bannerUrl || '');
        setInstagram(shop.instagram || '');

        let parsedGallery: string[] = [];
        if (shop.galleryUrls) {
          try {
            const parsed = JSON.parse(shop.galleryUrls);
            parsedGallery = Array.isArray(parsed) ? parsed : [];
          } catch {
            parsedGallery = String(shop.galleryUrls).split(',').map(s => s.trim()).filter(Boolean);
          }
        }
        setGalleryUrls(parsedGallery);

        let parsedHours = defaultSchedule;
        if (shop.openingHours) {
          try {
            parsedHours = JSON.parse(shop.openingHours);
          } catch {
            // Caso seja texto livre legado, mantém o default estruturado
          }
        }
        setSchedule(parsedHours);
        setSavedSnapshot(JSON.stringify({
          name: shop.name || '',
          slug: shop.slug || '',
          address: shop.address || '',
          phone: shop.phone || '',
          schedule: parsedHours,
          primaryColor: shop.primaryColor || '#F5A524',
          logoUrl: shop.logoUrl || null,
          galleryUrls: parsedGallery,
          slogan: shop.slogan || '',
          bannerUrl: shop.bannerUrl || '',
          instagram: shop.instagram || '',
        }));
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [barbershop]);

  const saveSettings = async () => {
    setNotice(null);
    const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-_]/g, '');
    if (formError || !cleanSlug) {
      setNotice({ tone: 'danger', message: formError || 'Nome e endereço digital são obrigatórios.' });
      return;
    }
    if (!barbershop) return;

    setSaving(true);
    try {
      const { error } = await supabase.from('establishments').update({
        name: name.trim(), slug: cleanSlug, address: address.trim(), phone: phone.trim(),
        slogan: slogan.trim() || null, banner_url: bannerUrl.trim() || null,
        instagram: instagram.trim() || null, opening_hours: JSON.stringify(schedule),
        primary_color: primaryColor.toUpperCase(), logo_url: logoUrl,
        gallery_urls: JSON.stringify(galleryUrls),
      }).eq('id', barbershop.id);
      if (error) throw error;
      setSlug(cleanSlug);
      setSavedSnapshot(JSON.stringify({
        ...JSON.parse(currentSnapshot),
        name: name.trim(),
        slug: cleanSlug,
        primaryColor: primaryColor.toUpperCase(),
      }));
      setNotice({ tone: 'success', message: 'Configurações salvas na vitrine.' });
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível salvar todas as alterações.' });
    } finally {
      setSaving(false);
    }
  };

  const copyPublicLink = async () => {
    const link = `cutsync.com/salon/${slug || 'sua-barbearia'}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) await navigator.clipboard.writeText(link);
      setNotice({ tone: 'success', message: 'Link público copiado.' });
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível copiar automaticamente.' });
    }
  };

  const discardChanges = () => {
    if (!savedSnapshot) return;
    const snapshot = JSON.parse(savedSnapshot) as SettingsSnapshot;
    setName(snapshot.name);
    setSlug(snapshot.slug);
    setAddress(snapshot.address);
    setPhone(snapshot.phone);
    setSchedule(snapshot.schedule);
    setPrimaryColor(snapshot.primaryColor);
    setLogoUrl(snapshot.logoUrl);
    setGalleryUrls(snapshot.galleryUrls);
    setSlogan(snapshot.slogan);
    setBannerUrl(snapshot.bannerUrl);
    setInstagram(snapshot.instagram);
    setNotice(null);
  };

  if (loading) {
    return <View testID="settings-loading-screen" style={styles.loading}><ActivityIndicator color={colors.accent} size="large" /></View>;
  }

  return (
    <AdminShell testID="settings-screen" activeRoute="settings" shopName={barbershop?.name || 'Sua barbearia'} userName={profile?.name} onSignOut={signOut} contentMode="fixed" scroll={false}>
      <View style={styles.screen}>
        <View style={styles.screenHeader}>
          <SectionHeading testID="settings-heading" eyebrow="Preferências" title="Identidade e funcionamento" description="Mantenha as informações que seus clientes veem e a marca que sua equipe usa todos os dias." />
          {!!notice && <InlineNotice testID="settings-action-notice" tone={notice.tone} message={notice.message} />}
          {!!formError && isDirty && <InlineNotice testID="settings-form-error" tone="warning" message={formError} />}
        </View>

        <ScrollView contentContainerStyle={styles.settingsScroll} style={styles.settingsViewport} showsVerticalScrollIndicator={false}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectionNavigation}>
            {settingsSections.map(({ key, label, Icon }) => {
              const selected = activeSection === key;
              return (
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  key={key}
                  onPress={() => setActiveSection(key)}
                  style={[styles.sectionNavigationItem, selected && styles.sectionNavigationItemSelected]}
                  testID={`settings-section-${key}`}
                >
                  <Icon color={selected ? colors.brandPrimary : colors.textMuted} size={17} />
                  <Text style={[styles.sectionNavigationLabel, selected && styles.sectionNavigationLabelSelected]}>{label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        <View style={[styles.workspace, isWide && styles.workspaceWide]}>
          <View style={styles.formColumn}>
            {activeSection === 'brand' ? <FormSection testID="settings-brand-section" title="Marca da barbearia" description="A cor personaliza detalhes da experiência sem perder a identidade CutSync.">
              <View style={styles.logoRow}>
                <View testID="settings-logo-preview" style={styles.logoPreview}>
                  {logoUrl ? <Image source={{ uri: logoUrl }} style={styles.logoImage} /> : <Store color={colors.textSecondary} size={30} />}
                </View>
                <View style={styles.logoCopy}>
                  <Text style={styles.logoTitle}>Logo da barbearia</Text>
                  <Text style={styles.logoHint}>A logo atual é exibida aqui; nome e cor controlam a identidade principal.</Text>
                  <AppButton
                    label="Alterar Logo"
                    testID="settings-upload-logo-button"
                    onPress={async () => {
                      const url = await pickImage([1, 1]);
                      if (url) {
                        setLogoUrl(url);
                        setNotice({ tone: 'success', message: 'Logo enviada. Salve as configurações para publicar.' });
                      }
                    }}
                    variant="secondary"
                    style={styles.compactUploadButton}
                  />
                </View>
              </View>
              <View style={styles.fieldsRow}>
                <AppInput containerStyle={styles.flexField} label="Nome comercial" testID="settings-name-input" icon={<Store color={colors.textMuted} size={17} />} value={name} onChangeText={setName} placeholder="Nome da barbearia" />
                <View style={styles.colorFieldContainer}>
                  <AppInput containerStyle={styles.colorField} label="Cor da marca" testID="settings-color-input" icon={<Palette color={colors.textMuted} size={17} />} value={primaryColor} onChangeText={setPrimaryColor} autoCapitalize="characters" />
                  <View 
                    testID="settings-color-preview-swatch"
                    style={[
                      styles.colorSwatch, 
                      { 
                        backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(primaryColor) ? primaryColor : 'transparent' 
                      }
                    ]} 
                  />
                </View>
              </View>
            </FormSection> : null}

            {activeSection === 'security' ? <FormSection testID="settings-account-security-section" title="Segurança da conta" description="Atualize sua senha pessoal sem alterar dados ou permissões do estabelecimento.">
              <View style={styles.securityRow}>
                <View style={styles.securityIcon}><KeyRound color={colors.info} size={20} /></View>
                <View style={styles.securityCopy}>
                  <Text testID="settings-account-security-title" style={styles.securityTitle}>Senha de acesso</Text>
                  <Text testID="settings-account-security-description" style={styles.securityDescription}>Exigimos senha atual, 8 caracteres, maiúscula, minúscula, número e símbolo.</Text>
                </View>
                <AppButton label="Alterar senha" testID="settings-change-password-button" onPress={() => router.push('/security' as never)} variant="secondary" />
              </View>
            </FormSection> : null}

            {activeSection === 'contact' || activeSection === 'images' ? <FormSection testID="settings-contact-section" title={activeSection === 'contact' ? 'Contato, localização e redes' : 'Imagens da vitrine'} description={activeSection === 'contact' ? 'Esses dados aparecem no perfil público e ajudam o cliente antes da visita.' : 'Atualize o banner e a galeria antes de publicar as alterações.'}>
              {activeSection === 'contact' ? <>
              <View style={styles.fieldsRow}>
                <AppInput containerStyle={styles.flexField} label="CEP (Preenchimento automático)" testID="settings-cep-input" icon={<MapPin color={colors.textMuted} size={17} />} value={cep} onChangeText={handleCepChange} keyboardType="numeric" placeholder="01001-000" />
                <AppInput containerStyle={styles.flexField} label="Endereço completo" testID="settings-address-input" icon={<MapPin color={colors.textMuted} size={17} />} value={address} onChangeText={setAddress} placeholder="Rua, número, bairro e cidade" />
              </View>
              <View style={styles.fieldsRow}>
                <AppInput containerStyle={styles.flexField} label="Telefone" testID="settings-phone-input" icon={<Phone color={colors.textMuted} size={17} />} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="(11) 99999-9999" />
                <AppInput containerStyle={styles.flexField} label="Instagram (sem @)" testID="settings-instagram-input" value={instagram} onChangeText={setInstagram} placeholder="ex: barbeariadobruno" />
              </View>
              </> : <>
              <View style={{ gap: 8 }}>
                <AppInput label="Capa do perfil (URL do Banner)" testID="settings-banner-input" value={bannerUrl} onChangeText={setBannerUrl} placeholder="ex: https://images.unsplash.com/photo-..." />
                <AppButton
                  label="Selecionar Imagem do Banner"
                  testID="settings-upload-banner-button"
                  onPress={async () => {
                    const url = await pickImage([16, 9]);
                    if (url) {
                      setBannerUrl(url);
                      setNotice({ tone: 'success', message: 'Banner enviado. Salve as configurações para publicar.' });
                    }
                  }}
                  variant="secondary"
                  style={styles.uploadButton}
                />
              </View>
              <AppInput label="Slogan / Frase de efeito (máx 150 car.)" testID="settings-slogan-input" value={slogan} onChangeText={setSlogan} placeholder="ex: A verdadeira experiência clássica" maxLength={150} />

              <View style={{ gap: 8, marginTop: 12 }}>
                <Text style={styles.fieldLabel}>Galeria de Fotos do Estabelecimento</Text>
                {galleryUrls.length === 0 ? (
                  <Text style={styles.emptyGalleryText}>Nenhuma foto adicionada à galeria.</Text>
                ) : (
                  <View style={styles.galleryPreviewGrid}>
                    {galleryUrls.map((url, index) => (
                    <View key={`${url}-${index}`} testID={`settings-gallery-item-${index}`} style={styles.galleryItemContainer}>
                        <Image testID={`settings-gallery-image-${index}`} source={{ uri: url }} style={styles.galleryItemImage} />
                        <Pressable 
                          testID={`settings-gallery-remove-${index}`}
                          onPress={() => {
                            setGalleryUrls(prev => prev.filter((_, idx) => idx !== index));
                          }}
                          style={styles.galleryItemRemove}
                        >
                          <X color="#FFFFFF" size={12} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
                <AppButton
                  label="Adicionar Foto na Galeria (Proporção 4:5)"
                  testID="settings-upload-gallery-button"
                  onPress={handleAddGalleryPhoto}
                  variant="secondary"
                  style={styles.uploadButton}
                />
              </View>
              </>}
            </FormSection> : null}

            {activeSection === 'schedule' ? <FormSection title="Grade de funcionamento" testID="settings-schedule-section" description="Informe as horas exatas de atendimento para que os horários livres coincidam perfeitamente.">
              <View style={styles.scheduleGrid}>
                {schedule.map((dayItem, idx) => (
                  <View key={dayItem.day} style={styles.scheduleRow}>
                    <Text testID={`settings-schedule-day-${dayItem.day}`} style={styles.scheduleDayName}>{dayItem.name}</Text>
                    <Switch
                      testID={`settings-schedule-switch-${dayItem.day}`}
                      value={dayItem.isOpen}
                      onValueChange={(val) => {
                        const copy = [...schedule];
                        copy[idx].isOpen = val;
                        setSchedule(copy);
                      }}
                      trackColor={{ false: colors.borderStrong, true: colors.accent }}
                      thumbColor={colors.white}
                    />
                    {dayItem.isOpen ? (
                      <View style={styles.scheduleTimes}>
                        <TextInput
                          testID={`settings-schedule-open-${dayItem.day}`}
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
                        <Text style={{ color: colors.textMuted, fontSize: 11 }}>às</Text>
                        <TextInput
                          testID={`settings-schedule-close-${dayItem.day}`}
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
            </FormSection> : null}
          </View>

          <View style={styles.previewColumn}>
            <AppCard testID="settings-public-profile-preview" style={styles.previewCard} elevated>
              <View testID="settings-preview-accent" style={[styles.previewAccent, { backgroundColor: primaryColor }]} />
              <Text testID="settings-preview-eyebrow" style={[styles.previewEyebrow, { color: primaryColor }]}>PERFIL PÚBLICO</Text>
              <View style={[styles.previewLogo, { backgroundColor: `${primaryColor}22`, borderColor: `${primaryColor}55` }]}>
                {logoUrl ? <Image source={{ uri: logoUrl }} style={styles.previewLogoImage} /> : <Store color={primaryColor} size={26} />}
              </View>
              <Text testID="settings-preview-name" style={styles.previewName}>{name || 'Sua barbearia'}</Text>
              {!!slogan && <Text testID="settings-preview-slogan" style={{ color: primaryColor, fontFamily: typography.bodyStrong, fontSize: 11, marginTop: 4, textAlign: 'center' }}>“{slogan}”</Text>}
              <Text testID="settings-preview-address" style={styles.previewMeta}>{address || 'Adicione seu endereço'}</Text>
              <Text testID="settings-preview-phone" style={styles.previewMeta}>{phone || 'Adicione seu telefone'}</Text>
              <View style={[styles.linkBox, { backgroundColor: `${primaryColor}14` }]}>
                <Link2 color={primaryColor} size={15} />
                <Text testID="settings-public-link" numberOfLines={1} style={[styles.linkText, { color: primaryColor }]}>cutsync.com/salon/{slug || 'sua-barbearia'}</Text>
                <Pressable testID="settings-copy-public-link-button" onPress={copyPublicLink} style={({ pressed }) => [styles.copyButton, { backgroundColor: primaryColor }, pressed && styles.pressed]}><Copy color={colors.white} size={14} /></Pressable>
              </View>
              <AppInput label="Endereço digital" testID="settings-slug-input" icon={<ExternalLink color={colors.textMuted} size={17} />} value={slug} onChangeText={setSlug} autoCapitalize="none" hint="Use letras, números e hífens." />
            </AppCard>
          </View>
        </View>
        </ScrollView>
        <StickyActionBar
          actions={<>
            <AppButton disabled={!isDirty || saving} label="Descartar" onPress={discardChanges} testID="settings-discard-button" variant="secondary" />
            <AppButton disabled={!isDirty || Boolean(formError)} icon={<Save color={colors.white} size={17} />} label="Salvar" loading={saving} onPress={saveSettings} testID="settings-save-button" variant="admin" />
          </>}
          message={isDirty ? 'Alterações não salvas' : 'Configurações atualizadas'}
          testID="settings-sticky-actions"
        />
      </View>
    </AdminShell>
  );
};

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
  screen: { flex: 1, minHeight: 0 },
  screenHeader: { gap: 12, paddingHorizontal: 24, paddingTop: 28 },
  settingsViewport: { flex: 1 },
  settingsScroll: { padding: 24, paddingBottom: 48 },
  sectionNavigation: { gap: 8, paddingBottom: 4 },
  sectionNavigationItem: { alignItems: 'center', borderColor: colors.borderSubtle, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 8, minHeight: 44, paddingHorizontal: 14 },
  sectionNavigationItemSelected: { backgroundColor: colors.brandSecondarySoft, borderColor: colors.brandSecondary },
  sectionNavigationLabel: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12 },
  sectionNavigationLabelSelected: { color: colors.brandPrimary, fontFamily: typography.bodyStrong },
  workspace: { gap: 18, marginTop: 18 },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start' },
  formColumn: { flex: 1.35, gap: 14 },
  previewColumn: { flex: 0.75, minWidth: 300, gap: 12, ...Platform.select({ web: { position: 'sticky', top: 16 } as any, default: {} }) },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logoPreview: { width: 78, height: 78, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoImage: { width: '100%', height: '100%' },
  logoCopy: { flex: 1 },
  logoTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12 },
  logoHint: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, marginTop: 4, marginBottom: 10 },
  compactButton: { alignSelf: 'flex-start', minHeight: 38, paddingVertical: 7 },
  fieldsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  flexField: { flex: 1, minWidth: 210 },
  colorField: { width: 190 },
  colorFieldContainer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  colorSwatch: { width: 40, height: 40, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, marginBottom: 5 },
  previewCard: { position: 'relative', alignItems: 'center', padding: 24, overflow: 'hidden' },
  previewAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  previewEyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 1.4, alignSelf: 'flex-start' },
  previewLogo: { width: 74, height: 74, borderRadius: radii.xl, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 28, overflow: 'hidden' },
  previewLogoImage: { width: '100%', height: '100%' },
  previewName: { color: colors.text, fontFamily: typography.display, fontSize: 21, letterSpacing: -0.7, marginTop: 15, textAlign: 'center' },
  previewMeta: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12, marginTop: 5, textAlign: 'center' },
  linkBox: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radii.md, padding: 9, marginTop: 22, marginBottom: 16 },
  linkText: { flex: 1, fontFamily: typography.bodyStrong, fontSize: 11 },
  copyButton: { width: 30, height: 30, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6, transform: [{ scale: 0.97 }] },
  scheduleGrid: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingHorizontal: 18, paddingVertical: 8 },
  scheduleRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  scheduleDayName: { flex: 1, color: colors.text, fontFamily: typography.body, fontSize: 12 },
  scheduleTimes: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 16 },
  timeInput: { width: 56, height: 34, textAlign: 'center', color: colors.text, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, fontSize: 11, paddingHorizontal: 4 },
  closedText: { color: colors.textMuted, fontSize: 11, fontFamily: typography.body, minWidth: 120, textAlign: 'right' },
  compactUploadButton: { minHeight: 32, paddingVertical: 5, paddingHorizontal: 12, alignSelf: 'flex-start', marginTop: 4 },
  uploadButton: { minHeight: 38, paddingVertical: 8, paddingHorizontal: 16, alignSelf: 'flex-start' },
  fieldLabel: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
  emptyGalleryText: { color: colors.textMuted, fontSize: 11, fontStyle: 'italic', marginVertical: 4 },
  galleryPreviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 8 },
  galleryItemContainer: { width: 80, height: 100, borderRadius: radii.md, overflow: 'hidden', position: 'relative' },
  securityRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 14 },
  securityIcon: { width: 42, height: 42, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.infoSoft },
  securityCopy: { flex: 1, minWidth: 210 },
  securityTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13 },
  securityDescription: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12, lineHeight: 17, marginTop: 3 },
  galleryItemImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  galleryItemRemove: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }
});
