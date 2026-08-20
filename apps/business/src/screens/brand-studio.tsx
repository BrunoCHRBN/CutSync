import { BRAND_PRESET_IDS, validateBrandConfiguration, type BrandConfiguration } from '@cutsync/brand';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import {
  BusinessButton,
  BusinessCard,
  BusinessHeader,
  BusinessNotice,
  BusinessPage,
  BusinessPill,
  BusinessSectionTitle,
} from '@/components/ui/business-ui';
import { useBusinessOperational } from '@/contexts/business-operational-context';
import {
  businessBrandApi,
  mapBusinessBrandConfiguration,
  type BrandScope,
  type BusinessBrandContext,
} from '@/features/brand/business-brand-api';
import { businessTheme } from '@/theme/business-theme';
import { recordBusinessProductEvent } from '@/features/analytics/business-product-events';

export function BusinessBrandStudioScreen() {
  const router = useRouter();
  const { activeContext, hasCapability } = useBusinessOperational();
  const establishmentId = activeContext?.establishmentId || null;
  const canOpen = hasCapability('manage_operational_settings') && activeContext?.accessMode === 'full';
  const [context, setContext] = useState<BusinessBrandContext | null>(null);
  const [configuration, setConfiguration] = useState<BrandConfiguration | null>(null);
  const [scope, setScope] = useState<BrandScope>('establishment');
  const [inherit, setInherit] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning' | 'danger'; message: string } | null>(null);

  const load = useCallback(async () => {
    if (!establishmentId) return;
    setBusy(true);
    try {
      const next = await businessBrandApi.context(establishmentId);
      const version = next.establishmentDraft || next.establishmentPublished;
      setContext(next);
      setConfiguration(mapBusinessBrandConfiguration(version?.configuration || next.resolved));
      setDraftId(next.establishmentDraft?.id || null);
      setInherit(Boolean(next.capabilities.organizationId && !version?.override_fields?.length));
      setNotice(null);
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível carregar o estúdio de marca.' });
    } finally {
      setBusy(false);
    }
  }, [establishmentId]);

  useEffect(() => { void load(); }, [load]);

  const validation = useMemo(
    () => configuration ? validateBrandConfiguration(configuration) : null,
    [configuration],
  );

  if (!canOpen) return <Redirect href="/management" />;

  const selectScope = (nextScope: BrandScope) => {
    if (!context) return;
    const version = nextScope === 'organization'
      ? context.organizationDraft || context.organizationPublished
      : context.establishmentDraft || context.establishmentPublished;
    if (!version && nextScope === 'organization') return;
    setScope(nextScope);
    setConfiguration(mapBusinessBrandConfiguration(version?.configuration || context.resolved));
    setDraftId(nextScope === 'organization' ? context.organizationDraft?.id || null : context.establishmentDraft?.id || null);
  };

  const save = async () => {
    if (!establishmentId || !configuration || !validation?.valid) {
      setNotice({ tone: 'warning', message: 'Revise cor, textos alternativos e consentimento antes de salvar.' });
      return;
    }
    setBusy(true);
    try {
      const receipt = await businessBrandApi.save(establishmentId, scope, configuration, inherit);
      setDraftId(receipt.versionId);
      recordBusinessProductEvent({ name: 'brand_draft_saved', route: '/brand-studio' });
      setNotice({ tone: 'success', message: 'Rascunho salvo. A marca publicada não foi alterada.' });
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível salvar o rascunho.' });
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!establishmentId || !context || !draftId) return;
    const allowed = scope === 'organization'
      ? context.capabilities.publishOrganizationBrand
      : context.capabilities.publishBrand;
    if (!allowed) {
      setNotice({ tone: 'warning', message: 'A publicação exige owner ou admin da unidade.' });
      return;
    }
    setBusy(true);
    try {
      await businessBrandApi.publish(establishmentId, scope, draftId);
      recordBusinessProductEvent({ name: 'brand_published', route: '/brand-studio' });
      setNotice({ tone: 'success', message: 'Marca publicada com sucesso.' });
      await load();
    } catch {
      setNotice({ tone: 'danger', message: 'A publicação falhou. O rascunho foi preservado.' });
    } finally {
      setBusy(false);
    }
  };

  const restore = (versionId: string, versionNumber: number) => {
    if (!establishmentId || !context) return;
    const allowed = scope === 'organization'
      ? context.capabilities.publishOrganizationBrand
      : context.capabilities.publishBrand;
    if (!allowed) {
      setNotice({ tone: 'warning', message: 'Seu acesso não permite restaurar versões.' });
      return;
    }
    Alert.alert(
      `Restaurar versão ${versionNumber}?`,
      'A marca pública será atualizada e esta restauração criará uma nova versão auditável.',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Restaurar',
          onPress: () => void (async () => {
            setBusy(true);
            try {
              await businessBrandApi.restore(establishmentId, scope, versionId);
              recordBusinessProductEvent({ name: 'brand_published', route: '/brand-studio' });
              setNotice({ tone: 'success', message: `Versão ${versionNumber} restaurada.` });
              await load();
            } catch {
              setNotice({ tone: 'danger', message: 'Não foi possível restaurar a versão.' });
            } finally {
              setBusy(false);
            }
          })(),
        },
      ],
    );
  };

  return (
    <BusinessPage testID="business-brand-studio-screen">
      <BusinessHeader eyebrow="IDENTIDADE" title="Estúdio de marca" description="Presets controlados e a mesma marca no card, perfil e agendamento." />
      <BusinessButton label="Voltar à gestão" variant="ghost" onPress={() => router.back()} />
      {notice ? <BusinessNotice tone={notice.tone} message={notice.message} /> : null}
      {busy && !configuration ? <ActivityIndicator color={businessTheme.colors.accent} /> : null}
      {context?.capabilities.manageOrganizationBrand ? (
        <View style={styles.row}>
          <BusinessButton label="Unidade" variant={scope === 'establishment' ? 'primary' : 'secondary'} onPress={() => selectScope('establishment')} />
          <BusinessButton label="Organização" variant={scope === 'organization' ? 'primary' : 'secondary'} onPress={() => selectScope('organization')} />
        </View>
      ) : null}
      {scope === 'establishment' && context?.capabilities.organizationId ? (
        <BusinessCard>
          <View style={styles.switchRow}>
            <View style={styles.grow}>
              <Text style={styles.label}>Herdar marca da organização</Text>
              <Text style={styles.help}>Remove overrides da unidade ao publicar.</Text>
            </View>
            <Switch value={inherit} onValueChange={(value) => {
              setInherit(value);
              if (value && context.organizationPublished) {
                setConfiguration(mapBusinessBrandConfiguration(context.organizationPublished.configuration));
              }
            }} />
          </View>
        </BusinessCard>
      ) : null}
      {configuration ? (
        <>
          <BusinessCard>
            <BusinessSectionTitle>Composição</BusinessSectionTitle>
            <View style={styles.row}>{BRAND_PRESET_IDS.map((preset) => (
              <BusinessButton key={preset} label={preset === 'classic' ? 'Clássica' : preset === 'editorial' ? 'Editorial' : 'Minimalista'} variant={configuration.presetId === preset ? 'primary' : 'secondary'} onPress={() => setConfiguration({ ...configuration, presetId: preset })} />
            ))}</View>
            <Text style={styles.label}>Cor principal</Text>
            <TextInput accessibilityLabel="Cor principal hexadecimal" autoCapitalize="characters" maxLength={7} onChangeText={(primaryColor) => setConfiguration({ ...configuration, primaryColor })} style={styles.input} value={configuration.primaryColor} />
            <Text style={styles.label}>Descrição editorial</Text>
            <TextInput accessibilityLabel="Descrição editorial" multiline onChangeText={(description) => setConfiguration({ ...configuration, description })} placeholder="Conte o diferencial do estabelecimento" placeholderTextColor={businessTheme.colors.textMuted} style={[styles.input, styles.multiline]} value={configuration.description || ''} />
          </BusinessCard>
          <BusinessCard style={[styles.preview, { borderColor: configuration.primaryColor }]} testID="business-brand-preview">
            <BusinessPill label="CARD DE DESCOBERTA" />
            <Text style={styles.previewTitle}>{activeContext?.establishmentName}</Text>
            <Text style={styles.help}>{configuration.description || 'Adicione uma descrição editorial.'}</Text>
            <View style={[styles.previewButton, { backgroundColor: configuration.primaryColor }]}><Text style={styles.previewButtonText}>Ver horários</Text></View>
            <Text style={styles.help}>A mesma identidade será aplicada ao perfil e ao agendamento.</Text>
          </BusinessCard>
          {!validation?.valid ? <BusinessNotice tone="warning" message="A publicação exige contraste AA, texto alternativo e consentimento para toda mídia existente." /> : null}
          <View style={styles.row}>
            <BusinessButton label="Salvar rascunho" loading={busy} disabled={!validation?.valid} onPress={() => void save()} />
            {draftId ? <BusinessButton label="Publicar" variant="secondary" loading={busy} onPress={() => void publish()} /> : null}
          </View>
          <BusinessCard testID="business-brand-history">
            <BusinessSectionTitle>Histórico publicado</BusinessSectionTitle>
            <Text style={styles.help}>A restauração preserva as versões anteriores e fica registrada na auditoria.</Text>
            {(scope === 'organization' ? context?.organizationHistory : context?.establishmentHistory)
              ?.slice(0, 5)
              .map((version) => (
                <View key={version.id} style={styles.historyRow}>
                  <View style={styles.grow}>
                    <Text style={styles.label}>Versão {version.version_number}</Text>
                    <Text style={styles.help}>{version.published_at ? new Date(version.published_at).toLocaleDateString('pt-BR') : 'Sem data de publicação'}</Text>
                  </View>
                  {version.id !== (scope === 'organization' ? context?.organizationPublished?.id : context?.establishmentPublished?.id) ? (
                    <BusinessButton label="Restaurar" variant="secondary" disabled={busy} onPress={() => restore(version.id, version.version_number)} />
                  ) : <BusinessPill label="EM USO" tone="success" />}
                </View>
              ))}
          </BusinessCard>
        </>
      ) : null}
    </BusinessPage>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: businessTheme.spacing.sm },
  grow: { flex: 1 },
  switchRow: { alignItems: 'center', flexDirection: 'row', gap: businessTheme.spacing.md },
  historyRow: { alignItems: 'center', borderTopColor: businessTheme.colors.border, borderTopWidth: 1, flexDirection: 'row', gap: businessTheme.spacing.sm, paddingTop: businessTheme.spacing.sm },
  label: { ...businessTheme.typography.bodyStrong, color: businessTheme.colors.text },
  help: { ...businessTheme.typography.caption, color: businessTheme.colors.textSoft },
  input: { ...businessTheme.typography.body, backgroundColor: businessTheme.colors.surfaceRaised, borderColor: businessTheme.colors.borderStrong, borderRadius: businessTheme.radii.md, borderWidth: 1, color: businessTheme.colors.text, minHeight: businessTheme.sizing.control, paddingHorizontal: businessTheme.spacing.md },
  multiline: { minHeight: 112, paddingTop: businessTheme.spacing.md, textAlignVertical: 'top' },
  preview: { borderWidth: 2 },
  previewTitle: { ...businessTheme.typography.title, color: businessTheme.colors.text },
  previewButton: { alignItems: 'center', borderRadius: businessTheme.radii.md, minHeight: businessTheme.sizing.control, justifyContent: 'center' },
  previewButtonText: { ...businessTheme.typography.bodyStrong, color: businessTheme.colors.white },
});
