import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, type Href } from 'expo-router';
import { ArrowLeft, Eye, History, ImagePlus, Save } from 'lucide-react-native';
import { useGovernanceAuth } from '../../contexts/governance-auth-context';
import {
  createKnowledgeSlug,
  createKnowledgeTopic,
  getKnowledgeTopic,
  listKnowledgeCategories,
  restoreKnowledgeRevision,
  updateKnowledgeTopic,
  uploadKnowledgeImage,
} from '../../services/governance-knowledge';
import {
  canEditKnowledge,
  isKnowledgeOwner,
  type KnowledgeAttachment,
  type KnowledgeCategory,
  type KnowledgePublicationStatus,
  type KnowledgeResolutionStatus,
  type KnowledgeRevision,
  type KnowledgeTopicInput,
  type KnowledgeTopicKind,
} from '../../types/governance-knowledge';
import { KnowledgeMarkdown } from './knowledge-markdown';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { InlineNotice } from '../ui/InlineNotice';
import { colors, layout, radii, typography } from '../../theme/tokens';

const kindLabels: Record<KnowledgeTopicKind, string> = {
  question: 'Pergunta',
  guide: 'Guia',
  procedure: 'Procedimento',
  decision: 'Decisão',
  incident: 'Incidente',
};

function formatSafeDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR');
}

