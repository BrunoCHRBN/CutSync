import { supabase } from './supabase';

export type ControlAnalyticsSourceFamily =
  | 'operations'
  | 'people'
  | 'activation'
  | 'support';
export type ControlAnalyticsSourceStatus =
  | 'available'
  | 'partial'
  | 'unavailable';
export type ControlAnalyticsRunStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed';
export type ControlAnalyticsRunType = 'daily' | 'backfill' | 'reprocess';

export interface ControlAnalyticsSourceCoverage {
  family: ControlAnalyticsSourceFamily;
  label: string;
  availableFrom: string;
  status: ControlAnalyticsSourceStatus;
  assessedAt: string;
}

export interface ControlAnalyticsComparisonAvailability {
  rangeDays: 7 | 28 | 90;
  availableOn: string | null;
  available: boolean;
}

export interface ControlAnalyticsRefreshRun {
  id: string;
  runType: ControlAnalyticsRunType;
  start: string;
  end: string;
  status: ControlAnalyticsRunStatus;
  processedDays: number;
  totalDays: number;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface ControlAnalyticsHealth {
  generatedAt: string;
  timezone: string;
  coverageStartDate: string | null;
  earliestCompleteDate: string | null;
  latestCompleteDate: string | null;
  missingDates: string[];
  sourceCoverage: ControlAnalyticsSourceCoverage[];
  comparisonAvailability: ControlAnalyticsComparisonAvailability[];
  queue: {
    pending: number;
    running: number;
    failed: number;
  };
  recentRuns: ControlAnalyticsRefreshRun[];
}

export interface ControlAnalyticsReprocessRequest {
  id: string;
  status: 'pending';
  start: string;
  end: string;
}

export class ControlAnalyticsHealthApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ControlAnalyticsHealthApiError';
  }
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !datePattern.test(value)) {
    throw new ControlAnalyticsHealthApiError(
      'invalid_payload',
      `Data inválida em ${field}.`,
    );
  }
  return value;
}

function parseNullableDate(value: unknown, field: string): string | null {
  return value === null ? null : parseDate(value, field);
}

function parseTimestamp(value: unknown, field: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new ControlAnalyticsHealthApiError(
      'invalid_payload',
      `Timestamp inválido em ${field}.`,
    );
  }
  return value;
}

function parseNullableTimestamp(value: unknown, field: string): string | null {
  return value === null ? null : parseTimestamp(value, field);
}

function parseInteger(value: unknown, field: string): number {
  if (
    typeof value !== 'number'
    || !Number.isInteger(value)
    || value < 0
  ) {
    throw new ControlAnalyticsHealthApiError(
      'invalid_payload',
      `Inteiro inválido em ${field}.`,
    );
  }
  return value;
}

function parseSourceFamily(value: unknown): ControlAnalyticsSourceFamily {
  if (
    value !== 'operations'
    && value !== 'people'
    && value !== 'activation'
    && value !== 'support'
  ) {
    throw new ControlAnalyticsHealthApiError(
      'invalid_payload',
      'Família de dados inválida.',
    );
  }
  return value;
}

function parseSourceStatus(value: unknown): ControlAnalyticsSourceStatus {
  if (
    value !== 'available'
    && value !== 'partial'
    && value !== 'unavailable'
  ) {
    throw new ControlAnalyticsHealthApiError(
      'invalid_payload',
      'Status de fonte inválido.',
    );
  }
  return value;
}

function parseRunStatus(value: unknown): ControlAnalyticsRunStatus {
  if (
    value !== 'pending'
    && value !== 'running'
    && value !== 'succeeded'
    && value !== 'failed'
  ) {
    throw new ControlAnalyticsHealthApiError(
      'invalid_payload',
      'Status de processamento inválido.',
    );
  }
  return value;
}

function parseRunType(value: unknown): ControlAnalyticsRunType {
  if (value !== 'daily' && value !== 'backfill' && value !== 'reprocess') {
    throw new ControlAnalyticsHealthApiError(
      'invalid_payload',
      'Tipo de processamento inválido.',
    );
  }
  return value;
}

