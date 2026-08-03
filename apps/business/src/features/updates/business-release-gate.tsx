import { useQuery } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { Linking } from 'react-native';

import {
  BusinessButton,
  BusinessHeader,
  BusinessNotice,
  BusinessPage,
} from '@/components/ui/business-ui';
import { useBusinessOperational } from '@/contexts/business-operational-context';
import { useBusinessSession } from '@/contexts/business-session';
import { BusinessFeatureError } from '@/features/connectivity/business-rpc';
import { isSupabaseConfigured } from '@/lib/supabase';

import {
  getBusinessNativeVersion,
  getBusinessReleasePolicy,
} from './business-updates';
import {
  createBusinessReleasePolicyQueryKey,
  resolveBusinessReleaseGateState,
} from './business-release-policy';

export function BusinessReleaseGate({ children }: PropsWithChildren) {
  const { user } = useBusinessSession();
  const { activeEstablishmentId } = useBusinessOperational();
  const nativeVersion = getBusinessNativeVersion();
  const policy = useQuery({
    queryKey: createBusinessReleasePolicyQueryKey(
      user?.id,
      activeEstablishmentId,
      nativeVersion,
    ),
    enabled: isSupabaseConfigured,
    queryFn: getBusinessReleasePolicy,
    placeholderData: (previousPolicy) => previousPolicy,
    staleTime: 5 * 60_000,
  });
  const gateState = resolveBusinessReleaseGateState({
    appVersion: nativeVersion,
    configured: isSupabaseConfigured,
    errorCode: policy.error instanceof BusinessFeatureError ? policy.error.code : null,
    fetchStatus: policy.fetchStatus,
    policy: policy.data,
    status: policy.status,
  });

  if (gateState === 'checking') {
    return (
      <BusinessPage testID="business-release-checking-screen">
        <BusinessHeader
          eyebrow="COMPATIBILIDADE"
          title="Verificando esta versão"
          description="Confirmando se o aplicativo instalado continua compatível."
        />
        <BusinessNotice
          tone="neutral"
          message="A verificação será retomada automaticamente se a conexão estiver indisponível."
        />
      </BusinessPage>
    );
  }

  if (gateState === 'validation_error') {
    return (
      <BusinessPage testID="business-release-validation-error-screen">
        <BusinessHeader
          eyebrow="COMPATIBILIDADE"
          title="Não foi possível validar esta versão"
          description="O servidor não retornou uma política de versão válida."
        />
        <BusinessNotice
          tone="danger"
          message="Tente novamente. Se o problema continuar, atualize o aplicativo pelo canal oficial."
        />
        <BusinessButton
          label="Tentar novamente"
          loading={policy.isFetching}
          onPress={() => { void policy.refetch(); }}
        />
      </BusinessPage>
    );
  }

  if (gateState !== 'blocked' || !policy.data) return children;
  return (
    <BusinessPage testID="business-release-required-screen">
      <BusinessHeader
        eyebrow="ATUALIZAÇÃO OBRIGATÓRIA"
        title="Atualize o CutSync Business"
        description={policy.data.message ?? 'Uma versão mais recente é necessária para continuar com segurança.'}
      />
      <BusinessNotice
        tone="warning"
        message={`Versão instalada ${nativeVersion}; versão mínima ${policy.data.minimumSupportedVersion}.`}
      />
      <BusinessButton
        label="Abrir atualização"
        disabled={!policy.data.storeUrl}
        onPress={() => {
          if (policy.data?.storeUrl) void Linking.openURL(policy.data.storeUrl);
        }}
      />
    </BusinessPage>
  );
}
