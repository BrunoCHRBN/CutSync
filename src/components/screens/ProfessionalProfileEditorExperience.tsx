import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { ExternalLink, ImagePlus, Save, ShieldCheck, Trash2 } from 'lucide-react-native';
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

export const ProfessionalProfileEditorExperience = () => {
  const { profile, signOut } = useAuth();
  const router = useRouter();
  const [slug, setSlug] = useState('');
  const [bio, setBio] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [instagramUrl, setInstagramUrl] = useState('');
  const [gallery, setGallery] = useState<ProfessionalGalleryItem[]>([]);
  const [galleryUrl, setGalleryUrl] = useState('');
  const [galleryAlt, setGalleryAlt] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase.rpc('get_my_professional_profile').maybeSingle();
      if (!error && data) {
        const row = data as any;
        setSlug(row.slug || ''); setBio(row.bio || '');
        setPortfolioUrl(row.portfolio_url || ''); setInstagramUrl(row.instagram_url || '');
        setGallery(Array.isArray(row.gallery_urls) ? row.gallery_urls : []);
        setIsPublic(Boolean(row.is_public));
      }
      setLoading(false);
    };
    void load();
  }, []);

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

  const save = async () => {
    setSaving(true); setNotice(null);
    const { data, error } = await supabase.rpc('upsert_my_professional_profile', {
      requested_slug: slug,
      requested_bio: bio,
      requested_portfolio_url: portfolioUrl,
      requested_instagram_url: instagramUrl,
      requested_gallery_urls: gallery,
      requested_is_public: isPublic,
    });
    setSaving(false);
    if (error) setNotice({ tone: 'danger', message: error.message.includes('duplicate') ? 'Este endereço público já está em uso.' : 'Não foi possível salvar o perfil.' });
    else {
      const savedSlug = data?.[0]?.profile_slug || slug;
      setSlug(savedSlug);
      setNotice({ tone: 'success', message: isPublic ? 'Perfil publicado com segurança.' : 'Rascunho salvo. Apenas você pode vê-lo.' });
    }
  };

  if (loading) return <View testID="professional-profile-editor-loading" style={styles.loading}><ActivityIndicator color={colors.brand} /></View>;

  return (
    <ProfessionalShell testID="professional-profile-editor-screen" name={profile?.name} onSignOut={signOut} activeRoute="profile">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SectionHeading testID="professional-profile-editor-heading" eyebrow="Presença profissional" title="Seu perfil portátil" description="Publique trabalhos e links escolhidos por você. E-mail, telefone e horários nunca aparecem aqui." />
        {!!notice && <InlineNotice testID="professional-profile-editor-notice" tone={notice.tone} message={notice.message} />}
        <View style={styles.grid}>
          <AppCard testID="professional-profile-editor-details" style={styles.card} elevated>
            <AppInput testID="professional-profile-slug-input" label="Endereço público" value={slug} onChangeText={setSlug} autoCapitalize="none" placeholder="joao-barber" hint="Use letras minúsculas, números e hífens." />
            <AppInput testID="professional-profile-bio-input" label="Bio" value={bio} onChangeText={setBio} multiline maxLength={1000} placeholder="Conte sua trajetória e estilo de trabalho." style={styles.multiline} />
            <AppInput testID="professional-profile-portfolio-input" label="Portfólio externo (HTTPS)" value={portfolioUrl} onChangeText={setPortfolioUrl} autoCapitalize="none" placeholder="https://meuportfolio.com" />
            <AppInput testID="professional-profile-instagram-input" label="Instagram (URL completa HTTPS)" value={instagramUrl} onChangeText={setInstagramUrl} autoCapitalize="none" placeholder="https://instagram.com/seuperfil" />
            <View testID="professional-profile-visibility-control" style={styles.visibilityRow}>
              <View style={styles.visibilityCopy}><Text style={styles.visibilityTitle}>Perfil público</Text><Text style={styles.visibilityText}>Você pode ocultar o perfil sem apagar seus trabalhos.</Text></View>
              <Switch testID="professional-profile-public-switch" value={isPublic} onValueChange={setIsPublic} trackColor={{ false: colors.borderStrong, true: colors.success }} />
            </View>
            <AppButton testID="professional-profile-save-button" label="Salvar perfil" onPress={save} loading={saving} icon={<Save color={colors.ink} size={16} />} fullWidth />
            {isPublic && !!slug && <AppButton testID="professional-profile-preview-button" label="Ver perfil publicado" onPress={() => router.push(`/profile/${slug}` as never)} variant="secondary" icon={<ExternalLink color={colors.text} size={16} />} fullWidth />}
          </AppCard>

          <AppCard testID="professional-profile-gallery-editor" style={styles.card}>
            <View style={styles.cardHeading}><ImagePlus color={colors.text} size={20} /><Text style={styles.cardTitle}>Galeria de trabalhos</Text></View>
            <Text style={styles.cardDescription}>Cada imagem exige uma descrição curta para acessibilidade.</Text>
            <AppInput testID="professional-profile-gallery-url-input" label="URL da imagem (HTTPS)" value={galleryUrl} onChangeText={setGalleryUrl} autoCapitalize="none" placeholder="https://..." />
            <AppInput testID="professional-profile-gallery-alt-input" label="Descrição da imagem" value={galleryAlt} onChangeText={setGalleryAlt} maxLength={160} placeholder="Degradê baixo com acabamento natural" />
            <AppButton testID="professional-profile-add-gallery-button" label="Adicionar trabalho" onPress={addGalleryItem} variant="secondary" icon={<ImagePlus color={colors.text} size={16} />} fullWidth />
            <View style={styles.galleryList}>{gallery.map((item, index) => <View key={`${item.url}-${index}`} testID={`professional-profile-gallery-item-${index}`} style={styles.galleryRow}><View style={styles.galleryCopy}><Text numberOfLines={1} style={styles.galleryUrl}>{item.url}</Text><Text style={styles.galleryAlt}>{item.alt}</Text></View><Pressable testID={`professional-profile-remove-gallery-${index}`} onPress={() => setGallery((current) => current.filter((_, itemIndex) => itemIndex !== index))} style={styles.removeButton}><Trash2 color={colors.danger} size={16} /></Pressable></View>)}</View>
            <View style={styles.privacyNote}><ShieldCheck color={colors.success} size={17} /><Text style={styles.privacyText}>Sua conta e seus vínculos nunca são publicados junto ao portfólio.</Text></View>
          </AppCard>
        </View>
      </ScrollView>
    </ProfessionalShell>
  );
};

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 24, paddingBottom: 64, gap: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start' },
  card: { flex: 1, minWidth: 300, gap: 16 },
  multiline: { minHeight: 110, textAlignVertical: 'top', paddingTop: 14 },
  visibilityRow: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderRadius: radii.md, backgroundColor: colors.canvasSoft, borderWidth: 1, borderColor: colors.border },
  visibilityCopy: { flex: 1 }, visibilityTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13 }, visibilityText: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 11, lineHeight: 16, marginTop: 4 },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, cardTitle: { color: colors.text, fontFamily: typography.display, fontSize: 19 }, cardDescription: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, lineHeight: 18 },
  galleryList: { gap: 8 }, galleryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radii.md, backgroundColor: colors.canvasSoft, borderWidth: 1, borderColor: colors.border }, galleryCopy: { flex: 1 }, galleryUrl: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11 }, galleryAlt: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 11, marginTop: 3 }, removeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.dangerSoft },
  privacyNote: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingTop: 4 }, privacyText: { flex: 1, color: colors.textSecondary, fontFamily: typography.body, fontSize: 11, lineHeight: 16 },
});
