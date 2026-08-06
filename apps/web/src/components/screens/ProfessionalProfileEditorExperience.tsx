import React, { useEffect, useState, useMemo } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Eye, ExternalLink, ImagePlus, Save, ShieldCheck, Trash2, UserRound, Scissors, WalletCards, CheckSquare, Square, UploadCloud, Clock3 } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabase';
import { ProfessionalGalleryItem, PublicTeamMember } from '@cutsync/database';
import { ProfessionalShell } from '../layout/ProfessionalShell';
import { ProfessionalProfileSheet } from '../professional/ProfessionalProfileSheet';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { InlineNotice } from '../ui/InlineNotice';
import { SectionHeading } from '../ui/SectionHeading';
import { SegmentedControl } from '../ui/SegmentedControl';
import { colors, layout, radii, typography } from '../../theme/tokens';
import { useToast } from '../ui/toast-provider';

type ProfileSection = 'dados' | 'vitrine' | 'financeiro' | 'notificacoes';

type WorkShiftDraft = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
};

const DAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const defaultShifts = (): WorkShiftDraft[] =>
  DAY_LABELS.map((_, index) => ({
    day_of_week: index,
    start_time: '09:00',
    end_time: '18:00',
    is_active: index !== 0,
  }));

export const ProfessionalProfileEditorExperience = () => {
  const { profile, refreshProfile, signOut } = useAuth();
  const router = useRouter();
  const { pushToast } = useToast();
  const [section, setSection] = useState<ProfileSection>('dados');

  const [slug, setSlug] = useState('');
  const [bio, setBio] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [instagramUrl, setInstagramUrl] = useState('');
  const [gallery, setGallery] = useState<ProfessionalGalleryItem[]>([]);
  const [galleryUrl, setGalleryUrl] = useState('');
  const [galleryAlt, setGalleryAlt] = useState('Trabalho profissional');
  const [isPublic, setIsPublic] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [specialties, setSpecialties] = useState('');
  const [pixType, setPixType] = useState<'CPF' | 'Celular' | 'E-mail' | 'Chave Aleatória'>('CPF');
  const [pixKey, setPixKey] = useState('');
  const [notificationChannels, setNotificationChannels] = useState<string[]>(['push', 'whatsapp']);
  const [professionalPixAllowed, setProfessionalPixAllowed] = useState(true);
  const [shifts, setShifts] = useState<WorkShiftDraft[]>(defaultShifts);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);

  const previewMember = useMemo<PublicTeamMember | null>(() => {
    if (!profile?.id) return null;
    return {
      id: profile.id,
      name: profile.name || 'Profissional',
      avatarUrl: profile.avatar_url || null,
      profileSlug: slug || null,
      specialties: specialties || null,
      tituloProfissional: titulo || null,
    };
  }, [profile?.id, profile?.name, profile?.avatar_url, slug, specialties, titulo]);

  const formatCpf = (val: string) => {
    const clean = val.replace(/<[^>]*>/g, '').replace(/\D/g, '');
    if (clean.length <= 3) return clean;
    if (clean.length <= 6) return `${clean.slice(0, 3)}.${clean.slice(3)}`;
    if (clean.length <= 9) return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6)}`;
    return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9, 11)}`;
  };

  const formatPhoneWithDdi = (val: string) => {
    const clean = val.replace(/<[^>]*>/g, '').replace(/\D/g, '');
    if (clean.length === 0) return '';
    let digits = clean;
    if (clean.length > 0 && !clean.startsWith('55')) {
      digits = clean === '5' ? '55' : `55${clean}`;
    }
    if (digits.length <= 2) return '+55';
    if (digits.length <= 4) return `+55 (${digits.slice(2)}`;
    if (digits.length <= 8) return `+55 (${digits.slice(2, 4)}) ${digits.slice(4)}`;
    if (digits.length <= 12) return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9, 13)}`;
  };

  const cleanPixInput = (val: string) => {
    if (pixType === 'CPF') return formatCpf(val);
    if (pixType === 'Celular') return formatPhoneWithDdi(val);
    return val;
  };

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.rpc('get_my_professional_profile').maybeSingle();
      if (data) {
        const row = data as any;
        setSlug(row.slug || '');
        setBio(row.bio || '');
        setPortfolioUrl(row.portfolio_url || '');
        setInstagramUrl(row.instagram_url || '');
        setGallery(Array.isArray(row.gallery_urls) ? row.gallery_urls : []);
        setIsPublic(Boolean(row.is_public));
      }

      if (profile?.id) {
        const { data: profData } = await supabase.from('profiles')
          .select('titulo_profissional, specialties, pix_key, notification_channels')
          .eq('id', profile.id)
          .single();
        if (profData) {
          setTitulo(profData.titulo_profissional || '');
          setSpecialties(profData.specialties || '');
          setPixKey(profData.pix_key || '');
          if (profData.notification_channels) setNotificationChannels(profData.notification_channels);
          const cleanVal = profData.pix_key || '';
          if (cleanVal.includes('@')) setPixType('E-mail');
          else if (cleanVal.startsWith('+55') || cleanVal.startsWith('55')) setPixType('Celular');
          else if (cleanVal.replace(/\D/g, '').length === 11) setPixType('CPF');
          else setPixType('Chave Aleatória');
        }

        const { data: shiftRows } = await supabase
          .from('work_shifts')
          .select('day_of_week, start_time, end_time, is_active')
          .eq('profile_id', profile.id);
        if (shiftRows?.length) {
          const mapped = defaultShifts().map((fallback) => {
            const row = shiftRows.find((item) => item.day_of_week === fallback.day_of_week);
            if (!row) return fallback;
            return {
              day_of_week: row.day_of_week,
              start_time: String(row.start_time).slice(0, 5),
              end_time: String(row.end_time).slice(0, 5),
              is_active: Boolean(row.is_active),
            };
          });
          setShifts(mapped);
        }
      }

      if (profile?.establishment_id) {
        const { data: estData } = await supabase.from('establishments')
          .select('professional_pix_allowed')
          .eq('id', profile.establishment_id)
          .single();
        if (estData) setProfessionalPixAllowed(estData.professional_pix_allowed !== false);
      }
      setLoading(false);
    };
    void load();
  }, [profile?.id, profile?.establishment_id]);

  const handlePickDeviceImage = () => {
    if (typeof window === 'undefined' || Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e: any) => {
      const file = e.target?.files?.[0];
      if (!file || !profile?.id) return;
      setUploadingImage(true);
      setUploadError(null);
      try {
        const fileExt = file.name.split('.').pop() || 'png';
        const filePath = `${profile.id}/${Date.now()}.${fileExt}`;
        const { error: uploadErrorResult } = await supabase.storage
          .from('professional-gallery')
          .upload(filePath, file, { upsert: true });
        if (uploadErrorResult) {
          setUploadError(uploadErrorResult.message || 'Falha no upload. Tente novamente.');
          setGalleryUrl('');
          return;
        }
        const { data: publicUrlData } = supabase.storage.from('professional-gallery').getPublicUrl(filePath);
        setGalleryUrl(publicUrlData.publicUrl);
        if (!galleryAlt.trim()) setGalleryAlt('Trabalho profissional');
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Falha no upload.');
      } finally {
        setUploadingImage(false);
      }
    };
    input.click();
  };

  const addGalleryItem = () => {
    const alt = galleryAlt.trim() || 'Trabalho profissional';
    if (!/^https:\/\//i.test(galleryUrl.trim())) {
      setNotice({ tone: 'danger', message: 'Informe uma URL HTTPS válida da imagem.' });
      return;
    }
    if (gallery.length >= 12) {
      setNotice({ tone: 'danger', message: 'A galeria aceita no máximo 12 trabalhos.' });
      return;
    }
    setGallery((current) => [...current, { url: galleryUrl.trim(), alt }]);
    setGalleryUrl('');
    setGalleryAlt('Trabalho profissional');
    setNotice(null);
  };

  const saveDados = async () => {
    if (!titulo.trim() || !specialties.trim()) {
      setNotice({ tone: 'danger', message: 'Título profissional e especialidades são obrigatórios.' });
      return;
    }
    for (const shift of shifts) {
      if (!shift.is_active) continue;
      if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(shift.start_time) || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(shift.end_time)) {
        setNotice({ tone: 'danger', message: 'Use horários HH:MM na jornada.' });
        return;
      }
      if (shift.start_time >= shift.end_time) {
        setNotice({ tone: 'danger', message: `Entrada deve ser antes da saída em ${DAY_LABELS[shift.day_of_week]}.` });
        return;
      }
    }
    setSaving(true);
    setNotice(null);
    try {
      const { error: profileError } = await supabase.from('profiles')
        .update({ titulo_profissional: titulo.trim(), specialties: specialties.trim() })
        .eq('id', profile?.id || '');
      if (profileError) throw profileError;

      if (!profile?.id) throw new Error('Perfil indisponível.');
      const payload = shifts.map((shift) => ({
        profile_id: profile.id,
        day_of_week: shift.day_of_week,
        start_time: `${shift.start_time}:00`,
        end_time: `${shift.end_time}:00`,
        is_active: shift.is_active,
      }));
      const { error: shiftsError } = await supabase.from('work_shifts')
        .upsert(payload, { onConflict: 'profile_id, day_of_week' });
      if (shiftsError) throw shiftsError;

      await refreshProfile();
      pushToast({ tone: 'success', title: 'Dados profissionais salvos' });
      setNotice({ tone: 'success', message: 'Dados e jornada salvos.' });
    } catch (err: any) {
      setNotice({ tone: 'danger', message: err.message || 'Falha ao salvar dados.' });
    } finally {
      setSaving(false);
    }
  };

  const normalizePublicUrl = (val: string, isInstagram = false): string => {
    let trimmed = val.trim();
    if (!trimmed || trimmed === '-' || trimmed === '.' || trimmed.toLowerCase() === 'n/a') return '';
    
    if (isInstagram) {
      if (trimmed.startsWith('@')) {
        trimmed = trimmed.slice(1).trim();
      }
      if (!trimmed) return '';
      if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
        if (trimmed.includes('instagram.com/')) {
          trimmed = `https://${trimmed}`;
        } else {
          trimmed = `https://instagram.com/${trimmed}`;
        }
      }
    } else {
      if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
        trimmed = `https://${trimmed}`;
      }
    }

    if (trimmed.startsWith('http://')) {
      trimmed = `https://${trimmed.slice(7)}`;
    }
    return trimmed;
  };

  const saveVitrine = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const cleanPortfolio = normalizePublicUrl(portfolioUrl, false);
      const cleanInstagram = normalizePublicUrl(instagramUrl, true);

      const { data, error: rpcError } = await supabase.rpc('upsert_my_professional_profile', {
        requested_slug: slug.trim(),
        requested_bio: bio.trim(),
        requested_portfolio_url: cleanPortfolio,
        requested_instagram_url: cleanInstagram,
        requested_gallery_urls: gallery,
        requested_is_public: isPublic,
      });
      if (rpcError) throw rpcError;

      setSlug(data?.[0]?.profile_slug || slug);
      if (cleanPortfolio !== portfolioUrl) setPortfolioUrl(cleanPortfolio);
      if (cleanInstagram !== instagramUrl) setInstagramUrl(cleanInstagram);

      pushToast({ tone: 'success', title: 'Vitrine atualizada' });
      setNotice({ tone: 'success', message: 'Vitrine e galeria salvas.' });
    } catch (err: any) {
      const msg = err.message || '';
      let userMsg = msg;
      if (msg.includes('invalid_public_url')) {
        userMsg = 'Link de portfólio ou Instagram inválido. Insira um link válido iniciado por https:// (ex: https://instagram.com/seu.perfil).';
      } else if (msg.includes('invalid_slug')) {
        userMsg = 'Endereço público (Slug) inválido. Use de 3 a 63 caracteres minúsculos, números e hífens.';
      } else if (msg.includes('bio_too_long')) {
        userMsg = 'A minibiografia excede o limite de 1000 caracteres.';
      }
      setNotice({ tone: 'danger', message: userMsg || 'Falha ao salvar vitrine.' });
    } finally {
      setSaving(false);
    }
  };

  const saveFinanceiro = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const { error } = await supabase.from('profiles')
        .update({ pix_key: professionalPixAllowed ? pixKey.trim() : null })
        .eq('id', profile?.id || '');
      if (error) throw error;
      await refreshProfile();
      pushToast({ tone: 'success', title: 'Pix atualizado' });
      setNotice({ tone: 'success', message: 'Dados financeiros salvos.' });
    } catch (err: any) {
      setNotice({ tone: 'danger', message: err.message || 'Falha ao salvar Pix.' });
    } finally {
      setSaving(false);
    }
  };

  const saveNotificacoes = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const { error } = await supabase.from('profiles')
        .update({ notification_channels: notificationChannels })
        .eq('id', profile?.id || '');
      if (error) throw error;
      await refreshProfile();
      pushToast({ tone: 'success', title: 'Notificações atualizadas' });
      setNotice({ tone: 'success', message: 'Preferências de alerta salvas.' });
    } catch (err: any) {
      setNotice({ tone: 'danger', message: err.message || 'Falha ao salvar notificações.' });
    } finally {
      setSaving(false);
    }
  };

  const saveCurrentSection = () => {
    if (section === 'dados') void saveDados();
    else if (section === 'vitrine') void saveVitrine();
    else if (section === 'financeiro') void saveFinanceiro();
    else void saveNotificacoes();
  };

  if (loading) {
    return (
      <View testID="professional-profile-editor-loading" style={styles.loading}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <ProfessionalShell testID="professional-profile-editor-screen" name={profile?.name} onSignOut={signOut} activeRoute="profile">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SectionHeading
          testID="professional-profile-editor-heading"
          eyebrow="Configurações"
          title="Seu perfil de trabalho"
          description="Salve cada seção de forma independente."
        />
        {!!notice && <InlineNotice testID="professional-profile-editor-notice" tone={notice.tone} message={notice.message} />}

        <SegmentedControl
          onChange={(next) => setSection(next as ProfileSection)}
          options={[
            { label: 'Dados', value: 'dados' },
            { label: 'Vitrine', value: 'vitrine' },
            { label: 'Financeiro', value: 'financeiro' },
            { label: 'Alertas', value: 'notificacoes' },
          ]}
          testID="professional-profile-sections"
          value={section}
        />

        {section === 'dados' ? (
          <AppCard testID="professional-profile-editor-details" style={styles.card} elevated>
            <Text style={styles.cardTitle}>Dados profissionais</Text>
            <AppInput testID="professional-profile-titulo-input" label="Título Profissional" value={titulo} onChangeText={setTitulo} placeholder="Ex: Barbeiro Master" icon={<UserRound color={colors.textMuted} size={17} />} />
            <AppInput testID="professional-profile-specialties-input" label="Especialidades" value={specialties} onChangeText={setSpecialties} placeholder="Ex: Degradê, Barba" icon={<Scissors color={colors.textMuted} size={17} />} />
            <View style={styles.shiftHeader}>
              <Clock3 color={colors.text} size={18} />
              <Text style={styles.cardTitle}>Jornada de trabalho</Text>
            </View>
            {shifts.map((shift) => (
              <View key={shift.day_of_week} style={styles.shiftRow} testID={`professional-shift-${shift.day_of_week}`}>
                <Pressable onPress={() => setShifts((current) => current.map((item) => item.day_of_week === shift.day_of_week ? { ...item, is_active: !item.is_active } : item))} style={styles.shiftDay}>
                  {shift.is_active ? <CheckSquare color={colors.brand} size={16} /> : <Square color={colors.textMuted} size={16} />}
                  <Text style={styles.shiftDayLabel}>{DAY_LABELS[shift.day_of_week]}</Text>
                </Pressable>
                <AppInput
                  editable={shift.is_active}
                  label="Início"
                  onChangeText={(value) => setShifts((current) => current.map((item) => item.day_of_week === shift.day_of_week ? { ...item, start_time: value } : item))}
                  style={styles.shiftInput}
                  testID={`professional-shift-start-${shift.day_of_week}`}
                  value={shift.start_time}
                />
                <AppInput
                  editable={shift.is_active}
                  label="Fim"
                  onChangeText={(value) => setShifts((current) => current.map((item) => item.day_of_week === shift.day_of_week ? { ...item, end_time: value } : item))}
                  style={styles.shiftInput}
                  testID={`professional-shift-end-${shift.day_of_week}`}
                  value={shift.end_time}
                />
              </View>
            ))}
          </AppCard>
        ) : null}

        {section === 'vitrine' ? (
          <AppCard testID="professional-profile-gallery-editor" style={styles.card} elevated>
            <Text style={styles.cardTitle}>Vitrine & Galeria</Text>
            <AppInput testID="professional-profile-slug-input" label="Endereço público (Slug)" value={slug} onChangeText={setSlug} autoCapitalize="none" placeholder="joao-barber" />
            <AppInput testID="professional-profile-bio-input" label="Minibiografia" value={bio} onChangeText={setBio} multiline maxLength={1000} style={styles.multiline} />
            <AppInput testID="professional-profile-portfolio-input" label="Portfólio externo (HTTPS)" value={portfolioUrl} onChangeText={setPortfolioUrl} autoCapitalize="none" />
            <AppInput testID="professional-profile-instagram-input" label="Instagram (HTTPS)" value={instagramUrl} onChangeText={setInstagramUrl} autoCapitalize="none" />
            <View style={styles.visibilityRow}>
              <View style={styles.visibilityCopy}>
                <Text style={styles.visibilityTitle}>Perfil público</Text>
                <Text style={styles.visibilityText}>Você pode ocultar o perfil sem apagar seus trabalhos.</Text>
              </View>
              <Switch testID="professional-profile-public-switch" value={isPublic} onValueChange={setIsPublic} trackColor={{ false: colors.borderStrong, true: colors.success }} />
            </View>
            <AppButton
              testID="professional-profile-pick-image-button"
              label={uploadingImage ? 'Enviando arquivo...' : 'Escolher imagem do dispositivo'}
              onPress={handlePickDeviceImage}
              loading={uploadingImage}
              variant="secondary"
              fullWidth
              icon={<UploadCloud color={colors.text} size={18} />}
            />
            {uploadError ? <InlineNotice tone="danger" message={uploadError} testID="professional-gallery-upload-error" /> : null}
            {galleryUrl ? (
              <View style={styles.previewBox}>
                <Image source={{ uri: galleryUrl }} style={styles.previewThumb} />
                <Text style={styles.previewTitle}>Imagem pronta para adicionar</Text>
              </View>
            ) : (
              <AppInput testID="professional-profile-gallery-url-input" label="Ou informe a URL (HTTPS)" value={galleryUrl} onChangeText={setGalleryUrl} autoCapitalize="none" />
            )}
            <AppInput testID="professional-profile-gallery-alt-input" label="Descrição (editável)" value={galleryAlt} onChangeText={setGalleryAlt} maxLength={160} />
            <AppButton testID="professional-profile-add-gallery-button" label="Adicionar ao portfólio" onPress={addGalleryItem} variant="secondary" icon={<ImagePlus color={colors.text} size={16} />} fullWidth disabled={!galleryUrl} />
            <View style={styles.galleryList}>
              {gallery.map((item, index) => (
                <View key={`${item.url}-${index}`} testID={`professional-profile-gallery-item-${index}`} style={styles.galleryRow}>
                  {item.url.startsWith('http') ? <Image source={{ uri: item.url }} style={styles.galleryThumb} /> : null}
                  <View style={styles.galleryCopy}>
                    <Text numberOfLines={1} style={styles.galleryUrl}>{item.url}</Text>
                    <Text style={styles.galleryAlt}>{item.alt}</Text>
                  </View>
                  <Pressable testID={`professional-profile-remove-gallery-${index}`} onPress={() => setGallery((current) => current.filter((_, itemIndex) => itemIndex !== index))} style={styles.removeButton}>
                    <Trash2 color={colors.danger} size={16} />
                  </Pressable>
                </View>
              ))}
            </View>
            <View style={styles.privacyNote}><ShieldCheck color={colors.success} size={17} /><Text style={styles.privacyText}>Sua conta nunca é publicada junto ao portfólio.</Text></View>
          </AppCard>
        ) : null}

        {section === 'financeiro' ? (
          <AppCard style={styles.card} elevated>
            <Text style={styles.cardTitle}>Financeiro (Pix)</Text>
            {!professionalPixAllowed ? (
              <Text style={styles.cardDescription}>O estabelecimento desativou a coleta de Pix do profissional.</Text>
            ) : (
              <>
                <Text style={styles.cardDescription}>Chave usada para depósito das comissões.</Text>
                <View style={styles.pixSelector}>
                  {(['CPF', 'Celular', 'E-mail', 'Chave Aleatória'] as const).map((type) => (
                    <Pressable key={type} onPress={() => { setPixType(type); setPixKey(''); }} style={[styles.pixTypeButton, pixType === type && styles.pixTypeButtonActive]}>
                      <Text style={[styles.pixTypeLabel, pixType === type && styles.pixTypeLabelActive]}>{type}</Text>
                    </Pressable>
                  ))}
                </View>
                <AppInput label={`Chave Pix (${pixType})`} value={pixKey} onChangeText={(val) => setPixKey(cleanPixInput(val))} icon={<WalletCards color={colors.textMuted} size={17} />} autoCapitalize="none" />
              </>
            )}
          </AppCard>
        ) : null}

        {section === 'notificacoes' ? (
          <AppCard style={styles.card} elevated>
            <Text style={styles.cardTitle}>Notificações</Text>
            <Text style={styles.cardDescription}>Escolha como deseja ser alertado.</Text>
            <View style={styles.checkboxList}>
              {(['push', 'whatsapp', 'email'] as const).map((channel) => (
                <Pressable key={channel} onPress={() => setNotificationChannels((current) => current.includes(channel) ? current.filter((item) => item !== channel) : [...current, channel])} style={styles.checkboxRow}>
                  {notificationChannels.includes(channel) ? <CheckSquare size={18} color={colors.brand} /> : <Square size={18} color={colors.textMuted} />}
                  <Text style={styles.checkboxLabel}>
                    {channel === 'push' ? 'Push no celular' : channel === 'whatsapp' ? 'WhatsApp' : 'E-mail'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </AppCard>
        ) : null}

        <View style={styles.actions}>
          <AppButton testID="professional-profile-save-button" label="Salvar esta seção" onPress={saveCurrentSection} loading={saving} icon={<Save color={colors.ink} size={16} />} />

          {section === 'vitrine' ? (
            <View style={styles.previewActionsContainer}>
              {(!isPublic || !slug) && (
                <InlineNotice
                  testID="professional-profile-preview-unavailable-notice"
                  tone="warning"
                  message={
                    !isPublic
                      ? "Perfil oculto. Ative a chave 'Perfil público' acima para liberar a pré-visualização."
                      : "Slug ausente. Defina um Endereço público (Slug) para liberar a pré-visualização."
                  }
                />
              )}

              <View style={styles.previewButtonsRow}>
                <AppButton
                  testID="professional-profile-preview-button"
                  label="Pré-visualizar vitrine"
                  onPress={() => setPreviewVisible(true)}
                  disabled={!isPublic || !slug}
                  variant="secondary"
                  icon={<Eye color={colors.text} size={16} />}
                />
                <AppButton
                  testID="professional-profile-open-public-button"
                  label="Abrir página pública"
                  onPress={() => router.push(`/profile/${slug}` as never)}
                  disabled={!isPublic || !slug}
                  variant="secondary"
                  icon={<ExternalLink color={colors.text} size={16} />}
                />
              </View>

              {isPublic && !!slug ? (
                <Text style={styles.previewBadgeText} testID="professional-profile-preview-badge">
                  👁️ Pré-visualização pública (exibe dados salvos e publicados)
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Modal de Pré-Visualização Pública no Editor */}
      <ProfessionalProfileSheet
        visible={previewVisible}
        professional={previewMember}
        establishmentId={profile?.establishment_id}
        onClose={() => setPreviewVisible(false)}
        onBook={() => setPreviewVisible(false)}
        testID="professional-profile-editor-sheet"
      />
    </ProfessionalShell>
  );
};

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 24, paddingBottom: 120, gap: 20 },
  card: { padding: 24, gap: 16, width: '100%' },
  multiline: { minHeight: 110, textAlignVertical: 'top', paddingTop: 14 },
  visibilityRow: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderRadius: radii.md, backgroundColor: colors.canvasSoft, borderWidth: 1, borderColor: colors.border },
  visibilityCopy: { flex: 1 },
  visibilityTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13 },
  visibilityText: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 11, lineHeight: 16, marginTop: 4 },
  cardTitle: { color: colors.text, fontFamily: typography.display, fontSize: 18 },
  cardDescription: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, lineHeight: 18 },
  galleryList: { gap: 8 },
  galleryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radii.md, backgroundColor: colors.canvasSoft, borderWidth: 1, borderColor: colors.border },
  galleryCopy: { flex: 1 },
  galleryUrl: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11 },
  galleryAlt: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 11, marginTop: 3 },
  removeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.dangerSoft },
  privacyNote: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingTop: 4 },
  privacyText: { flex: 1, color: colors.textSecondary, fontFamily: typography.body, fontSize: 11, lineHeight: 16 },
  pixSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  pixTypeButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.sm, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border },
  pixTypeButtonActive: { backgroundColor: colors.surface, borderColor: colors.text },
  pixTypeLabel: { fontSize: 11, color: colors.textSecondary, fontFamily: typography.body },
  pixTypeLabelActive: { color: colors.text, fontFamily: typography.bodyStrong },
  checkboxList: { gap: 14, marginVertical: 8 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  checkboxLabel: { color: colors.text, fontFamily: typography.body, fontSize: 13 },
  previewBox: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radii.md, backgroundColor: colors.canvasSoft, borderWidth: 1, borderColor: colors.border },
  previewThumb: { width: 48, height: 48, borderRadius: radii.sm },
  previewTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12 },
  galleryThumb: { width: 40, height: 40, borderRadius: radii.sm },
  shiftHeader: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 8 },
  shiftRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shiftDay: { alignItems: 'center', flexDirection: 'row', gap: 8, minWidth: 110 },
  shiftDayLabel: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12 },
  shiftInput: { flexGrow: 1, minWidth: 90 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'flex-end' },
  previewActionsContainer: { width: '100%', gap: 10, marginTop: 4 },
  previewButtonsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  previewBadgeText: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11.5, marginTop: 4 },
});

export default ProfessionalProfileEditorExperience;
