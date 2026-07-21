import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { ExternalLink, ImagePlus, Save, ShieldCheck, Trash2, UserRound, Scissors, WalletCards, CheckSquare, Square } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabase';
import { ProfessionalGalleryItem } from '../../types/database';
import { ProfessionalShell } from '../layout/ProfessionalShell';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { InlineNotice } from '../ui/InlineNotice';
import { SectionHeading } from '../ui/SectionHeading';
import { colors, layout, radii, typography } from '../../theme/tokens';
import { StickyActionBar } from '../ui/sticky-action-bar';

export const ProfessionalProfileEditorExperience = () => {
  const { profile, refreshProfile, signOut } = useAuth();
  const router = useRouter();
  
  // Public Profile Fields (RPC)
  const [slug, setSlug] = useState('');
  const [bio, setBio] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [instagramUrl, setInstagramUrl] = useState('');
  const [gallery, setGallery] = useState<ProfessionalGalleryItem[]>([]);
  const [galleryUrl, setGalleryUrl] = useState('');
  const [galleryAlt, setGalleryAlt] = useState('');
  const [isPublic, setIsPublic] = useState(false);

  // Professional Core Fields (profiles table)
  const [titulo, setTitulo] = useState('');
  const [specialties, setSpecialties] = useState('');
  const [pixType, setPixType] = useState<'CPF' | 'Celular' | 'E-mail' | 'Chave Aleatória'>('CPF');
  const [pixKey, setPixKey] = useState('');
  const [notificationChannels, setNotificationChannels] = useState<string[]>(['push', 'whatsapp']);
  const [professionalPixAllowed, setProfessionalPixAllowed] = useState(true);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);

  // Mask & formatting helpers
  const formatCpf = (val: string) => {
    const clean = val.replace(/<[^>]*>/g, '').replace(/\D/g, ''); // Rejects HTML/XML tags and non-digits
    if (clean.length <= 3) return clean;
    if (clean.length <= 6) return `${clean.slice(0, 3)}.${clean.slice(3)}`;
    if (clean.length <= 9) return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6)}`;
    return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9, 11)}`;
  };

  const formatPhoneWithDdi = (val: string) => {
    if (val.length < 3) return '';
    const clean = val.replace(/<[^>]*>/g, '').replace(/\D/g, ''); // Rejects HTML/XML tags and non-digits
    if (clean.length === 0) return '';
    
    let digits = clean;
    if (clean.length > 0 && !clean.startsWith('55')) {
      if (clean === '5') {
        digits = '55';
      } else {
        digits = '55' + clean;
      }
    }
    
    if (digits.length <= 2) return '+55';
    if (digits.length <= 4) return `+55 (${digits.slice(2)}`;
    if (digits.length <= 8) return `+55 (${digits.slice(2, 4)}) ${digits.slice(4)}`;
    if (digits.length <= 12) return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9, 13)}`;
  };

  const cleanPixInput = (val: string) => {
    if (pixType === 'CPF') {
      return formatCpf(val);
    }
    if (pixType === 'Celular') {
      return formatPhoneWithDdi(val);
    }
    return val;
  };

  useEffect(() => {
    const load = async () => {
      // 1. Fetch public profile via RPC
      const { data, error } = await supabase.rpc('get_my_professional_profile').maybeSingle();
      if (!error && data) {
        const row = data as any;
        setSlug(row.slug || ''); 
        setBio(row.bio || '');
        setPortfolioUrl(row.portfolio_url || ''); 
        setInstagramUrl(row.instagram_url || '');
        setGallery(Array.isArray(row.gallery_urls) ? row.gallery_urls : []);
        setIsPublic(Boolean(row.is_public));
      }

      // 2. Fetch profiles table columns
      if (profile?.id) {
        const { data: profData } = await supabase.from('profiles')
          .select('titulo_profissional, specialties, pix_key, notification_channels')
          .eq('id', profile.id)
          .single();
        if (profData) {
          setTitulo(profData.titulo_profissional || '');
          setSpecialties(profData.specialties || '');
          setPixKey(profData.pix_key || '');
          if (profData.notification_channels) {
            setNotificationChannels(profData.notification_channels);
          }
          // Detect Pix type
          const cleanVal = profData.pix_key || '';
          if (cleanVal.includes('@')) {
            setPixType('E-mail');
          } else if (cleanVal.startsWith('+55') || cleanVal.startsWith('55')) {
            setPixType('Celular');
          } else if (cleanVal.replace(/\D/g, '').length === 11) {
            setPixType('CPF');
          } else {
            setPixType('Chave Aleatória');
          }
        }
      }

      // 3. Fetch establishment setting
      if (profile?.establishment_id) {
        const { data: estData } = await supabase.from('establishments')
          .select('professional_pix_allowed')
          .eq('id', profile.establishment_id)
          .single();
        if (estData) {
          setProfessionalPixAllowed(estData.professional_pix_allowed !== false);
        }
      }
      setLoading(false);
    };
    void load();
  }, [profile?.id, profile?.establishment_id]);

  const addGalleryItem = () => {
    if (!/^https:\/\//i.test(galleryUrl.trim()) || galleryAlt.trim().length < 3) {
      setNotice({ tone: 'danger', message: 'Informe uma URL HTTPS e uma descrição acessível da imagem.' });
      return;
    }
    if (gallery.length >= 12) {
      setNotice({ tone: 'danger', message: 'A galeria aceita no máximo 12 trabalhos.' });
      return;
    }
    setGallery((current) => [...current, { url: galleryUrl.trim(), alt: galleryAlt.trim() }]);
    setGalleryUrl(''); setGalleryAlt(''); setNotice(null);
  };

  const toggleNotificationChannel = (channel: string) => {
    if (notificationChannels.includes(channel)) {
      setNotificationChannels(notificationChannels.filter(c => c !== channel));
    } else {
      setNotificationChannels([...notificationChannels, channel]);
    }
  };

  const save = async () => {
    setSaving(true); setNotice(null);

    // Validate inputs
    if (!titulo.trim() || !specialties.trim()) {
      setNotice({ tone: 'danger', message: 'Título profissional e especialidades são obrigatórios.' });
      setSaving(false);
      return;
    }

    try {
      // 1. Update public profile via RPC
      const { data, error: rpcError } = await supabase.rpc('upsert_my_professional_profile', {
        requested_slug: slug,
        requested_bio: bio,
        requested_portfolio_url: portfolioUrl,
        requested_instagram_url: instagramUrl,
        requested_gallery_urls: gallery,
        requested_is_public: isPublic,
      });

      if (rpcError) throw rpcError;

      // 2. Update profiles table columns
      const { error: profileError } = await supabase.from('profiles')
        .update({
          titulo_profissional: titulo.trim(),
          specialties: specialties.trim(),
          pix_key: professionalPixAllowed ? pixKey.trim() : null,
          notification_channels: notificationChannels
        })
        .eq('id', profile?.id || '');

      if (profileError) throw profileError;

      const savedSlug = data?.[0]?.profile_slug || slug;
      setSlug(savedSlug);
      await refreshProfile();
      setNotice({ tone: 'success', message: 'Configurações de perfil e notificações salvas.' });
    } catch (err: any) {
      setNotice({ tone: 'danger', message: err.message || 'Falha ao salvar as alterações.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <View testID="professional-profile-editor-loading" style={styles.loading}><ActivityIndicator color={colors.brand} /></View>;

  return (
    <ProfessionalShell testID="professional-profile-editor-screen" name={profile?.name} onSignOut={signOut} activeRoute="profile">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SectionHeading testID="professional-profile-editor-heading" eyebrow="Configurações e Presença" title="Seu perfil de trabalho" description="Gerencie seus dados profissionais, portfólio de fotos, chave Pix de comissões e alertas." />
        {!!notice && <InlineNotice testID="professional-profile-editor-notice" tone={notice.tone} message={notice.message} />}
        
        <View style={styles.grid}>
          <AppCard testID="professional-profile-editor-details" style={styles.card} elevated>
            <Text style={styles.cardTitle}>Dados Profissionais</Text>
            
            <AppInput 
              testID="professional-profile-titulo-input" 
              label="Título Profissional" 
              value={titulo} 
              onChangeText={setTitulo} 
              placeholder="Ex: Barbeiro Master" 
              icon={<UserRound color={colors.textMuted} size={17} />}
            />

            <AppInput 
              testID="professional-profile-specialties-input" 
              label="Especialidades" 
              value={specialties} 
              onChangeText={setSpecialties} 
              placeholder="Ex: Degradê, Barba de Toalha Quente" 
              icon={<Scissors color={colors.textMuted} size={17} />}
            />

            <AppInput testID="professional-profile-slug-input" label="Endereço público (Slug)" value={slug} onChangeText={setSlug} autoCapitalize="none" placeholder="joao-barber" hint="Use letras minúsculas, números e hífens." />
            <AppInput testID="professional-profile-bio-input" label="Minibiografia" value={bio} onChangeText={setBio} multiline maxLength={1000} placeholder="Conte sua trajetória e estilo de trabalho." style={styles.multiline} />
            <AppInput testID="professional-profile-portfolio-input" label="Portfólio externo (HTTPS)" value={portfolioUrl} onChangeText={setPortfolioUrl} autoCapitalize="none" placeholder="https://meuportfolio.com" />
            <AppInput testID="professional-profile-instagram-input" label="Instagram (URL completa HTTPS)" value={instagramUrl} onChangeText={setInstagramUrl} autoCapitalize="none" placeholder="https://instagram.com/seuperfil" />
            
            <View testID="professional-profile-visibility-control" style={styles.visibilityRow}>
              <View style={styles.visibilityCopy}><Text style={styles.visibilityTitle}>Perfil público</Text><Text style={styles.visibilityText}>Você pode ocultar o perfil sem apagar seus trabalhos.</Text></View>
              <Switch testID="professional-profile-public-switch" value={isPublic} onValueChange={setIsPublic} trackColor={{ false: colors.borderStrong, true: colors.success }} />
            </View>
          </AppCard>

          <View style={styles.rightColumn}>
            {professionalPixAllowed ? (
              <AppCard style={styles.card} elevated>
                <Text style={styles.cardTitle}>Repasse de Comissões (Pix)</Text>
                <Text style={styles.cardDescription}>Chave utilizada pelo administrador para depósito automático das comissões.</Text>

                <View style={styles.pixSelector}>
                  {['CPF', 'Celular', 'E-mail', 'Chave Aleatória'].map((type: any) => (
                    <Pressable 
                      key={type} 
                      onPress={() => { setPixType(type); setPixKey(''); }} 
                      style={[styles.pixTypeButton, pixType === type && styles.pixTypeButtonActive]}
                    >
                      <Text style={[styles.pixTypeLabel, pixType === type && styles.pixTypeLabelActive]}>{type}</Text>
                    </Pressable>
                  ))}
                </View>

                <AppInput 
                  label={`Chave Pix (${pixType})`} 
                  value={pixKey} 
                  onChangeText={(val) => setPixKey(cleanPixInput(val))} 
                  placeholder={pixType === 'CPF' ? '000.000.000-00' : pixType === 'Celular' ? '+55 (11) 99999-9999' : 'Insira sua chave'} 
                  icon={<WalletCards color={colors.textMuted} size={17} />}
                  autoCapitalize="none"
                />
              </AppCard>
            ) : null}

            <AppCard style={[styles.card, { marginTop: 18 }]} elevated>
              <Text style={styles.cardTitle}>Alertas & Notificações</Text>
              <Text style={styles.cardDescription}>Escolha como deseja ser alertado sobre novos agendamentos.</Text>

              <View style={styles.checkboxList}>
                <Pressable onPress={() => toggleNotificationChannel('push')} style={styles.checkboxRow}>
                  {notificationChannels.includes('push') ? <CheckSquare size={18} color={colors.brand} /> : <Square size={18} color={colors.textMuted} />}
                  <Text style={styles.checkboxLabel}>Notificações no celular (Push)</Text>
                </Pressable>

                <Pressable onPress={() => toggleNotificationChannel('whatsapp')} style={styles.checkboxRow}>
                  {notificationChannels.includes('whatsapp') ? <CheckSquare size={18} color={colors.brand} /> : <Square size={18} color={colors.textMuted} />}
                  <Text style={styles.checkboxLabel}>Lembretes via WhatsApp</Text>
                </Pressable>

                <Pressable onPress={() => toggleNotificationChannel('email')} style={styles.checkboxRow}>
                  {notificationChannels.includes('email') ? <CheckSquare size={18} color={colors.brand} /> : <Square size={18} color={colors.textMuted} />}
                  <Text style={styles.checkboxLabel}>Lembretes via E-mail</Text>
                </Pressable>
              </View>
            </AppCard>

            <AppCard testID="professional-profile-gallery-editor" style={[styles.card, { marginTop: 18 }]}>
              <View style={styles.cardHeading}><ImagePlus color={colors.text} size={20} /><Text style={styles.cardTitle}>Galeria de trabalhos</Text></View>
              <Text style={styles.cardDescription}>Cada imagem exige uma descrição curta para acessibilidade.</Text>
              <AppInput testID="professional-profile-gallery-url-input" label="URL da imagem (HTTPS)" value={galleryUrl} onChangeText={setGalleryUrl} autoCapitalize="none" placeholder="https://..." />
              <AppInput testID="professional-profile-gallery-alt-input" label="Descrição da imagem" value={galleryAlt} onChangeText={setGalleryAlt} maxLength={160} placeholder="Degradê baixo com acabamento natural" />
              <AppButton testID="professional-profile-add-gallery-button" label="Adicionar trabalho" onPress={addGalleryItem} variant="secondary" icon={<ImagePlus color={colors.text} size={16} />} fullWidth />
              <View style={styles.galleryList}>{gallery.map((item, index) => <View key={`${item.url}-${index}`} testID={`professional-profile-gallery-item-${index}`} style={styles.galleryRow}><View style={styles.galleryCopy}><Text numberOfLines={1} style={styles.galleryUrl}>{item.url}</Text><Text style={styles.galleryAlt}>{item.alt}</Text></View><Pressable testID={`professional-profile-remove-gallery-${index}`} onPress={() => setGallery((current) => current.filter((_, itemIndex) => itemIndex !== index))} style={styles.removeButton}><Trash2 color={colors.danger} size={16} /></Pressable></View>)}</View>
              <View style={styles.privacyNote}><ShieldCheck color={colors.success} size={17} /><Text style={styles.privacyText}>Sua conta e seus vínculos nunca são publicados junto ao portfólio.</Text></View>
            </AppCard>
          </View>
        </View>

        <StickyActionBar
          testID="professional-profile-editor-sticky-bar"
          actions={<>
            <AppButton testID="professional-profile-save-button" label="Salvar todas as alterações" onPress={save} loading={saving} icon={<Save color={colors.ink} size={16} />} />
            {isPublic && !!slug && <AppButton testID="professional-profile-preview-button" label="Ver vitrine pública" onPress={() => router.push(`/profile/${slug}` as never)} variant="secondary" icon={<ExternalLink color={colors.text} size={16} />} />}
          </>}
        />

      </ScrollView>
    </ProfessionalShell>
  );
};

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 24, paddingBottom: 120, gap: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start', width: '100%' },
  card: { padding: 24, gap: 16, width: '100%' },
  multiline: { minHeight: 110, textAlignVertical: 'top', paddingTop: 14 },
  visibilityRow: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderRadius: radii.md, backgroundColor: colors.canvasSoft, borderWidth: 1, borderColor: colors.border },
  visibilityCopy: { flex: 1 }, visibilityTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13 }, visibilityText: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 11, lineHeight: 16, marginTop: 4 },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, 
  cardTitle: { color: colors.text, fontFamily: typography.display, fontSize: 18 }, 
  cardDescription: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, lineHeight: 18 },
  galleryList: { gap: 8 }, galleryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radii.md, backgroundColor: colors.canvasSoft, borderWidth: 1, borderColor: colors.border }, galleryCopy: { flex: 1 }, galleryUrl: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11 }, galleryAlt: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 11, marginTop: 3 }, removeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.dangerSoft },
  privacyNote: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingTop: 4 }, privacyText: { flex: 1, color: colors.textSecondary, fontFamily: typography.body, fontSize: 11, lineHeight: 16 },
  rightColumn: { flex: 1, minWidth: 300 },
  actionRow: { flexDirection: 'row', gap: 12, width: '100%', justifyContent: 'flex-end', paddingHorizontal: 24 },
  pixSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  pixTypeButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.sm, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border },
  pixTypeButtonActive: { backgroundColor: colors.surface, borderColor: colors.text },
  pixTypeLabel: { fontSize: 11, color: colors.textSecondary, fontFamily: typography.body },
  pixTypeLabelActive: { color: colors.text, fontFamily: typography.bodyStrong },
  checkboxList: { gap: 14, marginVertical: 8 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  checkboxLabel: { color: colors.text, fontFamily: typography.body, fontSize: 13 },
});
