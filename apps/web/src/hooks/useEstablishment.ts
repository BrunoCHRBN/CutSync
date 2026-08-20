import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { Establishment, mapEstablishment, parsePublicEstablishmentExperience, PUBLIC_ESTABLISHMENT_SELECT } from '@cutsync/database';

/**
 * Hook para buscar e observar um estabelecimento em tempo real via Supabase.
 *
 * @param identifier - O `id` ou `slug` do estabelecimento.
 * @param by - Campo a usar na busca ('id' | 'slug'). Default: 'id'.
 */
export function useEstablishment(identifier: string | null | undefined, by: 'id' | 'slug' = 'id') {
  const [establishment, setEstablishment] = useState<Establishment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!identifier) { setEstablishment(null); setLoading(false); return; }
    try {
      if (by === 'slug') {
        const publicResult = await supabase.rpc('get_public_establishment_experience', {
          target_slug: identifier,
        });
        if (!publicResult.error) {
          const experience = parsePublicEstablishmentExperience(publicResult.data);
          if (!experience) throw new Error('invalid_public_establishment_experience');
          const publicEstablishment = experience.establishment;
          setEstablishment({
            id: publicEstablishment.id,
            name: publicEstablishment.name,
            slug: publicEstablishment.slug,
            logoUrl: publicEstablishment.logoUrl,
            bannerUrl: publicEstablishment.bannerUrl,
            slogan: publicEstablishment.slogan,
            instagram: null,
            primaryColor: publicEstablishment.primaryColor || '#D4AF37',
            timezone: publicEstablishment.timezone,
            currency: publicEstablishment.currency,
            description: publicEstablishment.description,
            address: publicEstablishment.address,
            phone: publicEstablishment.phone,
            openingHours: publicEstablishment.openingHours,
            shareAgendas: false,
            galleryUrls: JSON.stringify(publicEstablishment.galleryUrls),
            accountStatus: 'active',
            discoveryStatus: 'published',
            publishedAt: publicEstablishment.publishedAt,
            averageRating: 0,
            reviewCount: 0,
            averagePrice: 0,
            priceLevel: 1,
            instantBookingEnabled: publicEstablishment.instantBookingEnabled,
            minCancellationHours: null,
            noShowFeePercent: null,
            latitude: null,
            longitude: null,
            professionalPixAllowed: false,
          });
          setError(null);
          return;
        }
        const rpcErrorText = JSON.stringify(publicResult.error).toLowerCase();
        if (!rpcErrorText.includes('pgrst202') && !rpcErrorText.includes('could not find the function')) {
          throw publicResult.error;
        }
      }
      const { data, error: err } = await supabase
        .from('establishments')
        .select(PUBLIC_ESTABLISHMENT_SELECT)
        .eq(by, identifier)
        .single();
      if (err) throw err;
      setEstablishment(mapEstablishment(data));
      setError(null);
    } catch (e: any) {
      console.error('[useEstablishment] Erro:', e);
      setError(e.message ?? 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [identifier, by]);

  useEffect(() => {
    setLoading(true);
    fetch();

    if (!identifier) return;

    if (by === 'slug') return;
    const filterValue = identifier;

    const channel = supabase
      .channel(`establishment-${identifier}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'establishments',
          ...(filterValue ? { filter: `id=eq.${filterValue}` } : {}),
        },
        () => fetch(),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [identifier, by, fetch]);

  return { establishment, loading, error, refresh: fetch };
}
