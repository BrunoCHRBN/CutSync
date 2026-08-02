import React from 'react';

import { ControlState } from '@/components/control-state';
import { useControlAuth } from '@/contexts/control-auth-context';

export default function SemAcessoRoute() {
  const { message, signOut, status } = useControlAuth();

  if (status !== 'unauthorized') {
    return (
      <ControlState
        title="Sem acesso ativo"
        message="Esta conta não possui autorização vigente para o CutSync Cloud."
        actionLabel="Voltar ao login"
        onAction={() => { void signOut(); }}
      />
    );
  }

  return (
    <ControlState
      title="Acesso não autorizado"
      message={message || 'Esta conta não possui acesso ativo ao CutSync Cloud.'}
      actionLabel="Encerrar sessão"
      onAction={() => { void signOut(); }}
    />
  );
}
