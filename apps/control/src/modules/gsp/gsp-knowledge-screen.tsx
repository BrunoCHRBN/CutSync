import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FeedbackState } from '@/components/cloud/feedback-state';
import { PageHeader } from '@/components/cloud/page-header';
import { StatusBadge } from '@/components/cloud/status-badge';
import { ControlCard } from '@/components/control-ui';
import { labelForSurfaceState, toneForSurfaceState } from '@/modules/gsp/presentation';
import { cloudTheme } from '@/theme/cloud-components';

const readiness = [
  {
    id: 'migration',
    title: 'Migração da base',
    detail: 'O fórum/KB existente em apps/web e Supabase ainda não foi portado para o Control.',
  },
  {
    id: 'source',
    title: 'Fonte de conteúdo',
    detail: 'Publicação, autoria e versionamento permanecem na origem atual até a migração.',
  },
  {
    id: 'publishing',
    title: 'Publicação e moderação',
    detail: 'Fluxos de rascunho, aprovação e moderação serão reconstituídos sem artigos simulados.',
  },
] as const;

export function GspKnowledgeScreen() {
  return (
    <View style={styles.page}>
      <PageHeader
        eyebrow="GSP · CONHECIMENTO"
        title="Conhecimento"
        description="Superfície institucional para a base operacional da governança. Conteúdo oficial será ligado após a migração."
      />

      <ControlCard style={styles.stripCard}>
        <View style={styles.strip}>
          <View style={styles.stripItem}>
            <Text style={styles.stripLabel}>Estado</Text>
            <Text style={styles.stripValue}>Em preparação</Text>
            <StatusBadge
              label={labelForSurfaceState('preparing')}
              tone={toneForSurfaceState('preparing')}
            />
          </View>
          <View style={styles.stripItem}>
            <Text style={styles.stripLabel}>Proteção</Text>
            <Text style={styles.stripValue}>control.knowledge.read</Text>
            <StatusBadge label="Ativa" tone="success" />
          </View>
          <View style={styles.stripItem}>
            <Text style={styles.stripLabel}>Artigos simulados</Text>
            <Text style={styles.stripValue}>Não utilizados</Text>
            <StatusBadge label="Política" tone="neutral" />
          </View>
        </View>
      </ControlCard>

      <FeedbackState
        kind="partial"
        title="Base operacional em preparação"
        message="Nenhum artigo, rascunho ou fila de moderação é inventado nesta etapa. A proteção da rota permanece ativa independentemente da visibilidade do menu."
      />

      <ControlCard style={styles.panel}>
        <Text style={styles.panelTitle}>Prontidão da superfície</Text>
        <View style={styles.list}>
          {readiness.map((item) => (
            <View key={item.id} style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowDetail}>{item.detail}</Text>
              </View>
              <StatusBadge
                label={labelForSurfaceState('preparing')}
                tone={toneForSurfaceState('preparing')}
              />
            </View>
          ))}
        </View>
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
  stripCard: { paddingVertical: cloudTheme.spacing.sm },
  strip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: cloudTheme.spacing.md,
  },
  stripItem: {
    flexGrow: 1,
    flexBasis: 180,
    minWidth: 160,
    gap: 6,
    padding: cloudTheme.spacing.sm,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: cloudTheme.colors.border,
  },
  stripLabel: {
    ...cloudTheme.type.caption,
    color: cloudTheme.colors.textMuted,
    textTransform: 'uppercase',
  },
  stripValue: {
    ...cloudTheme.type.bodyStrong,
    color: cloudTheme.colors.text,
  },
  panel: { gap: cloudTheme.spacing.sm },
  panelTitle: { ...cloudTheme.type.sectionTitle, color: cloudTheme.colors.text },
  list: { gap: cloudTheme.spacing.sm },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: cloudTheme.spacing.sm,
    alignItems: 'flex-start',
    paddingVertical: cloudTheme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cloudTheme.colors.border,
  },
  rowMain: { flex: 1, gap: 4 },
  rowTitle: { ...cloudTheme.type.smallStrong, color: cloudTheme.colors.text },
  rowDetail: { ...cloudTheme.type.small, color: cloudTheme.colors.textSecondary },
});
