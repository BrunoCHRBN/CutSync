import type { Database, ProfessionalGalleryItem, ProfessionalPublicProfile } from '@cutsync/database';

import { supabase } from '@/lib/supabase';

type ProfileRow = Database['public']['Functions']['get_public_professional_profile']['Returns'][number];

const normalizeGallery = (value: ProfileRow['gallery_urls']): ProfessionalGalleryItem[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const url = typeof item.url === 'string' ? item.url.trim() : '';
    const alt = typeof item.alt === 'string' ? item.alt.trim() : '';
    if (!url.startsWith('http://') && !url.startsWith('https://')) return [];
    return [{ url, alt: alt || 'Trabalho do profissional' }];
  });
};

const mapProfile = (row: ProfileRow): ProfessionalPublicProfile => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  avatarUrl: row.avatar_url,
  tituloProfissional: row.titulo_profissional,
  specialties: row.specialties,
  bio: row.bio,
  portfolioUrl: row.portfolio_url,
  instagramUrl: row.instagram_url,
  gallery: normalizeGallery(row.gallery_urls),
});

const requireClient = () => {
  if (!supabase) throw new Error('O aplicativo ainda não está conectado ao CutSync.');
  return supabase;
};

const friendlyProfileError = (error: unknown) => {
  const value = error as { message?: string };
  const message = value?.message?.toLowerCase() ?? '';
  if (message.includes('network') || message.includes('fetch')) {
    return 'Não foi possível conectar. Verifique sua internet e tente novamente.';
  }
  return 'Não foi possível carregar este perfil agora. Tente novamente.';
};

export const getClientPublicProfessionalProfile = async (slug: string) => {
  try {
    const { data, error } = await requireClient()
      .rpc('get_public_professional_profile', { profile_slug: slug.toLowerCase().trim() })
      .maybeSingle();
    if (error) throw error;
    return data ? mapProfile(data) : null;
  } catch (error) {
    throw new Error(friendlyProfileError(error));
  }
};
