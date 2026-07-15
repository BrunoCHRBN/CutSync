import { synchronize } from '@nozbe/watermelondb/sync';
import { database } from './index';
import { supabase } from '../services/supabase';

const enrichPulledChanges = async (changes: any) => {
  const establishmentChanges = [
    ...(changes?.establishments?.created || []),
    ...(changes?.establishments?.updated || []),
  ];
  const profileChanges = [
    ...(changes?.profiles?.created || []),
    ...(changes?.profiles?.updated || []),
  ];

  const [establishmentsResult, profilesResult] = await Promise.all([
    establishmentChanges.length > 0
      ? supabase.from('establishments').select('id, gallery_urls').in('id', establishmentChanges.map((item: any) => item.id))
      : Promise.resolve({ data: [], error: null }),
    profileChanges.length > 0
      ? supabase.from('profiles').select('id, titulo_profissional').in('id', profileChanges.map((item: any) => item.id))
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (establishmentsResult.error) throw establishmentsResult.error;
  if (profilesResult.error) throw profilesResult.error;

  const galleryById = new Map((establishmentsResult.data || []).map((item: any) => [item.id, item.gallery_urls]));
  const titleById = new Map((profilesResult.data || []).map((item: any) => [item.id, item.titulo_profissional]));

  establishmentChanges.forEach((item: any) => {
    if (galleryById.has(item.id)) item.gallery_urls = galleryById.get(item.id);
  });
  profileChanges.forEach((item: any) => {
    if (titleById.has(item.id)) item.titulo_profissional = titleById.get(item.id);
  });

  return changes;
};

const pushCompatibilityFields = async (changes: any) => {
  const establishmentUpdates = changes?.establishments?.updated || [];
  await Promise.all(establishmentUpdates.map(async (item: any) => {
    const compatibilityUpdate: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(item, 'gallery_urls')) compatibilityUpdate.gallery_urls = item.gallery_urls;
    if (Object.prototype.hasOwnProperty.call(item, 'slug')) compatibilityUpdate.slug = item.slug;
    if (Object.keys(compatibilityUpdate).length === 0) return;

    const { error } = await supabase.from('establishments').update(compatibilityUpdate).eq('id', item.id);
    if (error) throw error;
  }));
};

export async function syncDatabase() {
  try {
    // Verificar se o usuário está logado antes de tentar sincronizar
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.log('[Sync] Sincronização ignorada: Nenhum usuário autenticado.');
      return;
    }

    console.log('[Sync] Iniciando sincronização...');

    await synchronize({
      database,
      pullChanges: async ({ lastPulledAt }) => {
        const { data, error } = await supabase.rpc('pull_changes', {
          last_pulled_at: lastPulledAt || 0,
        });

        if (error) {
          console.error('[Sync] Erro no pull_changes RPC:', error);
          throw new Error(error.message);
        }

        console.log('[Sync] Pull concluído com sucesso.');
        const enrichedChanges = await enrichPulledChanges(data.changes);
        return {
          changes: enrichedChanges,
          timestamp: data.timestamp,
        };
      },
      pushChanges: async ({ changes }) => {
        await pushCompatibilityFields(changes);
        const { error } = await supabase.rpc('push_changes', {
          changes,
        });

        if (error) {
          console.error('[Sync] Erro no push_changes RPC:', error);
          throw new Error(error.message);
        }

        console.log('[Sync] Push concluído com sucesso.');
      },
      sendCreatedAsUpdated: false,
    });

    console.log('[Sync] Sincronização concluída com sucesso!');
  } catch (error) {
    console.error('[Sync] Falha na sincronização do banco de dados:', error);
    throw error;
  }
}
