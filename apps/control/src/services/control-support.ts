import { supabase } from '@/services/supabase';
import type { GovernanceRole } from '@/types/control';

export const supportStatuses = [
  'queued',
  'open',
  'in_progress',
  'waiting_user',
  'resolved',
  'closed',
  'sync_failed',
] as const;

export const supportPriorities = ['critical', 'high', 'normal', 'low'] as const;

export const supportCategories = [
  'access_identity',
  'booking',
  'business_operations',
  'billing',
  'marketplace',
  'security_privacy',
  'platform_incident',
  'product_feedback',
  'other',
] as const;

const supportSyncStatuses = ['pending', 'processing', 'synced', 'failed'] as const;
const supportMemberRoles = ['agent', 'lead'] as const;
const governanceRoles = ['SaaS_Viewer', 'SaaS_Editor', 'SaaS_Owner'] as const;
const messageAuthorKinds = ['requester', 'support', 'system'] as const;

export type SupportStatus = (typeof supportStatuses)[number];
export type SupportPriority = (typeof supportPriorities)[number];
export type SupportCategory = (typeof supportCategories)[number];
export type SupportMemberRole = (typeof supportMemberRoles)[number];
export type SupportEscalationLevel = 0 | 1 | 2 | 3;

type SupportSyncStatus = (typeof supportSyncStatuses)[number];
type MessageAuthorKind = (typeof messageAuthorKinds)[number];
type JsonRecord = Record<string, unknown>;

export interface SupportOverviewFilters {
  status: SupportStatus | null;
  priority: SupportPriority | null;
  category: SupportCategory | null;
  limit?: number;
  before?: string | null;
}

export interface SupportOperator {
  profileId: string;
  name: string;
  role: GovernanceRole;
  canManage: boolean;
  teamId: string | null;
  teamCode: string | null;
  teamName: string | null;
  memberRole: SupportMemberRole | null;
  jiraAccountId: string | null;
  active: boolean;
}

export interface SupportCounts {
  total: number;
  queued: number;
  open: number;
  inProgress: number;
  waitingUser: number;
  resolved: number;
  syncFailed: number;
  critical: number;
  slaAtRisk: number;
}

export interface SupportCapabilities {
  enabled: boolean;
  allowNewTickets: boolean;
  syncEnabled: boolean;
  maintenanceMessage: string | null;
}

export interface SupportTicketSummary {
  id: string;
  protocol: string;
  subject: string;
  category: SupportCategory;
  product: string;
  status: SupportStatus;
  priority: SupportPriority;
  escalationLevel: SupportEscalationLevel;
  teamId: string | null;
  teamCode: string | null;
  assigneeProfileId: string | null;
  requesterDisplayName: string | null;
  establishmentId: string | null;
  organizationId: string | null;
  locationLabel: string | null;
  jsmIssueKey: string | null;
  jsmIssueUrl: string | null;
  syncStatus: SupportSyncStatus;
  firstResponseDueAt: string | null;
  firstRespondedAt: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportOverview {
  operator: SupportOperator;
  capabilities: SupportCapabilities | null;
  counts: SupportCounts;
  tickets: SupportTicketSummary[];
  nextCursor: string | null;
}

export interface SupportTicket extends SupportTicketSummary {
  requesterId: string;
  requesterRole: string;
  appointmentId: string | null;
  impact: string;
  subcategory: string | null;
  routingVersion: number;
  resolvedAt: string | null;
  closedAt: string | null;
  lastSyncErrorCode: string | null;
}

export interface SupportMessage {
  id: string;
  authorKind: MessageAuthorKind;
  authorDisplayName: string;
  body: string;
  createdAt: string;
}

export interface SupportEvent {
  id: string;
  eventType: string;
  fromValue: string | null;
  toValue: string | null;
  reason: string | null;
  actorDisplayName: string | null;
  createdAt: string;
}

export interface SupportTicketDetail {
  ticket: SupportTicket;
  messages: SupportMessage[];
  events: SupportEvent[];
}

export type ControlSupportErrorCode =
  | 'aal2_required'
  | 'forbidden'
  | 'invalid_response'
  | 'not_found'
  | 'reason_required'
  | 'unavailable';

export class ControlSupportError extends Error {
  constructor(readonly code: ControlSupportErrorCode) {
    super(code);
    this.name = 'ControlSupportError';
  }
}

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ControlSupportError('invalid_response');
  }
  return value as JsonRecord;
}

function asArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new ControlSupportError('invalid_response');
  return value;
}

function asString(value: unknown, nullable = false): string | null {
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== 'string' || !value.trim()) {
    throw new ControlSupportError('invalid_response');
  }
  return value;
}

function asBoolean(value: unknown, fallback?: boolean): boolean {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'boolean') throw new ControlSupportError('invalid_response');
  return value;
}

function asNonNegativeInteger(value: unknown, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new ControlSupportError('invalid_response');
  }
  return value as number;
}

