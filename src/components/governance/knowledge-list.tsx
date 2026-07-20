import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { BookOpen, CheckCircle2, MessageSquare, Pin, Plus, Search, Settings2, ShieldCheck } from 'lucide-react-native';
import { useGovernanceAuth } from '../../contexts/governance-auth-context';
import {
  createKnowledgeCategory,
  listKnowledgeCategories,
  searchKnowledgeTopics,
  subscribeToKnowledgeTopics,
  unsubscribeFromKnowledge,
  updateKnowledgeCategory,
} from '../../services/governance-knowledge';
import {
  canEditKnowledge,
  isKnowledgeOwner,
  isReviewExpired,
  type KnowledgeCategory,
  type KnowledgePublicationStatus,
  type KnowledgeTopicKind,
  type KnowledgeTopicListItem,
} from '../../types/governance-knowledge';
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

const statusLabels: Record<KnowledgePublicationStatus, string> = {
  draft: 'Rascunhos',
  published: 'Publicados',
  archived: 'Arquivados',
};

export function KnowledgeList() {
  const router = useRouter();
  const { profile } = useGovernanceAuth();
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [topics, setTopics] = useState<KnowledgeTopicListItem[]>([]);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [kind, setKind] = useState<KnowledgeTopicKind | null>(null);
  const [status, setStatus] = useState<KnowledgePublicationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [manageCategories, setManageCategories] = useState(false);
  const role = profile?.role ?? 'SaaS_Viewer';

  const loadCategories = useCallback(async () => {
    const result = await listKnowledgeCategories(isKnowledgeOwner(role));
    setCategories(result);
  }, [role]);

  const loadTopics = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    try {
      setTopics(await searchKnowledgeTopics({
        query: debouncedQuery,
        categoryId,
        kind,
        status,
        pageSize: 50,
      }));
    } catch {
      setNotice('Não foi possível carregar os tópicos. Confirme se a migration do fórum foi aplicada.');
    } finally {
      setLoading(false);
    }
  }, [categoryId, debouncedQuery, kind, status]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    loadCategories().catch(() => setNotice('Não foi possível carregar as categorias.'));
  }, [loadCategories]);

  useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  useEffect(() => {
    const channel = subscribeToKnowledgeTopics(loadTopics);
    return () => {
      unsubscribeFromKnowledge(channel);
    };
  }, [loadTopics]);

  const resultLabel = useMemo(() => {
    if (loading) return 'Buscando conhecimento…';
    if (!topics.length) return 'Nenhum tópico encontrado';
    const total = topics[0]?.total_count ?? topics.length;
    return `${total} ${total === 1 ? 'tópico encontrado' : 'tópicos encontrados'}`;
  }, [loading, topics]);

  return (
    <FlatList
      testID="governance-knowledge-list"
      data={topics}
      keyExtractor={(item) => item.id}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={(
        <View style={styles.headerContent}>
          <View style={styles.pageHeader}>
            <View style={styles.pageCopy}>
              <Text style={styles.eyebrow}>CONHECIMENTO OPERACIONAL</Text>
              <Text style={styles.title}>Base de Conhecimento</Text>
              <Text style={styles.subtitle}>Discussões, soluções e procedimentos oficiais da Governança do CutSync.</Text>
            </View>
            <View style={styles.headerActions}>
              {isKnowledgeOwner(role) && (
                <AppButton
                  testID="knowledge-manage-categories-button"
                  label="Categorias"
                  variant="secondary"
                  icon={<Settings2 size={16} color={colors.text} />}
                  onPress={() => setManageCategories((value) => !value)}
                />
              )}
              {canEditKnowledge(role) && (
                <AppButton
                  testID="knowledge-new-topic-button"
                  label="Novo tópico"
                  icon={<Plus size={17} color={colors.ink} />}
                  onPress={() => router.push('/governance/knowledge/new')}
                />
              )}
            </View>
          </View>

          {manageCategories && isKnowledgeOwner(role) && (
            <CategoryManager
              categories={categories}
              authorId={profile?.id ?? ''}
              onChanged={loadCategories}
            />
          )}

          <AppCard testID="knowledge-search-card" style={styles.filters}>
            <AppInput
              testID="knowledge-search-input"
              label="Pesquisar"
              value={query}
              onChangeText={setQuery}
              placeholder="Título, conteúdo ou tag"
              icon={<Search size={17} color={colors.textMuted} />}
            />
            <FilterRow label="Categoria">
              <FilterChip label="Todas" selected={!categoryId} onPress={() => setCategoryId(null)} />
              {categories.filter((item) => item.is_active).map((category) => (
                <FilterChip key={category.id} label={category.name} selected={categoryId === category.id} onPress={() => setCategoryId(category.id)} />
              ))}
            </FilterRow>
            <FilterRow label="Tipo">
              <FilterChip label="Todos" selected={!kind} onPress={() => setKind(null)} />
              {(Object.keys(kindLabels) as KnowledgeTopicKind[]).map((item) => (
                <FilterChip key={item} label={kindLabels[item]} selected={kind === item} onPress={() => setKind(item)} />
              ))}
            </FilterRow>
            {canEditKnowledge(role) && (
              <FilterRow label="Publicação">
                <FilterChip label="Todos" selected={!status} onPress={() => setStatus(null)} />
                {(Object.keys(statusLabels) as KnowledgePublicationStatus[]).map((item) => (
                  <FilterChip key={item} label={statusLabels[item]} selected={status === item} onPress={() => setStatus(item)} />
                ))}
              </FilterRow>
            )}
          </AppCard>

          {!!notice && <InlineNotice testID="knowledge-list-error" tone="danger" title="Base indisponível" message={notice} />}
          <Text style={styles.resultLabel}>{resultLabel}</Text>
        </View>
      )}
      ListEmptyComponent={loading ? <ActivityIndicator color={colors.brand} style={styles.loader} /> : (
        <AppCard testID="knowledge-empty-state" style={styles.empty}>
          <BookOpen size={28} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Nenhum conteúdo neste recorte</Text>
          <Text style={styles.emptyText}>Altere os filtros ou crie o primeiro tópico para esta categoria.</Text>
        </AppCard>
      )}
      renderItem={({ item }) => (
        <TopicCard
          topic={item}
          onPress={() => router.push(`/governance/knowledge/${item.id}` as Href)}
        />
      )}
    />
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.filterRow}>
      <Text style={styles.filterLabel}>{label}</Text>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function TopicCard({ topic, onPress }: { topic: KnowledgeTopicListItem; onPress: () => void }) {
  const canonical = ['guide', 'procedure', 'decision'].includes(topic.kind);
  const reviewExpired = topic.is_official && isReviewExpired(topic.reviewed_at);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Abrir tópico ${topic.title}`} onPress={onPress} style={({ pressed }) => [styles.topicPressable, pressed && styles.topicPressed]}>
      <AppCard testID={`knowledge-topic-${topic.id}`} style={styles.topicCard}>
        <View style={styles.topicTop}>
          <View style={styles.topicBadges}>
            <Badge label={kindLabels[topic.kind]} />
            {topic.is_official && <Badge label="Oficial" tone="success" icon={<ShieldCheck size={12} color={colors.success} />} />}
            {topic.resolution_status === 'resolved' && <Badge label="Resolvido" tone="info" icon={<CheckCircle2 size={12} color={colors.info} />} />}
            {topic.publication_status !== 'published' && <Badge label={statusLabels[topic.publication_status]} tone="warning" />}
            {canonical && !topic.is_official && !topic.reviewed_at && <Badge label="Revisão pendente" tone="warning" />}
            {reviewExpired && <Badge label="Revisão vencida" tone="warning" />}
          </View>
          {topic.is_pinned && <Pin size={16} color={colors.brand} />}
        </View>
        <Text selectable style={styles.topicTitle}>{topic.title}</Text>
        <Text numberOfLines={3} style={styles.excerpt}>{topic.excerpt || 'Sem resumo disponível.'}</Text>
        {!!topic.tags.length && (
          <View style={styles.tags}>
            {topic.tags.slice(0, 4).map((tag) => <Text key={tag} style={styles.tag}>#{tag}</Text>)}
          </View>
        )}
        <View style={styles.topicFooter}>
          <Text style={styles.topicMeta}>{topic.category_name} · {topic.author_name} · atualizado em {new Date(topic.updated_at).toLocaleDateString('pt-BR')}</Text>
          <View style={styles.replyCount}><MessageSquare size={14} color={colors.textMuted} /><Text style={styles.topicMeta}>{topic.reply_count}</Text></View>
        </View>
      </AppCard>
    </Pressable>
  );
}

function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: 'neutral' | 'success' | 'info' | 'warning'; icon?: React.ReactNode }) {
  return (
    <View style={[styles.smallBadge, tone === 'success' && styles.smallBadgeSuccess, tone === 'info' && styles.smallBadgeInfo, tone === 'warning' && styles.smallBadgeWarning]}>
      {icon}<Text style={styles.smallBadgeText}>{label}</Text>
    </View>
  );
}

function CategoryManager({ categories, authorId, onChanged }: { categories: KnowledgeCategory[]; authorId: string; onChanged: () => Promise<void> }) {
  const [selected, setSelected] = useState<KnowledgeCategory | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const reset = () => { setSelected(null); setName(''); setDescription(''); setError(''); };
  const save = async () => {
    if (name.trim().length < 2) { setError('Informe um nome para a categoria.'); return; }
    setSaving(true);
    setError('');
    try {
      if (selected) {
        await updateKnowledgeCategory(selected.id, { name, description, is_active: selected.is_active });
      } else {
        await createKnowledgeCategory(name, description, authorId);
      }
      await onChanged();
      reset();
    } catch {
      setError('Não foi possível salvar a categoria. Verifique se o nome já existe.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (category: KnowledgeCategory) => {
    setSaving(true);
    try {
      await updateKnowledgeCategory(category.id, { ...category, is_active: !category.is_active });
      await onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppCard testID="knowledge-category-manager" style={styles.categoryManager}>
      <View style={{ gap: 4 }}><Text style={styles.sectionTitle}>Gerenciar categorias</Text><Text style={styles.subtitle}>Crie, renomeie ou arquive categorias sem apagar o histórico.</Text></View>
      <View style={styles.categoryForm}>
        <AppInput testID="category-name-input" label="Nome" value={name} onChangeText={setName} placeholder="Ex.: Segurança e acesso" error={error || undefined} containerStyle={{ flex: 1, minWidth: 220 }} />
        <AppInput testID="category-description-input" label="Descrição" value={description} onChangeText={setDescription} placeholder="Finalidade da categoria" containerStyle={{ flex: 2, minWidth: 260 }} />
        <AppButton testID="category-save-button" label={selected ? 'Salvar alteração' : 'Adicionar'} onPress={save} loading={saving} />
        {!!selected && <AppButton testID="category-cancel-button" label="Cancelar" variant="ghost" onPress={reset} />}
      </View>
      <View style={styles.categoryRows}>
        {categories.map((category) => (
          <View key={category.id} style={styles.categoryRow}>
            <View style={{ flex: 1, gap: 3 }}><Text style={styles.categoryName}>{category.name}</Text><Text style={styles.topicMeta}>{category.is_active ? 'Ativa' : 'Arquivada'}</Text></View>
            <AppButton testID={`category-edit-${category.id}`} label="Editar" size="sm" variant="secondary" onPress={() => { setSelected(category); setName(category.name); setDescription(category.description || ''); }} />
            <AppButton testID={`category-toggle-${category.id}`} label={category.is_active ? 'Arquivar' : 'Reativar'} size="sm" variant={category.is_active ? 'danger' : 'success'} onPress={() => toggleActive(category)} disabled={saving} />
          </View>
        ))}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  list: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 20, paddingBottom: 80, gap: 14 },
  headerContent: { gap: 20, paddingBottom: 4 },
  pageHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 18 },
  pageCopy: { flex: 1, minWidth: 280, gap: 7 },
  eyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 1.6 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 30, letterSpacing: -1 },
  subtitle: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 14, lineHeight: 21 },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  filters: { gap: 16 },
  filterRow: { gap: 8 },
  filterLabel: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 38, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, paddingHorizontal: 13, backgroundColor: colors.surface },
  chipSelected: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  chipText: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11 },
  chipTextSelected: { color: colors.brand },
  resultLabel: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 12 },
  loader: { paddingVertical: 50 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 40 },
  emptyTitle: { color: colors.text, fontFamily: typography.display, fontSize: 17 },
  emptyText: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 13, textAlign: 'center' },
  topicPressable: { borderRadius: radii.lg },
  topicPressed: { opacity: 0.76 },
  topicCard: { gap: 11 },
  topicTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  topicBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  smallBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radii.pill, backgroundColor: colors.canvasSubtle, paddingHorizontal: 8, paddingVertical: 4 },
  smallBadgeSuccess: { backgroundColor: colors.successSoft },
  smallBadgeInfo: { backgroundColor: colors.infoSoft },
  smallBadgeWarning: { backgroundColor: colors.warningSoft },
  smallBadgeText: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11, textTransform: 'uppercase' },
  topicTitle: { color: colors.text, fontFamily: typography.display, fontSize: 18 },
  excerpt: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 13, lineHeight: 20 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { color: colors.info, fontFamily: typography.bodyStrong, fontSize: 11 },
  topicFooter: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 11, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  topicMeta: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, lineHeight: 16 },
  replyCount: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  categoryManager: { gap: 16 },
  sectionTitle: { color: colors.text, fontFamily: typography.display, fontSize: 18 },
  categoryForm: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 },
  categoryRows: { gap: 8 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  categoryName: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13 },
});
