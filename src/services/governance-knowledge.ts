import { fetch as expoFetch } from 'expo/fetch';
import type { ImagePickerAsset } from 'expo-image-picker';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabaseGovernance } from './supabaseGovernance';
import type {
  KnowledgeAttachment,
  KnowledgeCategory,
  KnowledgeModerationAction,
  KnowledgeReplyStatus,
  KnowledgeSearchFilters,
  KnowledgeTopicDetail,
  KnowledgeTopicInput,
  KnowledgeTopicListItem,
} from '../types/governance-knowledge';

const KNOWLEDGE_BUCKET = 'governance-kb';
const SIGNED_URL_TTL_SECONDS = 15 * 60;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

function requireData<T>(data: T | null, message: string): T {
  if (data === null) throw new Error(message);
  return data;
}

function normalizeMimeType(mimeType: string | null | undefined): KnowledgeAttachment['mime_type'] {
  const normalized = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
  if (!ALLOWED_IMAGE_TYPES.includes(normalized as KnowledgeAttachment['mime_type'])) {
    throw new Error('Use uma imagem JPEG, PNG ou WebP. Arquivos HEIC, SVG, GIF e vídeos não são aceitos.');
  }
  return normalized as KnowledgeAttachment['mime_type'];
}

export function createKnowledgeSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