function asTimestamp(value: unknown, nullable = false): string | null {
  const result = asString(value, nullable);
  if (result !== null && Number.isNaN(Date.parse(result))) {
    throw new ControlSupportError('invalid_response');
  }
  return result;
}

function asEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  nullable = false,
): T[number] | null {
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new ControlSupportError('invalid_response');
  }
  return value as T[number];
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSupportTicketId(value: string | null | undefined): value is string {
  return Boolean(value && uuidPattern.test(value));
}

function asUuid(value: unknown, nullable = false): string | null {
  const result = asString(value, nullable);
  if (result !== null && !uuidPattern.test(result)) {
    throw new ControlSupportError('invalid_response');
  }
  return result;
}

function asHttpsUrl(value: unknown): string | null {
  const result = asString(value, true);
  if (!result) return null;
  try {
    const url = new URL(result);
    if (url.protocol !== 'https:') throw new Error('invalid_protocol');
    return url.toString();
  } catch {
    throw new ControlSupportError('invalid_response');
  }
}

function parseOperator(value: unknown): SupportOperator {
  const payload = asRecord(value);
  const memberRole = asEnum(payload.member_role, supportMemberRoles, true);
  return {
    profileId: asUuid(payload.profile_id) as string,
    name: asString(payload.name) as string,
    role: asEnum(payload.role, governanceRoles) as GovernanceRole,
    canManage: asBoolean(payload.can_manage, false),
    teamId: asUuid(payload.team_id, true),
    teamCode: asString(payload.team_code, true),
    teamName: asString(payload.team_name, true),
    memberRole,
    jiraAccountId: asString(payload.jira_account_id, true),
    active: asBoolean(payload.active, memberRole !== null),
  };
}

function parseCounts(value: unknown): SupportCounts {
  const payload = asRecord(value);
  const queued = asNonNegativeInteger(payload.queued);
  const open = asNonNegativeInteger(payload.open);
  const inProgress = asNonNegativeInteger(payload.in_progress);
  const waitingUser = asNonNegativeInteger(payload.waiting_user);
  const resolved = asNonNegativeInteger(payload.resolved);
  const syncFailed = asNonNegativeInteger(payload.sync_failed);
  return {
    total: asNonNegativeInteger(
      payload.total,
      queued + open + inProgress + waitingUser + resolved + syncFailed,
    ),
    queued,
    open,
    inProgress,
    waitingUser,
    resolved,
    syncFailed,
    critical: asNonNegativeInteger(payload.critical),
    slaAtRisk: asNonNegativeInteger(payload.sla_at_risk),
  };
}

function parseCapabilities(value: unknown): SupportCapabilities | null {
  if (value === null || value === undefined) return null;
  const payload = asRecord(value);
  return {
    enabled: asBoolean(payload.enabled),
    allowNewTickets: asBoolean(payload.allow_new_tickets),
    syncEnabled: asBoolean(payload.sync_enabled),
    maintenanceMessage: asString(payload.maintenance_message, true),
  };
}

function parseEscalationLevel(value: unknown): SupportEscalationLevel {
  const level = asNonNegativeInteger(value);
  if (level > 3) throw new ControlSupportError('invalid_response');
  return level as SupportEscalationLevel;
}

function parseTicketSummary(value: unknown): SupportTicketSummary {
  const payload = asRecord(value);
  return {
    id: asUuid(payload.id) as string,
    protocol: asString(payload.protocol) as string,
    subject: asString(payload.subject) as string,
    category: asEnum(payload.category, supportCategories) as SupportCategory,
    product: asString(payload.product) as string,
    status: asEnum(payload.status, supportStatuses) as SupportStatus,
    priority: asEnum(payload.priority, supportPriorities) as SupportPriority,
    escalationLevel: parseEscalationLevel(payload.escalation_level),
    teamId: asUuid(payload.team_id, true),
    teamCode: asString(payload.team_code, true),
    assigneeProfileId: asUuid(payload.assignee_profile_id, true),
    requesterDisplayName: asString(payload.requester_display_name, true),
    establishmentId: asUuid(payload.establishment_id, true),
    organizationId: asUuid(payload.organization_id, true),
    locationLabel: asString(payload.location_label, true),
    jsmIssueKey: asString(payload.jsm_issue_key, true),
    jsmIssueUrl: asHttpsUrl(payload.jsm_issue_url),
    syncStatus: asEnum(payload.sync_status, supportSyncStatuses) as SupportSyncStatus,
    firstResponseDueAt: asTimestamp(payload.first_response_due_at, true),
    firstRespondedAt: asTimestamp(payload.first_responded_at, true),
    lastMessageAt: asTimestamp(payload.last_message_at, true),
    createdAt: asTimestamp(payload.created_at) as string,
    updatedAt: asTimestamp(payload.updated_at) as string,
  };
}