export function KnowledgeEditor({ topicId }: { topicId?: string }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { profile } = useGovernanceAuth();
  const role = profile?.role ?? 'SaaS_Viewer';
  const [localTopicId, setLocalTopicId] = useState(topicId ?? null);
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [body, setBody] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [kind, setKind] = useState<KnowledgeTopicKind>('guide');
  const [tags, setTags] = useState('');
  const [publicationStatus, setPublicationStatus] = useState<KnowledgePublicationStatus>('draft');
  const [resolutionStatus, setResolutionStatus] = useState<KnowledgeResolutionStatus>(null);
  const [changeSummary, setChangeSummary] = useState('');
  const [altText, setAltText] = useState('');
  const [attachments, setAttachments] = useState<KnowledgeAttachment[]>([]);
  const [revisions, setRevisions] = useState<KnowledgeRevision[]>([]);
  const [restoreSummary, setRestoreSummary] = useState('Restaurar versão revisada');
  const [loading, setLoading] = useState(Boolean(topicId));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);
  const isWide = width >= 980;

  useEffect(() => {
    listKnowledgeCategories().then((items) => {
      setCategories(items);
      setCategoryId((current) => current || items[0]?.id || '');
    }).catch(() => setNotice({ tone: 'danger', message: 'Não foi possível carregar as categorias.' }));
  }, []);

  const loadTopic = async (id: string) => {
    setLoading(true);
    try {
      const detail = await getKnowledgeTopic(id);
      setTitle(detail.topic.title);
      setSlug(detail.topic.slug);
      setBody(detail.topic.body_markdown);
      setCategoryId(detail.topic.category.id);
      setKind(detail.topic.kind);
      setTags(Array.isArray(detail.topic.tags) ? detail.topic.tags.join(', ') : '');
      setPublicationStatus(detail.topic.publication_status);
      setResolutionStatus(detail.topic.resolution_status);
      setAttachments(detail.attachments);
      setRevisions(detail.revisions.filter((revision) => revision.entity_type === 'topic'));
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível carregar este tópico.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (topicId) loadTopic(topicId);
  }, [topicId]);

  const parsedTags = useMemo(
    () => [...new Set(tags.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 10),
    [tags],
  );

  const buildInput = (status: 'draft' | 'published', bodyOverride = body): KnowledgeTopicInput => ({
    title: title.trim(),
    slug: slug.trim() || createKnowledgeSlug(title),
    body_markdown: bodyOverride.trim(),
    category_id: categoryId,
    kind,
    tags: parsedTags,
    publication_status: status,
    resolution_status: kind === 'question' || kind === 'incident' ? (resolutionStatus ?? 'open') : null,
    last_change_summary: changeSummary.trim() || null,
  });

  const validate = () => {
    if (!canEditKnowledge(role)) return 'Seu perfil não pode editar a base.';
    if (title.trim().length < 3) return 'Informe um título com pelo menos 3 caracteres.';
    if (!categoryId) return 'Selecione uma categoria.';
    if (!body.trim()) return 'Escreva o conteúdo do tópico.';
    if (publicationStatus === 'published' && localTopicId && changeSummary.trim().length < 3) {
      return 'Explique resumidamente o que mudou no conteúdo publicado.';
    }
    return null;
  };

  const save = async (status: 'draft' | 'published') => {
    const error = validate();
    if (error) { setNotice({ tone: 'danger', message: error }); return null; }
    setSaving(true);
    setNotice(null);
    try {
      const input = buildInput(status);
      if (localTopicId) {
        await updateKnowledgeTopic(localTopicId, input);
      } else {
        const createdId = await createKnowledgeTopic(input, profile?.id ?? '');
        setLocalTopicId(createdId);
        router.replace(`/governance/knowledge/${createdId}/edit` as Href);
      }
      setPublicationStatus(status);
      setChangeSummary('');
      setNotice({ tone: 'success', message: status === 'published' ? 'Tópico publicado com uma nova versão.' : 'Rascunho salvo.' });
      return localTopicId;
    } catch (error: unknown) {
      const message = error instanceof Error && error.message.includes('change_summary_required')
        ? 'A justificativa da alteração é obrigatória.'
        : 'Não foi possível salvar. Verifique título, slug e permissões.';
      setNotice({ tone: 'danger', message });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const ensureDraft = async (): Promise<string | null> => {
    if (localTopicId) return localTopicId;
    const error = validate();
    if (error && !error.startsWith('Explique')) { setNotice({ tone: 'danger', message: error }); return null; }
    const createdId = await createKnowledgeTopic(buildInput('draft'), profile?.id ?? '');
    setLocalTopicId(createdId);
    setPublicationStatus('draft');
    return createdId;
  };

  const pickImage = async () => {
    if (altText.trim().length < 3) {
      setNotice({ tone: 'danger', message: 'Descreva a imagem antes de anexá-la.' });
      return;
    }
    if (process.env.EXPO_OS !== 'web') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setNotice({ tone: 'danger', message: 'Autorize o acesso à galeria para anexar imagens.' });
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    setUploading(true);
    setNotice(null);
    try {
      const id = await ensureDraft();
      if (!id) return;
      const uploaded = await uploadKnowledgeImage({ topicId: id, asset: result.assets[0], altText });
      const nextBody = `${body.trim()}\n\n${uploaded.markdownToken}`.trim();
      setBody(nextBody);
      setAltText('');
      if (!topicId) {
        await updateKnowledgeTopic(id, buildInput('draft', nextBody));
        router.replace(`/governance/knowledge/${id}/edit` as Href);
      }
      const detail = await getKnowledgeTopic(id);
      setAttachments(detail.attachments);
      setNotice({ tone: 'success', message: 'Imagem privada anexada. Salve o tópico para confirmar sua posição no texto.' });
    } catch (error: unknown) {
      setNotice({ tone: 'danger', message: error instanceof Error ? error.message : 'Não foi possível anexar a imagem.' });
    } finally {
      setUploading(false);
    }
  };

  const restore = async (revisionId: number) => {
    if (restoreSummary.trim().length < 3) {
      setNotice({ tone: 'danger', message: 'Informe uma justificativa para restaurar a versão.' });
      return;
    }
    setSaving(true);
    try {
      await restoreKnowledgeRevision(revisionId, restoreSummary);
      if (localTopicId) await loadTopic(localTopicId);
      setNotice({ tone: 'success', message: 'Versão restaurada e registrada no histórico.' });
    } catch {
      setNotice({ tone: 'danger', message: 'A restauração foi recusada.' });
    } finally {
      setSaving(false);
    }
  };

  if (!canEditKnowledge(role)) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.scroll}>
        <InlineNotice testID="knowledge-editor-forbidden" tone="danger" message="Seu perfil possui acesso somente de leitura." />
      </ScrollView>
    );
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>;

  return (
    <ScrollView testID="knowledge-editor-screen" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.scroll}>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <ArrowLeft size={16} color={colors.textSecondary} /><Text style={styles.backText}>Voltar</Text>
      </Pressable>
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 280, gap: 6 }}>
          <Text style={styles.eyebrow}>{localTopicId ? 'ATUALIZAR CONHECIMENTO' : 'NOVO CONHECIMENTO'}</Text>
          <Text style={styles.title}>{localTopicId ? 'Editar tópico' : 'Criar novo tópico'}</Text>
          <Text style={styles.subtitle}>Use Markdown e confira a prévia antes de publicar.</Text>
        </View>
        <View style={styles.actions}>
          {(publicationStatus === 'draft' || !localTopicId) && <AppButton testID="knowledge-save-draft-button" label="Salvar rascunho" variant="secondary" icon={<Save size={16} color={colors.text} />} onPress={() => save('draft')} loading={saving} />}
          <AppButton testID="knowledge-publish-button" label={publicationStatus === 'published' ? 'Salvar alterações' : 'Publicar'} icon={<Eye size={16} color={colors.ink} />} onPress={() => save('published')} loading={saving} />
        </View>
      </View>

      {!!notice && <InlineNotice testID="knowledge-editor-notice" tone={notice.tone} message={notice.message} />}

      <View style={[styles.editorLayout, isWide && styles.editorLayoutWide]}>
        <AppCard testID="knowledge-editor-form" style={styles.formCard}>
          <AppInput testID="knowledge-title-input" label="Título" value={title} onChangeText={(value) => { setTitle(value); if (!localTopicId) setSlug(createKnowledgeSlug(value)); }} placeholder="Qual conhecimento deve ser registrado?" maxLength={160} />
          <AppInput testID="knowledge-slug-input" label="Slug" value={slug} onChangeText={(value) => setSlug(createKnowledgeSlug(value))} placeholder="titulo-do-topico" autoCapitalize="none" />

          <FieldLabel label="Tipo de conteúdo" />
          <View style={styles.chips}>{(Object.keys(kindLabels) as KnowledgeTopicKind[]).map((item) => <Chip key={item} label={kindLabels[item]} selected={kind === item} onPress={() => setKind(item)} />)}</View>
          <FieldLabel label="Categoria" />
          <View style={styles.chips}>{categories.map((category) => <Chip key={category.id} label={category.name} selected={categoryId === category.id} onPress={() => setCategoryId(category.id)} />)}</View>
          <AppInput testID="knowledge-tags-input" label="Tags" value={tags} onChangeText={setTags} placeholder="rls, auditoria, suporte" hint="Separe por vírgulas; serão mantidas até 10 tags." />

          <View style={styles.fieldGroup}>
            <FieldLabel label="Conteúdo em Markdown" />
            <TextInput
              testID="knowledge-body-input"
              value={body}
              onChangeText={setBody}
              placeholder="# Título\n\nDescreva o procedimento…"
              placeholderTextColor={colors.textMuted}
              multiline
              textAlignVertical="top"
              style={styles.markdownInput}
            />
          </View>

          <View style={styles.attachmentBox}>
            <View style={{ flex: 1, minWidth: 220, gap: 5 }}>
              <Text style={styles.fieldLabel}>Imagem privada</Text>
              <Text style={styles.helper}>JPEG, PNG ou WebP, até 5 MB. Não envie segredos ou dados pessoais.</Text>
            </View>
            <AppInput testID="knowledge-image-alt-input" label="Texto alternativo" value={altText} onChangeText={setAltText} placeholder="Descreva o que aparece" containerStyle={{ flex: 1, minWidth: 220 }} />
            <AppButton testID="knowledge-image-upload-button" label="Anexar imagem" variant="secondary" icon={<ImagePlus size={16} color={colors.text} />} onPress={pickImage} loading={uploading} />
          </View>

          {localTopicId && publicationStatus === 'published' && (
            <AppInput testID="knowledge-change-summary-input" label="Resumo da alteração" value={changeSummary} onChangeText={setChangeSummary} placeholder="Ex.: Atualiza política de retenção" hint="Obrigatório para modificar conteúdo publicado." maxLength={240} />
          )}
        </AppCard>

        <AppCard testID="knowledge-editor-preview" style={styles.previewCard}>
          <View style={styles.previewHeader}><Eye size={17} color={colors.brand} /><Text style={styles.previewTitle}>Prévia segura</Text></View>
          {body.trim() ? <KnowledgeMarkdown testID="knowledge-editor-markdown-preview" markdown={body} attachments={attachments} /> : <Text style={styles.helper}>A prévia aparecerá quando você começar a escrever.</Text>}
        </AppCard>
      </View>

      {localTopicId && revisions.length > 0 && (
        <AppCard testID="knowledge-history-card" style={styles.historyCard}>
          <View style={styles.previewHeader}><History size={17} color={colors.brand} /><Text style={styles.previewTitle}>Histórico de versões</Text></View>
          {isKnowledgeOwner(role) && <AppInput testID="knowledge-restore-summary-input" label="Justificativa de restauração" value={restoreSummary} onChangeText={setRestoreSummary} placeholder="Motivo da restauração" />}
          {revisions.map((revision) => (
            <View key={revision.id} style={styles.revisionRow}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.revisionTitle}>Versão {revision.revision_number}</Text>
                <Text selectable style={styles.helper}>{revision.change_summary} · {revision.changed_by_name} · {formatSafeDateTime(revision.created_at)}</Text>
              </View>
              {isKnowledgeOwner(role) && <AppButton testID={`knowledge-restore-${revision.id}`} label="Restaurar" variant="secondary" size="sm" onPress={() => restore(revision.id)} loading={saving} />}
            </View>
          ))}
        </AppCard>
      )}
    </ScrollView>
  );
}

