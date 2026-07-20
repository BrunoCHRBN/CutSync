import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, type Href } from 'expo-router';
import { ArrowLeft, CheckCircle2, Edit3, ImagePlus, MessageSquare, Pin, ShieldCheck } from 'lucide-react-native';
import { useGovernanceAuth } from '../../contexts/governance-auth-context';
import {
  acceptKnowledgeSolution,
  createKnowledgeReply,
  getKnowledgeTopic,
  moderateKnowledgeTopic,
  subscribeToKnowledgeTopics,
  unsubscribeFromKnowledge,
  updateKnowledgeReply,
  uploadKnowledgeImage,
} from '../../services/governance-knowledge';
import {
  canEditKnowledge,
  isKnowledgeOwner,
  isReviewExpired,
  type KnowledgeModerationAction,
  type KnowledgeReply,
  type KnowledgeTopicDetail,
} from '../../types/governance-knowledge';
import { KnowledgeMarkdown } from './knowledge-markdown';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { InlineNotice } from '../ui/InlineNotice';
import { colors, layout, radii, typography } from '../../theme/tokens';

export function KnowledgeTopicDetailScreen({ topicId }: { topicId: string }) {
  const router = useRouter();
  const { profile } = useGovernanceAuth();
  const role = profile?.role ?? 'SaaS_Viewer';
  const [detail, setDetail] = useState<KnowledgeTopicDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replyAlt, setReplyAlt] = useState('');
  const [replyDraftId, setReplyDraftId] = useState<string | null>(null);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editingReplyBody, setEditingReplyBody] = useState('');
  const [replyChangeSummary, setReplyChangeSummary] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDetail(await getKnowledgeTopic(topicId));
    } catch {
      setNotice({ tone: 'danger', message: 'O tópico não existe ou sua função não possui acesso.' });
    } finally {
      setLoading(false);
    }
  }, [topicId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const channel = subscribeToKnowledgeTopics(load);
    return () => { unsubscribeFromKnowledge(channel); };
  }, [load]);

  const replies = useMemo(() => {
    const items = [...(detail?.replies ?? [])];
    return items.sort((a, b) => {
      if (a.id === detail?.topic.accepted_reply_id) return -1;
      if (b.id === detail?.topic.accepted_reply_id) return 1;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [detail]);

  const moderate = async (action: KnowledgeModerationAction) => {
    setWorking(true);
    try {
      await moderateKnowledgeTopic(topicId, action);
      await load();
      setNotice({ tone: 'success', message: 'A moderação foi registrada na auditoria.' });
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível concluir a moderação.' });
    } finally {
      setWorking(false);
    }
  };

  const submitReply = async () => {
    if (!replyBody.trim()) { setNotice({ tone: 'danger', message: 'Escreva a resposta antes de publicar.' }); return; }
    setWorking(true);
    try {
      if (replyDraftId) {
        await updateKnowledgeReply(replyDraftId, replyBody.trim(), 'published');
      } else {
        await createKnowledgeReply(topicId, profile?.id ?? '', replyBody.trim(), 'published');
      }
      setReplyBody('');
      setReplyAlt('');
      setReplyDraftId(null);
      await load();
      setNotice({ tone: 'success', message: 'Resposta publicada.' });
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível publicar a resposta.' });
    } finally {
      setWorking(false);
    }
  };

  const addReplyImage = async () => {
    if (!replyBody.trim()) { setNotice({ tone: 'danger', message: 'Escreva a resposta antes de anexar uma imagem.' }); return; }
    if (replyAlt.trim().length < 3) { setNotice({ tone: 'danger', message: 'Descreva a imagem para torná-la acessível.' }); return; }
    if (process.env.EXPO_OS !== 'web') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { setNotice({ tone: 'danger', message: 'Autorize o acesso à galeria.' }); return; }
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    setWorking(true);
    try {
      const draftId = replyDraftId ?? await createKnowledgeReply(topicId, profile?.id ?? '', replyBody.trim(), 'draft');
      setReplyDraftId(draftId);
      const uploaded = await uploadKnowledgeImage({ topicId, replyId: draftId, asset: result.assets[0], altText: replyAlt });
      const nextBody = `${replyBody.trim()}\n\n${uploaded.markdownToken}`;
      await updateKnowledgeReply(draftId, nextBody, 'draft');
      setReplyBody(nextBody);
      setReplyAlt('');
      await load();
      setNotice({ tone: 'success', message: 'Imagem privada anexada à resposta em rascunho.' });
    } catch (error: unknown) {
      setNotice({ tone: 'danger', message: error instanceof Error ? error.message : 'Não foi possível anexar a imagem.' });
    } finally {
      setWorking(false);
    }
  };

  const acceptSolution = async (replyId: string | null) => {
    setWorking(true);
    try {
      await acceptKnowledgeSolution(topicId, replyId);
      await load();
      setNotice({ tone: 'success', message: replyId ? 'Solução aceita e destacada.' : 'Tópico reaberto.' });
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível alterar a solução aceita.' });
    } finally {
      setWorking(false);
    }
  };

  const saveReplyEdit = async (reply: KnowledgeReply, status: 'published' | 'removed' = 'published') => {
    if (replyChangeSummary.trim().length < 3) { setNotice({ tone: 'danger', message: 'Informe um resumo da alteração da resposta.' }); return; }
    setWorking(true);
    try {
      await updateKnowledgeReply(reply.id, editingReplyBody.trim() || reply.body_markdown, status, replyChangeSummary);
      setEditingReplyId(null);
      setEditingReplyBody('');
      setReplyChangeSummary('');
      await load();
      setNotice({ tone: 'success', message: status === 'removed' ? 'Resposta removida logicamente.' : 'Resposta atualizada com nova versão.' });
    } catch {
      setNotice({ tone: 'danger', message: 'A alteração da resposta foi recusada.' });
    } finally {
      setWorking(false);
    }
  };

  if (loading && !detail) return <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>;
  if (!detail) return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.scroll}>{!!notice && <InlineNotice testID="knowledge-detail-error" tone="danger" message={notice.message} />}</ScrollView>;

  const { topic, attachments } = detail;
  const topicAttachments = attachments.filter((attachment) => !attachment.reply_id);
  const canonical = ['guide', 'procedure', 'decision'].includes(topic.kind);

  return (
    <ScrollView testID="knowledge-topic-detail" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.scroll}>
      <Pressable accessibilityRole="button" onPress={() => router.push('/governance/knowledge')} style={styles.back}>
        <ArrowLeft size={16} color={colors.textSecondary} /><Text style={styles.backText}>Todos os tópicos</Text>
      </Pressable>

      {!!notice && <InlineNotice testID="knowledge-detail-notice" tone={notice.tone} message={notice.message} />}

      <AppCard testID="knowledge-topic-content" style={styles.topicCard}>
        <View style={styles.badges}>
          <Badge label={topic.kind} />
          {topic.is_official && <Badge label="Oficial" tone="success" icon={<ShieldCheck size={12} color={colors.success} />} />}
          {topic.is_pinned && <Badge label="Fixado" icon={<Pin size={12} color={colors.brand} />} />}
          {topic.resolution_status === 'resolved' && <Badge label="Resolvido" tone="info" icon={<CheckCircle2 size={12} color={colors.info} />} />}
          {topic.publication_status !== 'published' && <Badge label={topic.publication_status} tone="warning" />}
          {canonical && !topic.is_official && !topic.reviewed_at && <Badge label="Revisão pendente" tone="warning" />}
          {topic.is_official && isReviewExpired(topic.reviewed_at) && <Badge label="Revisão vencida" tone="warning" />}
        </View>
        <Text selectable style={styles.title}>{topic.title}</Text>
        <Text selectable style={styles.meta}>{topic.category.name} · {topic.author_name} · versão {topic.version} · atualizado em {new Date(topic.updated_at).toLocaleString('pt-BR')}</Text>
        <View style={styles.rule} />
        <KnowledgeMarkdown testID="knowledge-topic-markdown" markdown={topic.body_markdown} attachments={topicAttachments} />

        {canEditKnowledge(role) && (
          <View style={styles.topicActions}>
            <AppButton testID="knowledge-edit-topic-button" label="Editar tópico" variant="secondary" icon={<Edit3 size={16} color={colors.text} />} onPress={() => router.push(`/governance/knowledge/${topicId}/edit` as Href)} />
            {(topic.kind === 'question' || topic.kind === 'incident') && topic.resolution_status === 'resolved' && <AppButton testID="knowledge-reopen-topic-button" label="Reabrir" variant="secondary" onPress={() => acceptSolution(null)} loading={working} />}
            {isKnowledgeOwner(role) && <>
              <AppButton testID="knowledge-official-topic-button" label={topic.is_official ? 'Remover selo' : 'Marcar oficial'} variant={topic.is_official ? 'secondary' : 'success'} onPress={() => moderate(topic.is_official ? 'remove_official' : 'mark_official')} loading={working} />
              <AppButton testID="knowledge-pin-topic-button" label={topic.is_pinned ? 'Desafixar' : 'Fixar'} variant="secondary" onPress={() => moderate(topic.is_pinned ? 'unpin' : 'pin')} loading={working} />
              <AppButton testID="knowledge-archive-topic-button" label={topic.publication_status === 'archived' ? 'Republicar' : 'Arquivar'} variant={topic.publication_status === 'archived' ? 'success' : 'danger'} onPress={() => moderate(topic.publication_status === 'archived' ? 'republish' : 'archive')} loading={working} />
            </>}
          </View>
        )}
      </AppCard>

      <View style={styles.sectionHeader}>
        <View style={{ gap: 5 }}><Text style={styles.sectionTitle}>Discussão e soluções</Text><Text style={styles.subtitle}>{replies.filter((reply) => reply.status === 'published').length} respostas publicadas</Text></View>
        <MessageSquare size={20} color={colors.brand} />
      </View>

      {replies.filter((reply) => reply.status !== 'removed').map((reply) => {
        const accepted = reply.id === topic.accepted_reply_id;
        const canEditReply = isKnowledgeOwner(role) || (role === 'SaaS_Editor' && reply.author_id === profile?.id);
        const replyAttachments = attachments.filter((attachment) => attachment.reply_id === reply.id);
        return (
          <AppCard key={reply.id} testID={`knowledge-reply-${reply.id}`} style={[styles.replyCard, accepted && styles.acceptedReply]}>
            <View style={styles.replyHeader}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text selectable style={styles.replyAuthor}>{reply.author_name}</Text>
                <Text style={styles.meta}>{new Date(reply.created_at).toLocaleString('pt-BR')} · versão {reply.version}{reply.status === 'draft' ? ' · rascunho' : ''}</Text>
              </View>
              {accepted && <Badge label="Solução aceita" tone="success" icon={<CheckCircle2 size={12} color={colors.success} />} />}
            </View>
            {editingReplyId === reply.id ? (
              <View style={styles.editReply}>
                <TextInput value={editingReplyBody} onChangeText={setEditingReplyBody} multiline textAlignVertical="top" style={styles.replyInput} />
                <AppInput testID={`reply-change-summary-${reply.id}`} label="Resumo da alteração" value={replyChangeSummary} onChangeText={setReplyChangeSummary} placeholder="O que foi corrigido?" />
                <View style={styles.topicActions}>
                  <AppButton testID={`reply-save-${reply.id}`} label="Salvar resposta" onPress={() => saveReplyEdit(reply)} loading={working} />
                  <AppButton testID={`reply-cancel-${reply.id}`} label="Cancelar" variant="ghost" onPress={() => setEditingReplyId(null)} />
                  {isKnowledgeOwner(role) && <AppButton testID={`reply-remove-${reply.id}`} label="Remover" variant="danger" onPress={() => saveReplyEdit(reply, 'removed')} loading={working} />}
                </View>
              </View>
            ) : (
              <KnowledgeMarkdown testID={`knowledge-reply-markdown-${reply.id}`} markdown={reply.body_markdown} attachments={replyAttachments} />
            )}
            {canEditKnowledge(role) && editingReplyId !== reply.id && (
              <View style={styles.topicActions}>
                {(topic.kind === 'question' || topic.kind === 'incident') && reply.status === 'published' && !accepted && <AppButton testID={`accept-solution-${reply.id}`} label="Aceitar como solução" variant="success" onPress={() => acceptSolution(reply.id)} loading={working} />}
                {canEditReply && <AppButton testID={`edit-reply-${reply.id}`} label="Editar resposta" variant="secondary" onPress={() => { setEditingReplyId(reply.id); setEditingReplyBody(reply.body_markdown); setReplyChangeSummary(''); }} />}
              </View>
            )}
          </AppCard>
        );
      })}

      {canEditKnowledge(role) && topic.publication_status !== 'archived' && (
        <AppCard testID="knowledge-reply-composer" style={styles.composer}>
          <Text style={styles.sectionTitle}>Adicionar resposta</Text>
          <TextInput
            testID="knowledge-reply-input"
            value={replyBody}
            onChangeText={setReplyBody}
            placeholder="Descreva a solução, evidência ou complemento em Markdown…"
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
            style={styles.replyInput}
          />
          <View style={styles.imageRow}>
            <AppInput testID="knowledge-reply-image-alt" label="Descrição da imagem" value={replyAlt} onChangeText={setReplyAlt} placeholder="Obrigatória ao anexar" containerStyle={{ flex: 1, minWidth: 220 }} />
            <AppButton testID="knowledge-reply-image-button" label="Anexar imagem" variant="secondary" icon={<ImagePlus size={16} color={colors.text} />} onPress={addReplyImage} loading={working} />
          </View>
          <AppButton testID="knowledge-reply-submit" label={replyDraftId ? 'Publicar resposta com anexos' : 'Publicar resposta'} onPress={submitReply} loading={working} />
        </AppCard>
      )}
    </ScrollView>
  );
}

