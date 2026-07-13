import { synchronize } from '@nozbe/watermelondb/sync';
import { database } from './index';
import { supabase } from '../services/supabase';

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
        return {
          changes: data.changes,
          timestamp: data.timestamp,
        };
      },
      pushChanges: async ({ changes }) => {
        const { error } = await supabase.rpc('push_changes', {
          changes,
        });

        if (error) {
          console.error('[Sync] Erro no push_changes RPC:', error);
          throw new Error(error.message);
        }

        console.log('[Sync] Push concluído com sucesso.');
      },
      sendCreatedAsUpdated: true,
    });

    console.log('[Sync] Sincronização concluída com sucesso!');
  } catch (error) {
    console.error('[Sync] Falha na sincronização do banco de dados:', error);
    throw error;
  }
}
