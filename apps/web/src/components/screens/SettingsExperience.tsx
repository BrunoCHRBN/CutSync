import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Banknote, Check, Clock3, CreditCard, ExternalLink, Eye, EyeOff, ImageIcon, KeyRound, MapPin, Phone, Save, ShieldCheck, Store, X } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../contexts/AuthContext';
import { useOperationalContext } from '../../contexts/operational-context';
import { useEstablishment } from '../../hooks/useEstablishment';
import { supabase } from '../../services/supabase';
import { AdminShell } from '../layout/AdminShell';
import { AppButton } from '../ui/AppButton';
import { AppInput } from '../ui/AppInput';
import { BrandColorPicker } from '../ui/BrandColorPicker';
import { EstablishmentBrandPreview } from '../settings/EstablishmentBrandPreview';
import { FormSection } from '../ui/FormSection';
import { InlineNotice } from '../ui/InlineNotice';
import { SectionHeading } from '../ui/SectionHeading';
import { colors, layout, radii, typography } from '../../theme/tokens';
import { parseOptionalCoordinate } from '../../utils/coordinate-validation';
import { getErrorMessage } from '../../utils/errors';
import { isValidClockTime, maskTimeInput } from '../../utils/time-input-mask';
import { StickyActionBar } from '../ui/sticky-action-bar';
import { normalizeInstagramHandle, type PublicationReadiness } from '@cutsync/domain';
import { BRAND_PRESET_IDS, validateBrandConfiguration, type BrandConfiguration, type BrandPresetId } from '@cutsync/brand';
import { parsePublicationReadiness } from '@cutsync/database';
import { PaymentMethodsSettings } from '../settings/PaymentMethodsSettings';
import { CashOperationsSettings } from '../settings/CashOperationsSettings';
import { recordWebProductEvent } from '../../services/product-events';
import { webExperienceFlags } from '../../config/experience-flags';
import {
  brandStudioService,
  fromWireBrandConfiguration,
  type BrandEditorContext,
  type BrandScope,
} from '../../features/brand/brand-studio-service';

type SettingsSection = 'brand' | 'contact' | 'images' | 'schedule' | 'publication' | 'policies' | 'payments' | 'cash' | 'security';

interface DiscoveryRequirements {
  account_active: boolean;
  name_valid: boolean;
  slug_valid: boolean;
  address_present: boolean;
  active_service_present: boolean;
}

interface DiscoveryPublicationRow {
  discovery_status: 'draft' | 'published';
  requirements: DiscoveryRequirements | null;
}

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
  instantBookingEnabled: boolean;
  minCancellationHours: number | null;
  noShowFeePercent: number | null;
  latitude: number | null;
  longitude: number | null;
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
  { key: 'publication', label: 'Publicação', Icon: Eye },
  { key: 'policies', label: 'Políticas e localização', Icon: ShieldCheck },
  { key: 'payments', label: 'Pagamentos', Icon: CreditCard },
  { key: 'cash', label: 'Caixa', Icon: Banknote },
  { key: 'security', label: 'Segurança', Icon: KeyRound },
];

