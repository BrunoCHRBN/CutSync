import { Redirect, Slot } from 'expo-router';

import { ControlShell } from '@/components/control-shell';
import { ControlState } from '@/components/control-state';
import { useControlAuth } from '@/contexts/control-auth-context';

export default function ProtectedLayout() {
  const { status, message, retry, signOut } = useControlAuth();

  if (status === 'loading') return <ControlState loading message="Preparando o ambiente privado..." />;
  if (status === 'signed_out') return <Redirect href="/login" />;
  if (status === 'mfa_required') return <Redirect href="/mfa" />;
  if (status === 'unauthorized') {
    return <ControlState title="Acesso não autorizado" message={message} actionLabel="Encerrar sessão" onAction={() => { void signOut(); }} />;
  }
  if (status === 'error') {
    return <ControlState title="Não foi possível abrir o Control" message={message} actionLabel="Tentar novamente" onAction={() => { void retry(); }} />;
  }

  return (
    <ControlShell>
      <Slot />
    </ControlShell>
  );
}
