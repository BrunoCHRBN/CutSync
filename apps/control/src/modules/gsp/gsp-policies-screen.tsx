import { Link } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DataTable } from '@/components/cloud/data-table';
import { FeedbackState } from '@/components/cloud/feedback-state';
import { PageHeader } from '@/components/cloud/page-header';
import { StatusBadge } from '@/components/cloud/status-badge';
import { ControlCard } from '@/components/control-ui';
import { useControlAuth } from '@/contexts/control-auth-context';
import { resolveCloudActionAvailability } from '@/features/cloud/cloud-action-availability';
import {
  labelForSurfaceState,
  toneForSurfaceState,
} from '@/modules/gsp/presentation';
import { CLOUD_ROUTES } from '@/navigation/cloud-routes';
import { cloudTheme } from '@/theme/cloud-components';

type SystemPolicy = {
  id: string;
  category: string;
  title: string;
  stateLabel: string;
  application: string;
  detail: string;
};

function buildSystemPolicies(accessWriteEnabled: boolean): SystemPolicy[] {
  return [
    {
      id: 'aal2',
      category: 'Autenticação',
      title: 'MFA administrativo (AAL2)',
      stateLabel: 'Aplicada',
      application: 'Sessão do Control',
      detail: 'O console só libera módulos após autenticador de segundo fator verificado.',
    },
    {
      id: 'memory-session',
      category: 'Sessão',
      title: 'Sessão em memória',
      stateLabel: 'Aplicada',
      application: 'Cliente Control',
      detail: 'Tokens e contexto administrativo não são persistidos em armazenamento local durável.',
    },
    {
      id: 'least-privilege',
      category: 'Autorização',
      title: 'Menor privilégio por permissão',
      stateLabel: 'Aplicada',
      application: 'control.* permissions',
      detail: 'Cada rota e ação consulta permissões explícitas do papel SaaS — sem elevação implícita.',
    },
    {
      id: 'access-write-flag',
      category: 'Mutação',
      title: 'Escrita de acessos atrás de flag',
      stateLabel: accessWriteEnabled ? 'Habilitada' : 'Bloqueada por flag',
      application: 'EXPO_PUBLIC_CLOUD_ACCESS_WRITE_ENABLED',
      detail: accessWriteEnabled
        ? 'Concessões e revogações estão liberadas para Proprietário com control.access.manage.'
        : 'A UI e o cliente preservam a mutação, mas a flag de escrita permanece desligada neste ambiente.',
    },
    {
      id: 'last-owner',
      category: 'Autoproteção',
      title: 'Proteção do último Proprietário',
      stateLabel: 'Aplicada',
      application: 'set/revoke_control_user_access',
      detail: 'O último Owner ativo não pode ser rebaixado, expirado ou revogado pelo backend.',
    },
  ];
}

export function GspPoliciesScreen() {
  const { can } = useControlAuth();
  const accessWrite = resolveCloudActionAvailability({ action: 'access_write', can });
  const rows = buildSystemPolicies(accessWrite.enabled);

  const columns = [
    { key: 'category', header: 'Categoria', render: (row: SystemPolicy) => row.category },
    { key: 'title', header: 'Política', render: (row: SystemPolicy) => row.title },
    {
      key: 'state',
      header: 'Estado',
      render: (row: SystemPolicy) => (
        <StatusBadge
          label={row.stateLabel}
          tone={row.stateLabel.startsWith('Bloqueada') ? 'info' : 'success'}
        />
      ),
    },
    { key: 'application', header: 'Aplicação', render: (row: SystemPolicy) => row.application },
    { key: 'detail', header: 'Efeito', render: (row: SystemPolicy) => row.detail },
  ];

  return (
    <View style={styles.page}>
      <PageHeader
        eyebrow="GSP · POLÍTICAS"
        title="Políticas"
        description="Regras do sistema já aplicadas no Control. Políticas administráveis permanecem em preparação."
      />

      <FeedbackState
        kind="partial"
        title="Fonte de políticas administráveis em preparação"
        message="Não há catálogo editável de políticas nesta etapa. A tabela abaixo lista apenas controles verificáveis já em vigor."
      />

      <ControlCard style={styles.panel}>
        <View style={styles.panelHead}>
          <Text style={styles.panelTitle}>Políticas do sistema</Text>
          <StatusBadge
            label={labelForSurfaceState('available')}
            tone={toneForSurfaceState('available')}
          />
        </View>
        <Text style={styles.panelHint}>
          Derivadas de autenticação, sessão, permissões, feature flag de escrita e autoproteções do backend.
        </Text>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          emptyLabel="Nenhuma política do sistema disponível."
        />
      </ControlCard>

      <ControlCard style={styles.panel}>
        <Text style={styles.panelTitle}>Base operacional relacionada</Text>
        <Text style={styles.panelHint}>
          Documentação e artigos oficiais residem em Conhecimento. A migração da base ainda não foi concluída neste console.
        </Text>
        <Link href={CLOUD_ROUTES.gsp.conhecimento} asChild>
          <Pressable style={styles.linkBtn}>
            <Text style={styles.linkBtnText}>Abrir Conhecimento</Text>
          </Pressable>
        </Link>
      </ControlCard>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: cloudTheme.layout.contentMax,
    alignSelf: 'center',
    gap: cloudTheme.spacing.xl,
    padding: cloudTheme.layout.contentPadding,
  },
  panel: { gap: cloudTheme.spacing.sm },
  panelHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: cloudTheme.spacing.sm,
  },
  panelTitle: { ...cloudTheme.type.sectionTitle, color: cloudTheme.colors.text },
  panelHint: { ...cloudTheme.type.body, color: cloudTheme.colors.textSecondary },
  linkBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: cloudTheme.colors.borderStrong,
    borderRadius: cloudTheme.radii.md,
    paddingHorizontal: cloudTheme.spacing.md,
    paddingVertical: cloudTheme.spacing.sm,
    backgroundColor: cloudTheme.colors.surface,
  },
  linkBtnText: { ...cloudTheme.type.button, color: cloudTheme.colors.text },
});
