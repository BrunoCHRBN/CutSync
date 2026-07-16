import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { ProfessionalGalleryItem, ProfessionalPublicProfile } from '../types/database';

const normalizeGallery = (value: unknown): ProfessionalGalleryItem[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ProfessionalGalleryItem => Boolean(
    item && typeof item === 'object' && 'url' in item && 'alt' in item
  ));
};

export const usePublicProfessionalProfile = (slug?: string | null) => {
  const [profile, setProfile] = useState<ProfessionalPublicProfile | null>(null);
  const [loading, setLoading] = useState(Boolean(slug));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!slug) { setProfile(null); setLoading(false); return; }
    setLoading(true);
    const { data, error: queryError } = await supabase
      .rpc('get_public_professional_profile', { profile_slug: slug.toLowerCase() })
      .maybeSingle();
    if (queryError) {
      setError(queryError.message);
      setProfile(null);
    } else if (data) {
      const row = data as any;
      setError(null);
      setProfile({
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
    } else setProfile(null);
    setLoading(false);
  }, [slug]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { profile, loading, error, refresh };
};
