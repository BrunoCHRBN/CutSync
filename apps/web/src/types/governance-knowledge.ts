export type GovernanceRole = 'SaaS_Viewer' | 'SaaS_Editor' | 'SaaS_Owner';

export type KnowledgeTopicKind = 'question' | 'guide' | 'procedure' | 'decision' | 'incident';
export type KnowledgePublicationStatus = 'draft' | 'published' | 'archived';
export type KnowledgeResolutionStatus = 'open' | 'resolved' | null;
export type KnowledgeReplyStatus = 'draft' | 'published' | 'removed';

export interface KnowledgeCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface KnowledgeTopicListItem {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  kind: KnowledgeTopicKind;
  tags: string[];
  publication_status: KnowledgePublicationStatus;
  resolution_status: KnowledgeResolutionStatus;
  is_official: boolean;
  is_pinned: boolean;
  reviewed_at: string | null;
  author_name: string;
  category_id: string;
  category_name: string;
  category_slug: string;
  reply_count: number;
  version: number;
  created_at: string;
  updated_at: string;
  total_count: number;
}

export interface KnowledgeAttachment {
  id: string;
  topic_id: string;
  reply_id: string | null;
  storage_path: string;
  original_name: string;
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp';
  size_bytes: number;
  width: number | null;
  height: number | null;
  alt_text: string;
  upload_status: 'pending' | 'ready' | 'failed';
  created_at: string;
  signed_url?: string;
}

export interface KnowledgeReply {
  id: string;
  topic_id: string;
  body_markdown: string;
  author_id: string;
  author_name: string;
  status: KnowledgeReplyStatus;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeRevision {
  id: number;
  entity_type: 'topic' | 'reply';
  entity_id: string;
  revision_number: number;
  snapshot: Record<string, unknown>;
  changed_by: string | null;
  changed_by_name: string;
  change_summary: string;
  created_at: string;
}

export interface KnowledgeTopic {
  id: string;
  slug: string;
  title: string;
  body_markdown: string;
  kind: KnowledgeTopicKind;
  tags: string[];
  publication_status: KnowledgePublicationStatus;
  resolution_status: KnowledgeResolutionStatus;
  accepted_reply_id: string | null;
  is_official: boolean;
  is_pinned: boolean;
  reviewed_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  author_id: string | null;
  author_name: string;
  category: Pick<KnowledgeCategory, 'id' | 'name' | 'slug'>;
}

export interface KnowledgeTopicDetail {
  topic: KnowledgeTopic;
  replies: KnowledgeReply[];
  attachments: KnowledgeAttachment[];
  revisions: KnowledgeRevision[];
}

export interface KnowledgeTopicInput {
  slug: string;
  title: string;
  body_markdown: string;
  category_id: string;
  kind: KnowledgeTopicKind;
  tags: string[];
  publication_status: Exclude<KnowledgePublicationStatus, 'archived'>;
  resolution_status: KnowledgeResolutionStatus;
  last_change_summary?: string | null;
}

export interface KnowledgeSearchFilters {
  query?: string;
  categoryId?: string | null;
  kind?: KnowledgeTopicKind | null;
  status?: KnowledgePublicationStatus | null;
  page?: number;
  pageSize?: number;
}

export type KnowledgeModerationAction =
  | 'mark_official'
  | 'remove_official'
  | 'pin'
  | 'unpin'
  | 'archive'
  | 'republish';

export function canEditKnowledge(role: GovernanceRole): boolean {
  return role === 'SaaS_Editor' || role === 'SaaS_Owner';
}

export function isKnowledgeOwner(role: GovernanceRole): boolean {
  return role === 'SaaS_Owner';
}

export function isReviewExpired(reviewedAt: string | null): boolean {
  if (!reviewedAt) return false;
  return Date.now() - new Date(reviewedAt).getTime() > 90 * 24 * 60 * 60 * 1000;
}