export function parseControlAnalyticsHealth(
  value: unknown,
): ControlAnalyticsHealth {
  if (!isRecord(value)) {
    throw new ControlAnalyticsHealthApiError(
      'invalid_payload',
      'A saúde analítica retornou um formato inválido.',
    );
  }
  if (
    !Array.isArray(value.missing_dates)
    || !Array.isArray(value.source_coverage)
    || !Array.isArray(value.comparison_availability)
    || !Array.isArray(value.recent_runs)
    || !isRecord(value.queue)
  ) {
    throw new ControlAnalyticsHealthApiError(
      'invalid_payload',
      'As coleções da saúde analítica são inválidas.',
    );
  }
  if (typeof value.timezone !== 'string' || !value.timezone.trim()) {
    throw new ControlAnalyticsHealthApiError(
      'invalid_payload',
      'Timezone analítico inválido.',
    );
  }

  return {
    generatedAt: parseTimestamp(value.generated_at, 'generated_at'),
    timezone: value.timezone,
    coverageStartDate: parseNullableDate(
      value.coverage_start_date,
      'coverage_start_date',
    ),
    earliestCompleteDate: parseNullableDate(
      value.earliest_complete_date,
      'earliest_complete_date',
    ),
    latestCompleteDate: parseNullableDate(
      value.latest_complete_date,
      'latest_complete_date',
    ),
    missingDates: value.missing_dates.map((date, index) => (
      parseDate(date, `missing_dates.${index}`)
    )),
    sourceCoverage: value.source_coverage.map((source, index) => {
      if (!isRecord(source) || typeof source.label !== 'string') {
        throw new ControlAnalyticsHealthApiError(
          'invalid_payload',
          `Fonte inválida em source_coverage.${index}.`,
        );
      }
      return {
        family: parseSourceFamily(source.family),
        label: source.label,
        availableFrom: parseDate(
          source.available_from,
          `source_coverage.${index}.available_from`,
        ),
        status: parseSourceStatus(source.status),
        assessedAt: parseTimestamp(
          source.assessed_at,
          `source_coverage.${index}.assessed_at`,
        ),
      };
    }),
    comparisonAvailability: value.comparison_availability.map(
      (comparison, index) => {
        if (
          !isRecord(comparison)
          || (
            comparison.range_days !== 7
            && comparison.range_days !== 28
            && comparison.range_days !== 90
          )
          || typeof comparison.available !== 'boolean'
        ) {
          throw new ControlAnalyticsHealthApiError(
            'invalid_payload',
            `Comparação inválida em comparison_availability.${index}.`,
          );
        }
        return {
          rangeDays: comparison.range_days,
          availableOn: parseNullableDate(
            comparison.available_on,
            `comparison_availability.${index}.available_on`,
          ),
          available: comparison.available,
        };
      },
    ),
    queue: {
      pending: parseInteger(value.queue.pending, 'queue.pending'),
      running: parseInteger(value.queue.running, 'queue.running'),
      failed: parseInteger(value.queue.failed, 'queue.failed'),
    },
    recentRuns: value.recent_runs.map((run, index) => {
      if (!isRecord(run) || typeof run.id !== 'string') {
        throw new ControlAnalyticsHealthApiError(
          'invalid_payload',
          `Execução inválida em recent_runs.${index}.`,
        );
      }
      const errorCode = run.error_code;
      if (errorCode !== null && typeof errorCode !== 'string') {
        throw new ControlAnalyticsHealthApiError(
          'invalid_payload',
          `Código de erro inválido em recent_runs.${index}.`,
        );
      }
      return {
        id: run.id,
        runType: parseRunType(run.run_type),
        start: parseDate(run.start, `recent_runs.${index}.start`),
        end: parseDate(run.end, `recent_runs.${index}.end`),
        status: parseRunStatus(run.status),
        processedDays: parseInteger(
          run.processed_days,
          `recent_runs.${index}.processed_days`,
        ),
        totalDays: parseInteger(
          run.total_days,
          `recent_runs.${index}.total_days`,
        ),
        errorCode,
        createdAt: parseTimestamp(
          run.created_at,
          `recent_runs.${index}.created_at`,
        ),
        updatedAt: parseTimestamp(
          run.updated_at,
          `recent_runs.${index}.updated_at`,
        ),
        completedAt: parseNullableTimestamp(
          run.completed_at,
          `recent_runs.${index}.completed_at`,
        ),
      };
    }),
  };
}

function translateHealthError(
  message: string | undefined,
): ControlAnalyticsHealthApiError {
  const normalized = message?.toLowerCase() ?? '';
  if (
    normalized.includes('forbidden')
    || normalized.includes('aal2')
    || normalized.includes('control_owner_required')
  ) {
    return new ControlAnalyticsHealthApiError(
      'forbidden',
      normalized.includes('control_owner_required')
        ? 'Somente o proprietário pode solicitar reprocessamentos.'
        : 'Sua sessão não pode consultar a saúde analítica.',
    );
  }
  if (
    normalized.includes('invalid_analytics_reprocess_range')
    || normalized.includes('analytics_reprocess_range_too_large')
    || normalized.includes('analytics_reprocess_requires_complete_days')
    || normalized.includes('analytics_reprocess_before_source_coverage')
  ) {
    return new ControlAnalyticsHealthApiError(
      'invalid_range',
      'Escolha de 1 a 14 dias completos dentro da cobertura disponível.',
    );
  }
  if (normalized.includes('invalid_analytics_reprocess_reason')) {
    return new ControlAnalyticsHealthApiError(
      'invalid_reason',
      'Informe uma justificativa de 10 a 500 caracteres.',
    );
  }
  if (normalized.includes('analytics_reprocess_overlaps_active_run')) {
    return new ControlAnalyticsHealthApiError(
      'overlap',
      'Já existe um processamento ativo que inclui uma dessas datas.',
    );
  }
  return new ControlAnalyticsHealthApiError(
    'unavailable',
    'Não foi possível acessar a saúde analítica agora.',
  );
}

export async function loadControlAnalyticsHealth(): Promise<ControlAnalyticsHealth> {
  const result = await (supabase.rpc as any)('get_control_analytics_health');
  if (result.error) throw translateHealthError(result.error.message);
  return parseControlAnalyticsHealth(result.data);
}

export async function requestControlAnalyticsReprocess(input: {
  start: string;
  end: string;
  reason: string;
}): Promise<ControlAnalyticsReprocessRequest> {
  const result = await (supabase.rpc as any)(
    'request_control_analytics_reprocess',
    {
      range_start: input.start,
      range_end: input.end,
      reason: input.reason.trim(),
    },
  );
  if (result.error) throw translateHealthError(result.error.message);
  if (
    !isRecord(result.data)
    || typeof result.data.id !== 'string'
    || result.data.status !== 'pending'
  ) {
    throw new ControlAnalyticsHealthApiError(
      'invalid_payload',
      'O servidor não confirmou o reprocessamento.',
    );
  }
  return {
    id: result.data.id,
    status: result.data.status,
    start: parseDate(result.data.start, 'start'),
    end: parseDate(result.data.end, 'end'),
  };
}