function FieldLabel({ label }: { label: string }) { return <Text style={styles.fieldLabel}>{label}</Text>; }
function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 20, paddingBottom: 80, gap: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  back: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start' },
  backText: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 12 },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 },
  eyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 1.6 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 28, letterSpacing: -1 },
  subtitle: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 14 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  editorLayout: { gap: 20 },
  editorLayoutWide: { flexDirection: 'row', alignItems: 'flex-start' },
  formCard: { flex: 1.1, gap: 16 },
  previewCard: { flex: 0.9, gap: 16, minHeight: 360 },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  previewTitle: { color: colors.text, fontFamily: typography.display, fontSize: 17 },
  fieldGroup: { gap: 8 },
  fieldLabel: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 12, letterSpacing: 0.4 },
  markdownInput: { minHeight: 300, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface, padding: 14, color: colors.text, fontFamily: 'monospace', fontSize: 13, lineHeight: 21, outlineStyle: 'none' } as never,
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, paddingHorizontal: 13 },
  chipSelected: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  chipText: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11 },
  chipTextSelected: { color: colors.brand },
  attachmentBox: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.brandBorder, borderRadius: radii.md, backgroundColor: colors.brandSoft, padding: 14 },
  helper: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, lineHeight: 16 },
  historyCard: { gap: 14 },
  revisionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  revisionTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13 },
});
