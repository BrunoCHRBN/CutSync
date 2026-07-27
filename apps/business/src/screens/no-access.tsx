import { useState } from 'react';

import {
  BusinessButton,
  BusinessCard,
  BusinessHeader,
  BusinessNotice,
  BusinessPage,
} from '@/components/ui/business-ui';
import { useBusinessOperational } from '@/contexts/business-operational-context';
import { useBusinessSession } from '@/contexts/business-session';

export function BusinessNoAccessScreen() {
  const { user, signOut } = useBusinessSession();
  const { error, isRefreshing, refreshContexts } = useBusinessOperational();
  const [exitBusy, setExitBusy] = useState(false);

  const exit = async () => {
    setExitBusy(true);
    await signOut();
    setExitBusy(false);
  };

  return (
    <BusinessPage testID="business-no-access-screen">
      <BusinessHeader
        eyebrow={error ? 'CONTEXTO INDISPONÍVEL' : 'VÍNCULO NECESSÁRIO'}
        title={error
          ? 'Não conseguimos confirmar seu acesso.'
          : 'Sua conta ainda não possui uma unidade.'}
        description={user?.email}
      />
      <BusinessNotice
        tone={error ? 'danger' : 'neutral'}
        message={error ?? 'Abra o convite enviado pelo estabelecimento usando exatamente este e-mail.'}
      />
      <BusinessCard>
        <BusinessButton
          label="Atualizar vínculos"
          loading={isRefreshing}
          onPress={() => void refreshContexts()}
        />
        <BusinessButton
          label="Entrar com outra conta"
          variant="secondary"
          loading={exitBusy}
          onPress={() => void exit()}
        />
      </BusinessCard>
    </BusinessPage>
  );
}
