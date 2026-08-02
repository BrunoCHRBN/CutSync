import {
  supportCategories,
  supportPriorities,
  supportStatuses,
  type SupportCategory,
  type SupportPriority,
  type SupportStatus,
} from '@/services/control-support';
import type { SupportSlaFilter, SupportSortKey } from '@/modules/support/support-labels';

export type SupportQueueParams = {
  q: string;
  status: SupportStatus | null;
  priority: SupportPriority | null;
  category: SupportCategory | null;
  sla: SupportSlaFilter;
  sort: SupportSortKey;
  page: number;
  pageSize: number;
};

const SORT_KEYS: SupportSortKey[] = ['updated', 'sla', 'priority', 'status'];
const SLA_KEYS: SupportSlaFilter[] = ['all', 'at_risk', 'ok'];
const PAGE_SIZES = [10, 20, 50] as const;

function one(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function parseEnum<T extends string>(
  value: string | null,
  allowed: readonly T[],
): T | null {
  if (!value) return null;
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

export function parseSupportQueueParams(
  raw: Record<string, string | string[] | undefined>,
): SupportQueueParams {
  const pageRaw = Number.parseInt(one(raw.page) ?? '1', 10);
  const sizeRaw = Number.parseInt(one(raw.pageSize) ?? '20', 10);
  const sla = parseEnum(one(raw.sla), SLA_KEYS) ?? 'all';
  const sort = parseEnum(one(raw.sort), SORT_KEYS) ?? 'updated';
  return {
    q: (one(raw.q) ?? '').trim(),
    status: parseEnum(one(raw.status), supportStatuses),
    priority: parseEnum(one(raw.priority), supportPriorities),
    category: parseEnum(one(raw.category), supportCategories),
    sla,
    sort,
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(sizeRaw) ? sizeRaw : 20,
  };
}

/** Params suitable for router.setParams / Link href (omit defaults). */
export function serializeSupportQueueParams(
  params: SupportQueueParams,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (params.q) out.q = params.q;
  if (params.status) out.status = params.status;
  if (params.priority) out.priority = params.priority;
  if (params.category) out.category = params.category;
  if (params.sla !== 'all') out.sla = params.sla;
  if (params.sort !== 'updated') out.sort = params.sort;
  if (params.page > 1) out.page = String(params.page);
  if (params.pageSize !== 20) out.pageSize = String(params.pageSize);
  return out;
}

export function supportTicketHref(
  ticketId: string,
  queue?: SupportQueueParams,
  tab?: string,
): {
  pathname: '/suporte/atendimentos/[ticketId]';
  params: Record<string, string>;
} {
  return {
    pathname: '/suporte/atendimentos/[ticketId]',
    params: {
      ticketId,
      ...(queue ? serializeSupportQueueParams(queue) : {}),
      ...(tab ? { tab } : {}),
    },
  };
}

export function supportQueueHref(queue?: SupportQueueParams): {
  pathname: '/suporte/atendimentos';
  params?: Record<string, string>;
} {
  const params = queue ? serializeSupportQueueParams(queue) : {};
  return Object.keys(params).length
    ? { pathname: '/suporte/atendimentos', params }
    : { pathname: '/suporte/atendimentos' };
}

/** Params for router.setParams — explicitly clears omitted filter keys. */
export function supportQueueSetParams(
  params: SupportQueueParams,
): Record<string, string | undefined> {
  const serialized = serializeSupportQueueParams(params);
  return {
    q: serialized.q,
    status: serialized.status,
    priority: serialized.priority,
    category: serialized.category,
    sla: serialized.sla,
    sort: serialized.sort,
    page: serialized.page,
    pageSize: serialized.pageSize,
  };
}

/** Placeholder UUID used only for static HTML shell generation (not a real ticket). */
export const SUPPORT_TICKET_STATIC_SHELL_ID = '00000000-0000-4000-8000-000000000000';

export const SUPPORT_PAGE_SIZES = PAGE_SIZES;
