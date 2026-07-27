import { useRouter } from 'expo-router';
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

const blockedReasonFor = (billingStatus?: string) => {
  switch (billingStatus) {
    case 'unconfigured':
    case 'none':
      return 'Esta unidade ainda não possui uma cobertura operacional confirmada pelo servidor.';
    case 'past_due':
    case 'suspended':
      return 'Os direitos operacionais desta unidade estão suspensos no servidor.';
    case 'expired':
    case 'canceled':
    case 'cancelled':
      return 'A cobertura operacional desta unidade terminou.';
    default:
      return 'O status operacional da unidade não permite consultar ou alterar dados neste momento.';
  }
};

export function BusinessBlockedScreen() {
  const router = useRouter();
  const { signOut } = useBusinessSession();
  const { activeContext, contexts, isRefreshing, refreshContexts } = useBusinessOperational();
  const [exitBusy, setExitBusy] = useState(false);

  const exit = async () => {
    setExitBusy(true);
    await signOut();
    setExitBusy(false);
  };

  return (
    <BusinessPage testID="business-blocked-screen">
      <BusinessHeader
        eyebrow="ACESSO BLOQUEADO"
        title={activeContext?.establishmentName ?? 'Unidade indisponível'}
        description="O backend não liberou dados operacionais para este estabelecimento."
      />
      <BusinessNotice
        tone="danger"
        message={blockedReasonFor(activeContext?.billingStatus)}
      />
      <BusinessNotice
        message="Agendamentos e vínculos permanecem preservados. A administração da assinatura continua exclusivamente na versão Web do CutSync."
      />
      <BusinessCard>
        <BusinessButton
          label="Verificar novamente"
          loading={isRefreshing}
          onPress={() => void refreshContexts(activeContext?.establishmentId)}
        />
        {contexts.length > 1 ? (
          <BusinessButton
            testID="business-blocked-switch"
            label="Trocar estabelecimento"
            variant="secondary"
            onPress={() => router.push('/establishments' as never)}
          />
        ) : null}
        <BusinessButton
          label="Sair"
          variant="ghost"
          loading={exitBusy}
          onPress={() => void exit()}
        />
      </BusinessCard>
    </BusinessPage>
  );
}