function parseTicket(value: unknown): SupportTicket {
  const payload = asRecord(value);
  return {
    ...parseTicketSummary(payload),
    requesterId: asUuid(payload.requester_id) as string,
    requesterRole: asString(payload.requester_role) as string,
    // Appointment identifiers are legacy-safe text in the shared schema.
    appointmentId: asString(payload.appointment_id, true),
    impact: asString(payload.impact) as string,
    subcategory: asString(payload.subcategory, true),
    routingVersion: asNonNegativeInteger(payload.routing_version),
    resolvedAt: asTimestamp(payload.resolved_at, true),
    closedAt: asTimestamp(payload.closed_at, true),
    lastSyncErrorCode: asString(payload.last_sync_error_code, true),
  };
}

function parseMessage(value: unknown): SupportMessage | null {
  const payload = asRecord(value);
  if (!asBoolean(payload.is_public)) return null;
  return {
    id: asUuid(payload.id) as string,
    authorKind: asEnum(payload.author_kind, messageAuthorKinds) as MessageAuthorKind,
    authorDisplayName: asString(payload.author_display_name) as string,
    body: asString(payload.body) as string,
    createdAt: asTimestamp(payload.created_at) as string,
  };
}

function parseEvent(value: unknown): SupportEvent {
  const payload = asRecord(value);
  return {
    id: asUuid(payload.id) as string,
    eventType: asString(payload.event_type) as string,
    fromValue: asString(payload.from_value, true),
    toValue: asString(payload.to_value, true),
    reason: asString(payload.reason, true),
    actorDisplayName: asString(payload.actor_display_name, true),
    createdAt: asTimestamp(payload.created_at) as string,
  };
}

export function parseSupportOverview(value: unknown): SupportOverview {
  const payload = asRecord(value);
  return {
    operator: parseOperator(payload.operator),
    capabilities: parseCapabilities(payload.capabilities),
    counts: parseCounts(payload.counts),
    tickets: asArray(payload.tickets).map(parseTicketSummary),
    nextCursor: asString(payload.next_cursor, true),
  };
}

export function parseSupportTicketDetail(value: unknown): SupportTicketDetail {
  const payload = asRecord(value);
  return {
    ticket: parseTicket(payload.ticket),
    messages: asArray(payload.messages).map(parseMessage).filter((item): item is SupportMessage => item !== null),
    events: payload.events === undefined ? [] : asArray(payload.events).map(parseEvent),
  };
}

function mapRpcError(message: string | undefined): ControlSupportError {
  const normalized = message?.toLowerCase() ?? '';
  if (normalized.includes('aal2')) return new ControlSupportError('aal2_required');
  if (normalized.includes('not_found')) return new ControlSupportError('not_found');
  if (normalized.includes('reason')) return new ControlSupportError('reason_required');
  if (normalized.includes('forbidden') || normalized.includes('membership')) {
    return new ControlSupportError('forbidden');
  }
  return new ControlSupportError('unavailable');
}

async function rpc(name: string, args: JsonRecord): Promise<unknown> {
  const result = await (supabase.rpc as any)(name, args);
  if (result.error) throw mapRpcError(result.error.message);
  return result.data;
}

export async function getControlSupportOverview(
  filters: SupportOverviewFilters,
): Promise<SupportOverview> {
  const value = await rpc('get_control_support_overview', {
    target_status: filters.status,
    target_priority: filters.priority,
    target_category: filters.category,
    target_limit: Math.min(Math.max(filters.limit ?? 25, 1), 50),
    target_before: filters.before ?? null,
  });
  return parseSupportOverview(value);
}

export async function getControlSupportTicket(ticketId: string): Promise<SupportTicketDetail> {
  if (!isSupportTicketId(ticketId)) throw new ControlSupportError('not_found');
  return parseSupportTicketDetail(await rpc('get_control_support_ticket', {
    target_ticket_id: ticketId,
  }));
}

export async function reprocessSupportSync(ticketId: string, reason: string): Promise<void> {
  await rpc('reprocess_support_sync', {
    target_ticket_id: ticketId,
    reason: reason.trim(),
  });
}

export async function escalateSupportTicket(
  ticketId: string,
  level: Exclude<SupportEscalationLevel, 0>,
  reason: string,
): Promise<void> {
  await rpc('escalate_support_ticket', {
    target_ticket_id: ticketId,
    target_level: level,
    reason: reason.trim(),
  });
}

export async function configureSupportTeamMember(input: {
  profileId: string;
  jiraAccountId: string;
  role: SupportMemberRole;
  active: boolean;
  reason: string;
}): Promise<void> {
  await rpc('configure_support_team_member', {
    target_profile_id: input.profileId,
    target_jira_account_id: input.jiraAccountId.trim(),
    target_role: input.role,
    target_active: input.active,
    reason: input.reason.trim(),
  });
}

export async function setControlSupportRuntime(input: {
  enabled: boolean;
  allowNewTickets: boolean;
  syncEnabled: boolean;
  maintenanceMessage: string | null;
  reason: string;
}): Promise<void> {
  await rpc('set_control_support_runtime', {
    target_enabled: input.enabled,
    target_allow_new_tickets: input.allowNewTickets,
    target_sync_enabled: input.syncEnabled,
    target_maintenance_message: input.maintenanceMessage?.trim() || null,
    reason: input.reason.trim(),
  });
}