export const SettingsExperience = () => {
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= layout.desktopBreakpoint;
  const { profile, signOut } = useAuth();
  const { activeEstablishmentId } = useOperationalContext();
  const { establishment: barbershop, loading } = useEstablishment(activeEstablishmentId);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [address, setAddress] = useState('');

  const [cep, setCep] = useState('');
  const [phone, setPhone] = useState('');
  const [schedule, setSchedule] = useState<DaySchedule[]>(defaultSchedule);
  const [primaryColor, setPrimaryColor] = useState('#F5A524');
  const [brandPreset, setBrandPreset] = useState<BrandPresetId>('classic');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoAltText, setLogoAltText] = useState('');
  const [logoConsentConfirmed, setLogoConsentConfirmed] = useState(false);
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [galleryAltText, setGalleryAltText] = useState('Ambiente e trabalhos do estabelecimento');
  const [galleryConsentConfirmed, setGalleryConsentConfirmed] = useState(false);
  
  // Novos campos estéticos e de políticas
  const [slogan, setSlogan] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [bannerAltText, setBannerAltText] = useState('');
  const [bannerConsentConfirmed, setBannerConsentConfirmed] = useState(false);
  const [brandDescription, setBrandDescription] = useState('');
  const [brandScope, setBrandScope] = useState<BrandScope>('establishment');
  const [inheritOrganizationBrand, setInheritOrganizationBrand] = useState(false);
  const [brandContext, setBrandContext] = useState<BrandEditorContext | null>(null);
  const [brandDraftId, setBrandDraftId] = useState<string | null>(null);
  const [brandPublishing, setBrandPublishing] = useState(false);
  const [brandSavedSnapshot, setBrandSavedSnapshot] = useState('');
  const [instagram, setInstagram] = useState('');
  const [instantBookingEnabled, setInstantBookingEnabled] = useState(true);
  
  const [minCancellationHours, setMinCancellationHours] = useState('24');
  const [noShowFeePercent, setNoShowFeePercent] = useState('0');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [professionalPixAllowed, setProfessionalPixAllowed] = useState(true);

  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);
  const activeSection: SettingsSection = settingsSections.some((item) => item.key === section)
    ? section as SettingsSection
    : 'brand';
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [discoveryStatus, setDiscoveryStatus] = useState<'draft' | 'published'>('draft');
  const [discoveryRequirements, setDiscoveryRequirements] = useState<DiscoveryRequirements | null>(null);
  const [publicationReadiness, setPublicationReadiness] = useState<PublicationReadiness | null>(null);
  const [publishing, setPublishing] = useState(false);

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
    instantBookingEnabled,
    minCancellationHours,
    noShowFeePercent,
    latitude,
    longitude,
    professionalPixAllowed,
  }), [address, bannerUrl, galleryUrls, instagram, instantBookingEnabled, logoUrl, name, phone, primaryColor, schedule, slogan, slug, minCancellationHours, noShowFeePercent, latitude, longitude, professionalPixAllowed]);
  const invalidSchedule = schedule.some((day) => day.isOpen && (!/^\d{2}:\d{2}$/.test(day.open) || !/^\d{2}:\d{2}$/.test(day.close) || day.open >= day.close));
  const formError = !name.trim() || !slug.trim()
    ? 'Nome e endereço digital são obrigatórios.'
    : !/^#[0-9A-Fa-f]{6}$/.test(primaryColor)
      ? 'Informe uma cor hexadecimal válida.'
      : invalidSchedule
        ? 'Revise o funcionamento: a abertura deve ser anterior ao fechamento.'
        : null;

  const brandConfiguration = useMemo<BrandConfiguration>(() => ({
    presetId: brandPreset,
    primaryColor,
    logoUrl,
    logoAltText: logoAltText.trim() || null,
    logoConsentConfirmed,
    bannerUrl: bannerUrl.trim() || null,
    bannerAltText: bannerAltText.trim() || null,
    bannerConsentConfirmed,
    gallery: galleryUrls.map((url, index) => ({
      url,
      altText: `${galleryAltText.trim()} ${index + 1}`.trim(),
      consentConfirmed: galleryConsentConfirmed,
    })),
    description: brandDescription.trim() || null,
    slogan: slogan.trim() || null,
    composition: 'balanced',
  }), [bannerAltText, bannerConsentConfirmed, bannerUrl, brandDescription, brandPreset, galleryAltText, galleryConsentConfirmed, galleryUrls, logoAltText, logoConsentConfirmed, logoUrl, primaryColor, slogan]);
  const brandValidation = useMemo(() => validateBrandConfiguration(brandConfiguration), [brandConfiguration]);
  const brandCurrentSnapshot = useMemo(() => JSON.stringify(brandConfiguration), [brandConfiguration]);
  const brandDirty = Boolean(brandSavedSnapshot && brandCurrentSnapshot !== brandSavedSnapshot);
  const isDirty = Boolean(savedSnapshot && currentSnapshot !== savedSnapshot) || brandDirty;

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
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível consultar o CEP agora.' });
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
    if (!activeEstablishmentId) {
      setNotice({ tone: 'danger', message: 'Selecione uma unidade antes de enviar imagens.' });
      return null;
    }

    try {
      setSaving(true);
      setNotice(null);

      const response = await fetch(uri);
      const blob = await response.blob();
      const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedImageTypes.includes(blob.type)) {
        throw new Error('image_type_not_allowed');
      }
      if (blob.size > 8 * 1024 * 1024) {
        throw new Error('image_too_large');
      }

      const fileExt = uri.split('.').pop()?.split('?')[0] || 'jpg';
      const fileName = `${activeEstablishmentId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const bucketName = 'banners';

      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(fileName, blob, {
          contentType: blob.type || 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: { publicUrl } } = supabase.storage
        .from(bucketName)
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (error: unknown) {
      setNotice({
        tone: 'danger',
        message: getErrorMessage(error, '').includes('image_type_not_allowed')
          ? 'Use uma imagem JPEG, PNG ou WebP.'
          : getErrorMessage(error, '').includes('image_too_large')
            ? 'A imagem deve ter no máximo 8 MB.'
            : 'Não foi possível carregar a imagem agora.',
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
    if (galleryUrls.length >= 12) {
      setNotice({ tone: 'danger', message: 'A galeria aceita no máximo 12 imagens.' });
      return;
    }
    const url = await pickImage([4, 5]);
    if (!url) return;
    const nextGallery = [...galleryUrls, url];
    setGalleryUrls(nextGallery);
    setNotice({ tone: 'success', message: 'Foto adicionada ao preview. Salve para publicar.' });
  };

  const loadDiscoveryPublication = useCallback(async () => {
    if (!activeEstablishmentId) return;
    const { data, error } = await supabase.rpc('get_establishment_discovery_publication' as never, {
      target_establishment_id: activeEstablishmentId,
    } as never);
    if (error) {
      setNotice({ tone: 'danger', message: 'Não foi possível consultar a publicação da vitrine.' });
      return;
    }
    const publication = (data as unknown as DiscoveryPublicationRow[] | null)?.[0];
    setDiscoveryStatus(publication?.discovery_status === 'published' ? 'published' : 'draft');
    setDiscoveryRequirements((publication?.requirements ?? null) as unknown as DiscoveryRequirements | null);
    const readinessResult = await supabase.rpc('get_publication_readiness', {
      target_establishment_id: activeEstablishmentId,
    });
    if (!readinessResult.error) {
      const readiness = parsePublicationReadiness(readinessResult.data);
      if (readiness) setPublicationReadiness(readiness);
    }
  }, [activeEstablishmentId]);

  useEffect(() => {
    void loadDiscoveryPublication();
  }, [loadDiscoveryPublication]);

  const applyBrandConfiguration = useCallback((configuration: BrandConfiguration) => {
    setBrandPreset(configuration.presetId);
    setPrimaryColor(configuration.primaryColor);
    setLogoUrl(configuration.logoUrl);
    setLogoAltText(configuration.logoAltText || '');
    setLogoConsentConfirmed(configuration.logoConsentConfirmed ?? false);
    setBannerUrl(configuration.bannerUrl || '');
    setBannerAltText(configuration.bannerAltText || '');
    setBannerConsentConfirmed(configuration.bannerConsentConfirmed ?? false);
    setGalleryUrls(configuration.gallery.map((item) => item.url));
    setGalleryAltText(configuration.gallery[0]?.altText?.replace(/\s+\d+$/, '') || 'Ambiente e trabalhos do estabelecimento');
    setGalleryConsentConfirmed(configuration.gallery.every((item) => item.consentConfirmed));
    setBrandDescription(configuration.description || '');
    setSlogan(configuration.slogan || '');
  }, []);

  const loadBrandStudio = useCallback(async () => {
    if (!activeEstablishmentId || !webExperienceFlags.brand_studio_v2) {
      setBrandContext(null);
      setBrandDraftId(null);
      return;
    }
    try {
      const context = await brandStudioService.getContext(activeEstablishmentId);
      setBrandContext(context);
      const version = context.establishmentDraft || context.establishmentPublished;
      const configuration = fromWireBrandConfiguration(version?.configuration || context.resolved);
      applyBrandConfiguration(configuration);
      setBrandSavedSnapshot(JSON.stringify(configuration));
      setBrandDraftId(context.establishmentDraft?.id || null);
      setInheritOrganizationBrand(Boolean(
        context.capabilities.organizationId
        && !(version?.override_fields?.length),
      ));
    } catch (error) {
      const detail = getErrorMessage(error, '');
      if (!detail.includes('could not find the function') && !detail.includes('PGRST202')) {
        setNotice({ tone: 'danger', message: 'Não foi possível carregar o estúdio de marca.' });
      }
    }
  }, [activeEstablishmentId, applyBrandConfiguration]);

  useEffect(() => {
    void loadBrandStudio();
  }, [loadBrandStudio]);

  const toggleDiscoveryPublication = async () => {
    if (!activeEstablishmentId || isDirty) {
      setNotice({ tone: 'danger', message: 'Salve as alterações antes de publicar a vitrine.' });
      return;
    }
    setPublishing(true);
    setNotice(null);
    try {
      const rpc = discoveryStatus === 'published'
        ? 'unpublish_establishment_discovery'
        : 'publish_establishment_discovery';
      const { data, error } = await supabase.rpc(rpc as never, {
        target_establishment_id: activeEstablishmentId,
      } as never);
      if (error) throw error;
      const publication = (data as unknown as DiscoveryPublicationRow[] | null)?.[0];
      setDiscoveryStatus(publication?.discovery_status === 'published' ? 'published' : 'draft');
      setDiscoveryRequirements((publication?.requirements ?? null) as unknown as DiscoveryRequirements | null);
      setNotice({
        tone: 'success',
        message: publication?.discovery_status === 'published'
          ? 'Vitrine publicada na descoberta.'
          : 'Vitrine removida da descoberta sem alterar seus dados.',
      });
    } catch (error) {
      const unmet = getErrorMessage(error, '').includes('discovery_requirements_not_met');
      setNotice({
        tone: 'danger',
        message: unmet
          ? 'Complete todos os requisitos antes de publicar.'
          : 'Não foi possível alterar a publicação da vitrine.',
      });
      await loadDiscoveryPublication();
    } finally {
      setPublishing(false);
    }
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
        setInstagram(normalizeInstagramHandle(shop.instagram) || '');
        setInstantBookingEnabled(shop.instantBookingEnabled !== false);
        setMinCancellationHours(String(shop.minCancellationHours ?? '24'));
        setNoShowFeePercent(String(shop.noShowFeePercent ?? '0'));
        setLatitude(shop.latitude ? String(shop.latitude) : '');
        setLongitude(shop.longitude ? String(shop.longitude) : '');
        setProfessionalPixAllowed(shop.professionalPixAllowed !== false);

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
          instantBookingEnabled: shop.instantBookingEnabled !== false,
          minCancellationHours: shop.minCancellationHours ?? 24,
          noShowFeePercent: shop.noShowFeePercent ?? 0,
          latitude: shop.latitude ? String(shop.latitude) : '',
          longitude: shop.longitude ? String(shop.longitude) : '',
          professionalPixAllowed: shop.professionalPixAllowed !== false,
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
    const invalidDay = schedule.find((day) => day.isOpen && (!isValidClockTime(day.open) || !isValidClockTime(day.close)));
    if (invalidDay) {
      setNotice({ tone: 'danger', message: `Horário inválido em ${invalidDay.name}. Use HH:MM.` });
      return;
    }
    const lat = parseOptionalCoordinate(latitude, 'latitude');
    const lng = parseOptionalCoordinate(longitude, 'longitude');
    if (!lat.ok) {
      setNotice({ tone: 'danger', message: lat.message });
      return;
    }
    if (!lng.ok) {
      setNotice({ tone: 'danger', message: lng.message });
      return;
    }
    if ((lat.value == null) !== (lng.value == null)) {
      setNotice({ tone: 'danger', message: 'Informe latitude e longitude juntas, ou deixe ambas vazias.' });
      return;
    }
    if (!barbershop) return;
    if (brandContext && brandDirty && !brandValidation.valid) {
      setNotice({
        tone: 'danger',
        message: 'Revise contraste, descrição das imagens e confirmação de autoria antes de salvar a marca.',
      });
      return;
    }

    setSaving(true);
    try {
      const establishmentUpdate = {
        name: name.trim(), slug: cleanSlug, address: address.trim(), phone: phone.trim(),
        instagram: normalizeInstagramHandle(instagram), opening_hours: JSON.stringify(schedule),
        instant_booking_enabled: instantBookingEnabled,
        min_cancellation_hours: parseInt(minCancellationHours, 10) || 24,
        no_show_fee_percent: parseFloat(noShowFeePercent) || 0.00,
        latitude: lat.value,
        longitude: lng.value,
        professional_pix_allowed: professionalPixAllowed,
        ...(brandContext ? {} : {
          slogan: slogan.trim() || null,
          banner_url: bannerUrl.trim() || null,
          primary_color: primaryColor.toUpperCase(),
          logo_url: logoUrl,
          gallery_urls: JSON.stringify(galleryUrls),
        }),
      };
      const { data: updatedEstablishment, error } = await supabase.from('establishments').update(establishmentUpdate).eq('id', barbershop.id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!updatedEstablishment) throw new Error('establishment_update_not_authorized');
      if (brandContext && brandDirty) {
        const receipt = await brandStudioService.saveDraft({
          establishmentId: barbershop.id,
          scope: brandScope,
          configuration: brandConfiguration,
          overrideFields: brandScope === 'establishment' && !inheritOrganizationBrand
            ? ['preset', 'primaryColor', 'logo', 'banner', 'gallery', 'description', 'slogan', 'composition']
            : [],
        });
        setBrandDraftId(receipt.versionId);
        setBrandSavedSnapshot(brandCurrentSnapshot);
        recordWebProductEvent({ name: 'brand_draft_saved', surface: 'web_business', role: 'admin', route: '/settings' });
      }
      setSlug(cleanSlug);
      setSavedSnapshot(JSON.stringify({
        ...JSON.parse(currentSnapshot),
        name: name.trim(),
        slug: cleanSlug,
        primaryColor: primaryColor.toUpperCase(),
        instantBookingEnabled: instantBookingEnabled,
        minCancellationHours: parseInt(minCancellationHours, 10) || 24,
        noShowFeePercent: parseFloat(noShowFeePercent) || 0.00,
        latitude: lat.value,
        longitude: lng.value,
        professionalPixAllowed: professionalPixAllowed,
      }));
      setNotice({
        tone: 'success',
        message: brandContext && brandDirty
          ? 'Configurações salvas. A marca permanece em rascunho até a publicação.'
          : 'Configurações salvas.',
      });
      await loadDiscoveryPublication();
    } catch (error) {
      const detail = getErrorMessage(error, '');
      setNotice({
        tone: 'danger',
        message: detail.includes('billing_read_only')
          ? 'Esta unidade está em modo somente leitura. Atualize o acesso da assinatura antes de alterar a operação.'
          : detail.includes('establishment_update_not_authorized')
            ? 'Sua sessão não tem permissão para alterar esta unidade. Atualize a página e confirme o estabelecimento ativo.'
            : 'Não foi possível salvar todas as alterações.',
      });
    } finally {
      setSaving(false);
    }
  };

  const publishBrandDraft = async () => {
    if (!activeEstablishmentId || !brandDraftId || !brandContext) return;
    const canPublish = brandScope === 'organization'
      ? brandContext.capabilities.publishOrganizationBrand
      : brandContext.capabilities.publishBrand;
    if (!canPublish) {
      setNotice({ tone: 'danger', message: 'Seu acesso permite editar, mas a publicação exige owner ou admin da unidade.' });
      return;
    }
    setBrandPublishing(true);
    setNotice(null);
    try {
      await brandStudioService.publish({
        establishmentId: activeEstablishmentId,
        scope: brandScope,
        versionId: brandDraftId,
      });
      recordWebProductEvent({ name: 'brand_published', surface: 'web_business', role: 'admin', route: '/settings' });
      setNotice({ tone: 'success', message: 'Marca publicada e propagada para as experiências públicas.' });
      setBrandDraftId(null);
      await loadBrandStudio();
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: getErrorMessage(error, '').includes('forbidden')
          ? 'Seu acesso não permite publicar esta marca.'
          : 'Não foi possível publicar. O rascunho foi preservado.',
      });
    } finally {
      setBrandPublishing(false);
    }
  };

  const restoreBrandVersion = async (versionId: string, versionNumber: number) => {
    if (!activeEstablishmentId || !brandContext) return;
    const canRestore = brandScope === 'organization'
      ? brandContext.capabilities.publishOrganizationBrand
      : brandContext.capabilities.publishBrand;
    if (!canRestore) {
      setNotice({ tone: 'danger', message: 'Seu acesso não permite restaurar versões publicadas.' });
      return;
    }
    if (typeof globalThis.confirm === 'function'
      && !globalThis.confirm(`Restaurar a versão ${versionNumber}? A marca pública será atualizada imediatamente.`)) return;
    setBrandPublishing(true);
    try {
      await brandStudioService.restore({
        establishmentId: activeEstablishmentId,
        scope: brandScope,
        versionId,
      });
      recordWebProductEvent({ name: 'brand_published', surface: 'web_business', role: 'admin', route: '/settings' });
      setNotice({ tone: 'success', message: `Versão ${versionNumber} restaurada como uma nova publicação auditável.` });
      await loadBrandStudio();
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível restaurar a versão selecionada.' });
    } finally {
      setBrandPublishing(false);
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
    setInstantBookingEnabled(snapshot.instantBookingEnabled);
    if (brandSavedSnapshot) applyBrandConfiguration(JSON.parse(brandSavedSnapshot) as BrandConfiguration);
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
                  onPress={() => router.setParams({ section: key })}
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
            {activeSection === 'publication' ? <FormSection
              testID="settings-publication-section"
              title="Publicação da vitrine"
              description="Controle quando o estabelecimento aparece na descoberta pública. Despublicar não altera agenda, serviços ou equipe."
            >
              <View style={[styles.publicationStatus, discoveryStatus === 'published' && styles.publicationStatusPublished]}>
                <View style={styles.publicationStatusIcon}>
                  {discoveryStatus === 'published' ? <Eye color={colors.success} size={20} /> : <EyeOff color={colors.textMuted} size={20} />}
                </View>
                <View style={styles.publicationStatusCopy}>
                  <Text testID="settings-publication-status" style={styles.publicationStatusTitle}>
                    {discoveryStatus === 'published' ? 'Vitrine publicada' : 'Vitrine em rascunho'}
                  </Text>
                  <Text style={styles.publicationStatusText}>
                    {discoveryStatus === 'published'
                      ? 'Clientes podem encontrar este estabelecimento na busca pública.'
                      : 'O perfil público permanece fora dos resultados até ser publicado.'}
                  </Text>
                </View>
              </View>

              <View style={styles.requirementsList}>
                {([
                  ['account_active', 'Conta do estabelecimento ativa'],
                  ['name_valid', 'Nome comercial válido'],
                  ['slug_valid', 'Endereço digital válido'],
                  ['active_service_present', 'Ao menos um serviço ativo'],
                ] as const).map(([key, label]) => {
                  const complete = discoveryRequirements?.[key] === true;
                  return (
                    <View key={key} testID={`settings-publication-requirement-${key}`} style={styles.requirementRow}>
                      <View style={[styles.requirementIcon, complete && styles.requirementIconComplete]}>
                        {complete ? <Check color={colors.white} size={12} /> : <Text style={styles.requirementPending}>·</Text>}
                      </View>
                      <Text style={[styles.requirementText, complete && styles.requirementTextComplete]}>{label}</Text>
                    </View>
                  );
                })}
              </View>

              {publicationReadiness ? (
                <InlineNotice
                  testID="settings-publication-completeness"
                  tone="info"
                  message={`Completude recomendada: ${publicationReadiness.completenessScore}%. Logo, banner, galeria, contato e endereço melhoram o perfil, mas não bloqueiam um pequeno estabelecimento.`}
                />
              ) : null}

              <AppButton
                testID="settings-publication-toggle"
                label={discoveryStatus === 'published' ? 'Despublicar vitrine' : 'Publicar vitrine'}
                icon={discoveryStatus === 'published' ? <EyeOff color={colors.text} size={17} /> : <Eye color={colors.white} size={17} />}
                variant={discoveryStatus === 'published' ? 'secondary' : 'admin'}
                disabled={publishing || isDirty || (discoveryStatus !== 'published' && !(publicationReadiness?.eligible ?? Boolean(
                  discoveryRequirements?.account_active
                  && discoveryRequirements?.name_valid
                  && discoveryRequirements?.slug_valid
                  && discoveryRequirements?.active_service_present
                )))}
                loading={publishing}
                onPress={() => void toggleDiscoveryPublication()}
              />
              {isDirty ? <Text style={styles.publicationHint}>Salve as alterações pendentes antes de publicar.</Text> : null}
            </FormSection> : null}

            {activeSection === 'brand' ? <FormSection testID="settings-brand-section" title="Estúdio de marca" description="Edite um rascunho, valide a prévia e publique sem remover a identidade CutSync.">
              {brandContext ? (
                <View style={styles.brandStudioStatus}>
                  <View style={styles.brandStudioStatusCopy}>
                    <Text style={styles.brandStudioStatusTitle}>{brandDraftId ? 'Rascunho salvo' : 'Versão publicada'}</Text>
                    <Text style={styles.brandStudioStatusText}>
                      {brandDraftId ? 'A vitrine ainda usa a versão publicada anterior.' : 'As experiências públicas estão usando esta versão.'}
                    </Text>
                  </View>
                  {brandDraftId ? <AppButton disabled={brandDirty} label="Publicar marca" icon={<Eye color={colors.white} size={16} />} loading={brandPublishing} onPress={() => void publishBrandDraft()} testID="settings-brand-publish" variant="admin" /> : null}
                </View>
              ) : null}

              {brandContext?.capabilities.manageOrganizationBrand ? (
                <View style={styles.brandChoiceRow} testID="settings-brand-scope">
                  <AppButton
                    label="Marca desta unidade"
                    onPress={() => {
                      setBrandScope('establishment');
                      const version = brandContext.establishmentDraft || brandContext.establishmentPublished;
                      applyBrandConfiguration(fromWireBrandConfiguration(version?.configuration || brandContext.resolved));
                      setBrandDraftId(brandContext.establishmentDraft?.id || null);
                    }}
                    variant={brandScope === 'establishment' ? 'admin' : 'secondary'}
                  />
                  <AppButton
                    label="Marca da organização"
                    onPress={() => {
                      setBrandScope('organization');
                      const version = brandContext.organizationDraft || brandContext.organizationPublished;
                      if (version) applyBrandConfiguration(fromWireBrandConfiguration(version.configuration));
                      setBrandDraftId(brandContext.organizationDraft?.id || null);
                    }}
                    variant={brandScope === 'organization' ? 'admin' : 'secondary'}
                  />
                </View>
              ) : null}

              {brandScope === 'establishment' && brandContext?.capabilities.organizationId ? (
                <View style={styles.visibilityRow}>
                  <View style={styles.visibilityCopy}>
                    <Text style={styles.visibilityTitle}>Herdar marca da organização</Text>
                    <Text style={styles.visibilityText}>Ao ativar, removeremos os overrides desta unidade na próxima publicação.</Text>
                  </View>
                  <Switch
                    value={inheritOrganizationBrand}
                    onValueChange={(value) => {
                      setInheritOrganizationBrand(value);
                      if (value && brandContext.organizationPublished) {
                        applyBrandConfiguration(fromWireBrandConfiguration(brandContext.organizationPublished.configuration));
                      }
                    }}
                    trackColor={{ false: colors.borderStrong, true: colors.success }}
                  />
                </View>
              ) : null}

              <View>
                <Text style={styles.fieldLabel}>Composição</Text>
                <View style={styles.brandChoiceRow}>
                  {BRAND_PRESET_IDS.map((preset) => (
                    <AppButton
                      key={preset}
                      label={preset === 'classic' ? 'Clássica' : preset === 'editorial' ? 'Editorial' : 'Minimalista'}
                      onPress={() => setBrandPreset(preset)}
                      testID={`settings-brand-preset-${preset}`}
                      variant={brandPreset === preset ? 'admin' : 'secondary'}
                    />
                  ))}
                </View>
              </View>
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
              </View>
              <AppInput label="Endereço digital" testID="settings-slug-input" icon={<ExternalLink color={colors.textMuted} size={17} />} value={slug} onChangeText={setSlug} autoCapitalize="none" hint="Use letras, números e hífens. Aparece em cutsync.com/salon/…" />
              <BrandColorPicker value={primaryColor} onChange={setPrimaryColor} />
              <AppInput label="Descrição editorial" value={brandDescription} onChangeText={setBrandDescription} multiline placeholder="Conte o que torna este estabelecimento especial." />
              {logoUrl ? <AppInput label="Descrição acessível da logo" value={logoAltText} onChangeText={setLogoAltText} placeholder="Ex.: Símbolo verde com o nome do estúdio" /> : null}
              {bannerUrl ? <AppInput label="Descrição acessível do banner" value={bannerAltText} onChangeText={setBannerAltText} placeholder="Ex.: Interior iluminado do estabelecimento" /> : null}
              {galleryUrls.length ? <AppInput label="Descrição base da galeria" value={galleryAltText} onChangeText={setGalleryAltText} placeholder="Ex.: Ambiente e trabalhos do estabelecimento" /> : null}
              {(logoUrl || bannerUrl || galleryUrls.length) ? (
                <View style={styles.visibilityRow}>
                  <View style={styles.visibilityCopy}>
                    <Text style={styles.visibilityTitle}>Autoria e consentimento confirmados</Text>
                    <Text style={styles.visibilityText}>Confirmo que o estabelecimento pode publicar estas mídias. Fotos identificáveis de clientes não são permitidas nesta fase.</Text>
                  </View>
                  <Switch
                    testID="settings-brand-media-consent"
                    value={(!logoUrl || logoConsentConfirmed) && (!bannerUrl || bannerConsentConfirmed) && (!galleryUrls.length || galleryConsentConfirmed)}
                    onValueChange={(value) => {
                      setLogoConsentConfirmed(value || !logoUrl);
                      setBannerConsentConfirmed(value || !bannerUrl);
                      setGalleryConsentConfirmed(value || !galleryUrls.length);
                    }}
                    trackColor={{ false: colors.borderStrong, true: colors.success }}
                  />
                </View>
              ) : null}
              {!brandValidation.valid ? <InlineNotice testID="settings-brand-validation" tone="warning" message="A publicação exige contraste AA, textos alternativos e consentimento para todas as mídias." /> : null}
              {brandContext ? (
                <View style={styles.brandHistory} testID="settings-brand-history">
                  <Text style={styles.brandStudioStatusTitle}>Histórico publicado</Text>
                  <Text style={styles.brandStudioStatusText}>Restaurar cria uma nova versão; o histórico e a auditoria anteriores são preservados.</Text>
                  {(brandScope === 'organization' ? brandContext.organizationHistory : brandContext.establishmentHistory)
                    ?.slice(0, 5)
                    .map((version) => (
                      <View key={version.id} style={styles.brandHistoryRow}>
                        <View style={styles.brandStudioStatusCopy}>
                          <Text style={styles.brandStudioStatusTitle}>Versão {version.version_number}</Text>
                          <Text style={styles.brandStudioStatusText}>{version.status === 'published' ? 'Em uso' : 'Arquivada'}{version.published_at ? ` · ${new Date(version.published_at).toLocaleDateString('pt-BR')}` : ''}</Text>
                        </View>
                        {version.status !== 'published' ? <AppButton disabled={brandPublishing} label="Restaurar" onPress={() => void restoreBrandVersion(version.id, version.version_number)} size="sm" variant="secondary" /> : null}
                      </View>
                    ))}
                </View>
              ) : null}
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

            {activeSection === 'payments' ? <PaymentMethodsSettings /> : null}
            {activeSection === 'cash' ? <CashOperationsSettings /> : null}

            {activeSection === 'policies' ? <FormSection testID="settings-policies-section" title="Políticas de agendamento e localização" description="Ajuste os prazos mínimos para cancelamento, regras de ausência e coordenadas usadas no mapa.">
              <View style={styles.fieldsRow}>
                <AppInput containerStyle={styles.flexField} label="Cancelamento prévio mínimo (horas)" value={minCancellationHours} onChangeText={setMinCancellationHours} keyboardType="numeric" placeholder="24" hint="Prazos antes do agendamento." />
                <AppInput containerStyle={styles.flexField} label="Multa No-Show (%)" value={noShowFeePercent} onChangeText={setNoShowFeePercent} keyboardType="numeric" placeholder="0" hint="Taxa cobrada em faltas." />
              </View>
              <View style={styles.fieldsRow}>
                <AppInput
                  containerStyle={styles.flexField}
                  label="Latitude Geográfica (Opcional)"
                  value={latitude}
                  onChangeText={setLatitude}
                  keyboardType="numeric"
                  placeholder="Ex: -23.550520"
                  hint={(() => {
                    const parsed = parseOptionalCoordinate(latitude, 'latitude');
                    return parsed.ok ? 'Entre -90 e 90. Informe junto com a longitude.' : parsed.message;
                  })()}
                />
                <AppInput
                  containerStyle={styles.flexField}
                  label="Longitude Geográfica (Opcional)"
                  value={longitude}
                  onChangeText={setLongitude}
                  keyboardType="numeric"
                  placeholder="Ex: -46.633308"
                  hint={(() => {
                    const parsed = parseOptionalCoordinate(longitude, 'longitude');
                    return parsed.ok ? 'Entre -180 e 180. Informe junto com a latitude.' : parsed.message;
                  })()}
                />
              </View>
              <View style={styles.visibilityRow}>
                <View style={styles.visibilityCopy}>
                  <Text style={styles.visibilityTitle}>Permitir Pix dos colaboradores</Text>
                  <Text style={styles.visibilityText}>Permite que profissionais de sua barbearia cadastrem chaves Pix para recebimento automático de comissões.</Text>
                </View>
                <Switch value={professionalPixAllowed} onValueChange={setProfessionalPixAllowed} trackColor={{ false: colors.borderStrong, true: colors.success }} />
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
                            copy[idx].open = maskTimeInput(val);
                            setSchedule(copy);
                          }}
                          placeholder="09:00"
                          keyboardType="number-pad"
                          maxLength={5}
                          placeholderTextColor="#666"
                        />
                        <Text style={{ color: colors.textMuted, fontSize: 12 }}>às</Text>
                        <TextInput
                          testID={`settings-schedule-close-${dayItem.day}`}
                          style={styles.timeInput}
                          value={dayItem.close}
                          onChangeText={(val) => {
                            const copy = [...schedule];
                            copy[idx].close = maskTimeInput(val);
                            setSchedule(copy);
                          }}
                          placeholder="20:00"
                          keyboardType="number-pad"
                          maxLength={5}
                          placeholderTextColor="#666"
                        />
                      </View>
                    ) : (
                      <Text style={styles.closedText}>Fechado</Text>
                    )}
                  </View>
                ))}
              </View>

              <View style={styles.instantBookingRow}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.instantBookingTitle}>Reserva Instantânea</Text>
                  <Text style={styles.instantBookingDesc}>Se ativado, os agendamentos dos clientes são confirmados imediatamente. Se desativado, entram como &quot;Aguardando confirmação&quot;.</Text>
                </View>
                <Switch
                  testID="settings-instant-booking-switch"
                  value={instantBookingEnabled}
                  onValueChange={setInstantBookingEnabled}
                  trackColor={{ false: colors.borderStrong, true: colors.accent }}
                  thumbColor={colors.white}
                />
              </View>
            </FormSection> : null}
          </View>

          {activeSection !== 'payments' && activeSection !== 'cash' ? <View style={styles.previewColumn}>
            <EstablishmentBrandPreview
              name={name}
              slogan={slogan}
              address={address}
              phone={phone}
              slug={slug}
              logoUrl={logoUrl}
              bannerUrl={bannerUrl}
              primaryColor={primaryColor}
              onCopyLink={copyPublicLink}
            />
          </View> : null}
        </View>
        </ScrollView>
        {activeSection !== 'payments' && activeSection !== 'cash' ? <StickyActionBar
          actions={<>
            <AppButton disabled={!isDirty || saving} label="Descartar" onPress={discardChanges} testID="settings-discard-button" variant="secondary" />
            <AppButton disabled={!isDirty || Boolean(formError)} icon={<Save color={colors.white} size={17} />} label="Salvar" loading={saving} onPress={saveSettings} testID="settings-save-button" variant="admin" />
          </>}
          message={isDirty ? 'Alterações não salvas' : 'Configurações atualizadas'}
          testID="settings-sticky-actions"
        /> : null}
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
  brandStudioStatus: { alignItems: 'center', backgroundColor: colors.canvas, borderColor: colors.borderSubtle, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', padding: 14 },
  brandStudioStatusCopy: { flex: 1, minWidth: 220 },
  brandStudioStatusTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13 },
  brandStudioStatusText: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12, marginTop: 3 },
  brandChoiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  brandHistory: { backgroundColor: colors.canvas, borderColor: colors.borderSubtle, borderRadius: radii.md, borderWidth: 1, gap: 10, padding: 14 },
  brandHistoryRow: { alignItems: 'center', borderTopColor: colors.borderSubtle, borderTopWidth: 1, flexDirection: 'row', gap: 12, justifyContent: 'space-between', paddingTop: 10 },
  logoTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12 },
  logoHint: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12, marginTop: 4, marginBottom: 10 },
  compactButton: { alignSelf: 'flex-start', minHeight: 38, paddingVertical: 7 },
  fieldsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  flexField: { flex: 1, minWidth: 210 },
  scheduleGrid: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingHorizontal: 18, paddingVertical: 8 },
  scheduleRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  scheduleDayName: { flex: 1, color: colors.text, fontFamily: typography.body, fontSize: 12 },
  scheduleTimes: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 16 },
  timeInput: { width: 56, height: 34, textAlign: 'center', color: colors.text, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, fontSize: 12, paddingHorizontal: 4 },
  closedText: { color: colors.textMuted, fontSize: 12, fontFamily: typography.body, minWidth: 120, textAlign: 'right' },
  compactUploadButton: { minHeight: 32, paddingVertical: 5, paddingHorizontal: 12, alignSelf: 'flex-start', marginTop: 4 },
  uploadButton: { minHeight: 38, paddingVertical: 8, paddingHorizontal: 16, alignSelf: 'flex-start' },
  fieldLabel: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 },
  emptyGalleryText: { color: colors.textMuted, fontSize: 12, fontStyle: 'italic', marginVertical: 4 },
  galleryPreviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 8 },
  galleryItemContainer: { width: 80, height: 100, borderRadius: radii.md, overflow: 'hidden', position: 'relative' },
  securityRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 14 },
  securityIcon: { width: 42, height: 42, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.infoSoft },
  securityCopy: { flex: 1, minWidth: 210 },
  securityTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13 },
  securityDescription: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12, lineHeight: 17, marginTop: 3 },
  galleryItemImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  galleryItemRemove: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  instantBookingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  instantBookingTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13 },
  instantBookingDesc: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, marginTop: 4, lineHeight: 16 },
  visibilityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: radii.md, backgroundColor: colors.canvasSoft, borderWidth: 1, borderColor: colors.border, marginTop: 14 },
  visibilityCopy: { flex: 1, marginRight: 16 },
  visibilityTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13 },
  visibilityText: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, lineHeight: 16, marginTop: 4 },
  publicationStatus: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.canvasSoft },
  publicationStatusPublished: { borderColor: colors.success, backgroundColor: colors.successSoft },
  publicationStatusIcon: { width: 38, height: 38, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  publicationStatusCopy: { flex: 1, gap: 3 },
  publicationStatusTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13 },
  publicationStatusText: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, lineHeight: 16 },
  requirementsList: { gap: 10 },
  requirementRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  requirementIcon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  requirementIconComplete: { borderColor: colors.success, backgroundColor: colors.success },
  requirementPending: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 14 },
  requirementText: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12 },
  requirementTextComplete: { color: colors.text, fontFamily: typography.bodyStrong },
  publicationHint: { color: colors.warning, fontFamily: typography.body, fontSize: 12 },
});