function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: 'neutral' | 'success' | 'info' | 'warning'; icon?: React.ReactNode }) {
  return <View style={[styles.badge, tone === 'success' && styles.badgeSuccess, tone === 'info' && styles.badgeInfo, tone === 'warning' && styles.badgeWarning]}>{icon}<Text style={styles.badgeText}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  scroll: { width: '100%', maxWidth: layout.formMax + 220, alignSelf: 'center', padding: 20, paddingBottom: 80, gap: 18 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  back: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start' },
  backText: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 12 },
  topicCard: { gap: 16, padding: 24 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radii.pill, backgroundColor: colors.canvasSubtle, paddingHorizontal: 9, paddingVertical: 5 },
  badgeSuccess: { backgroundColor: colors.successSoft },
  badgeInfo: { backgroundColor: colors.infoSoft },
  badgeWarning: { backgroundColor: colors.warningSoft },
  badgeText: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11, textTransform: 'uppercase' },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 29, lineHeight: 36, letterSpacing: -1 },
  meta: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, lineHeight: 16 },
  rule: { height: 1, backgroundColor: colors.border },
  topicActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 },
  sectionTitle: { color: colors.text, fontFamily: typography.display, fontSize: 18 },
  subtitle: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12 },
  replyCard: { gap: 14 },
  acceptedReply: { borderColor: colors.success, borderWidth: 1.5, backgroundColor: '#FBFEFB' },
  replyHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  replyAuthor: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 14 },
  editReply: { gap: 12 },
  composer: { gap: 14 },
  replyInput: { minHeight: 160, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: 14, color: colors.text, backgroundColor: colors.surface, fontFamily: 'monospace', fontSize: 13, lineHeight: 21, outlineStyle: 'none' } as never,
  imageRow: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 },
});