export async function listKnowledgeCategories(includeInactive = false): Promise<KnowledgeCategory[]> {
  let query = supabaseGovernance
    .from('governance_kb_categories')
    .select('id, slug, name, description, sort_order, is_active')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (!includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as KnowledgeCategory[];
}

export async function searchKnowledgeTopics(
  filters: KnowledgeSearchFilters,
): Promise<KnowledgeTopicListItem[]> {
  const { data, error } = await supabaseGovernance.rpc('search_governance_kb_topics', {
    search_query: filters.query?.trim() || null,
    filter_category: filters.categoryId || null,
    filter_kind: filters.kind || null,
    filter_status: filters.status || null,
    page_number: filters.page ?? 1,
    page_size: filters.pageSize ?? 20,
  });
  if (error) throw error;
  return (data ?? []) as KnowledgeTopicListItem[];
}

export async function getKnowledgeTopic(topicId: string): Promise<KnowledgeTopicDetail> {
  const { data, error } = await supabaseGovernance.rpc('get_governance_kb_topic', {
    target_topic_id: topicId,
  });
  if (error) throw error;
  const payload = requireData(data, 'Tópico não encontrado.') as unknown as KnowledgeTopicDetail;

  payload.attachments = await Promise.all(
    (payload.attachments ?? []).map(async (attachment) => {
      const { data: signedData, error: signedError } = await supabaseGovernance.storage
        .from(KNOWLEDGE_BUCKET)
        .createSignedUrl(attachment.storage_path, SIGNED_URL_TTL_SECONDS);
      if (signedError) return attachment;
      return { ...attachment, signed_url: signedData.signedUrl };
    }),
  );
  payload.replies ??= [];
  payload.revisions ??= [];
  return payload;
}

export async function createKnowledgeTopic(
  input: KnowledgeTopicInput,
  authorId: string,
): Promise<string> {
  const { data, error } = await supabaseGovernance
    .from('governance_kb_topics')
    .insert({ ...input, author_id: authorId })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateKnowledgeTopic(topicId: string, input: KnowledgeTopicInput): Promise<void> {
  const { error } = await supabaseGovernance
    .from('governance_kb_topics')
    .update(input)
    .eq('id', topicId);
  if (error) throw error;
}

export async function createKnowledgeReply(
  topicId: string,
  authorId: string,
  bodyMarkdown: string,
  status: Exclude<KnowledgeReplyStatus, 'removed'> = 'published',
): Promise<string> {
  const { data, error } = await supabaseGovernance
    .from('governance_kb_replies')
    .insert({ topic_id: topicId, author_id: authorId, body_markdown: bodyMarkdown, status })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateKnowledgeReply(
  replyId: string,
  bodyMarkdown: string,
  status: KnowledgeReplyStatus,
  changeSummary?: string,
): Promise<void> {
  const { error } = await supabaseGovernance
    .from('governance_kb_replies')
    .update({
      body_markdown: bodyMarkdown,
      status,
      last_change_summary: changeSummary?.trim() || null,
    })
    .eq('id', replyId);
  if (error) throw error;
}

export async function acceptKnowledgeSolution(topicId: string, replyId: string | null): Promise<void> {
  const { error } = await supabaseGovernance.rpc('accept_governance_kb_solution', {
    target_topic_id: topicId,
    target_reply_id: replyId,
  });
  if (error) throw error;
}

export async function moderateKnowledgeTopic(
  topicId: string,
  action: KnowledgeModerationAction,
): Promise<void> {
  const { error } = await supabaseGovernance.rpc('moderate_governance_kb_topic', {
    target_topic_id: topicId,
    requested_action: action,
  });
  if (error) throw error;
}

export async function restoreKnowledgeRevision(revisionId: number, summary: string): Promise<void> {
  const { error } = await supabaseGovernance.rpc('restore_governance_kb_revision', {
    target_revision_id: revisionId,
    requested_change_summary: summary.trim(),
  });
  if (error) throw error;
}

export async function createKnowledgeCategory(name: string, description: string, authorId: string): Promise<void> {
  const slug = createKnowledgeSlug(name);
  const { error } = await supabaseGovernance.from('governance_kb_categories').insert({
    name: name.trim(),
    slug,
    description: description.trim() || null,
    created_by: authorId,
  });
  if (error) throw error;
}

export async function updateKnowledgeCategory(
  categoryId: string,
  changes: Pick<KnowledgeCategory, 'name' | 'description' | 'is_active'>,
): Promise<void> {
  const { error } = await supabaseGovernance
    .from('governance_kb_categories')
    .update({
      name: changes.name.trim(),
      description: changes.description?.trim() || null,
      is_active: changes.is_active,
    })
    .eq('id', categoryId);
  if (error) throw error;
}

interface UploadKnowledgeImageInput {
  topicId: string;
  replyId?: string | null;
  asset: ImagePickerAsset;
  altText: string;
}

export async function uploadKnowledgeImage({
  topicId,
  replyId = null,
  asset,
  altText,
}: UploadKnowledgeImageInput): Promise<{ attachmentId: string; markdownToken: string }> {
  const mimeType = normalizeMimeType(asset.mimeType);
  const blob: Blob = asset.file ?? await (await expoFetch(asset.uri)).blob();
  const sizeBytes = asset.fileSize ?? blob.size;
  if (sizeBytes > 5 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 5 MB.');

  const { data: reservationData, error: reservationError } = await supabaseGovernance.rpc(
    'reserve_governance_kb_attachment',
    {
      target_topic_id: topicId,
      target_reply_id: replyId,
      requested_original_name: asset.fileName || `imagem.${mimeType.split('/')[1]}`,
      requested_mime_type: mimeType,
      requested_size_bytes: sizeBytes,
      requested_width: asset.width || null,
      requested_height: asset.height || null,
      requested_alt_text: altText.trim(),
    },
  );
  if (reservationError) throw reservationError;
  const reservation = requireData(reservationData?.[0] ?? null, 'Não foi possível reservar o anexo.');

  const { error: uploadError } = await supabaseGovernance.storage
    .from(KNOWLEDGE_BUCKET)
    .upload(reservation.storage_path, blob, { contentType: mimeType, upsert: false });

  if (uploadError) {
    await supabaseGovernance
      .from('governance_kb_attachments')
      .update({ upload_status: 'failed' })
      .eq('id', reservation.attachment_id);
    throw uploadError;
  }

  const { error: finalizeError } = await supabaseGovernance.rpc('finalize_governance_kb_attachment', {
    target_attachment_id: reservation.attachment_id,
  });
  if (finalizeError) throw finalizeError;

  return {
    attachmentId: reservation.attachment_id,
    markdownToken: `![${altText.trim()}](kb-attachment:${reservation.attachment_id})`,
  };
}

export function subscribeToKnowledgeTopics(onChange: () => void): RealtimeChannel {
  return supabaseGovernance
    .channel('governance-knowledge-topics')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'governance_kb_topics' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'governance_kb_replies' }, onChange)
    .subscribe();
}

export async function unsubscribeFromKnowledge(channel: RealtimeChannel): Promise<void> {
  await supabaseGovernance.removeChannel(channel);
}
