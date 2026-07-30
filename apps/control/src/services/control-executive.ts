import { supabase } from './supabase';

export {
  createControlMetricRange,
  getSaoPauloDate,
} from './control-executive-range';
export type {
  ControlMetricRangeDays,
} from './control-executive-range';

export type ControlMetricScopeType = 'global' | 'organization' | 'establishment';
export type MetricComparisonStatus =
  | 'available'
  | 'current_incomplete'
  | 'comparison_unavailable'
  | 'source_unavailable'
  | 'no_denominator'
  | 'previous_zero';

export interface ControlMetricScopeOption {
  type: ControlMetricScopeType;
  id: string | null;
  parentId: string | null;
  label: string;
}

export interface MetricComparison {
  value: number | null;
  previous: number | null;
  deltaAbsolute: number | null;
  deltaPercent: number | null;
  comparisonStatus: MetricComparisonStatus;
}

export interface ControlExecutiveSeriesPoint {
  date: string;
  completedAppointments: number | null;
  operatingEstablishments: number | null;
  returningClientsRate: number | null;
  cancellationRate: number | null;
}

export interface ControlExecutiveDashboard {
  generatedAt: string;
  timezone: string;
  definitionVersion: number;
  scope: {
    type: ControlMetricScopeType;
    id: string | null;
    label: string;
  };
  period: { start: string; end: string; days: number };
  comparisonPeriod: { start: string; end: string; days: number };
  kpis: {
    completedAppointments: MetricComparison;
    operatingEstablishments: MetricComparison;
    returningClientsRate: MetricComparison;
  };
  drivers: {
    appointmentsCreated: MetricComparison;
    appointmentsConfirmed: MetricComparison;
    completionRate: MetricComparison;
    approvedEstablishments: MetricComparison;
    activatedEstablishments14d: MetricComparison;
    averageDaysToFirstCompletion: MetricComparison;
    newClients: MetricComparison;
    returningClients: MetricComparison;
    activeProfessionals: MetricComparison;
    activeOwners: MetricComparison;
    activeClients: MetricComparison;
  };
  guardrails: {
    cancellationRate: MetricComparison;
    identifiedClientCoverage: MetricComparison;
    criticalTickets: MetricComparison;
    slaAtRisk: MetricComparison;
    syncFailed: MetricComparison;
  };
  series: ControlExecutiveSeriesPoint[];
  dataQuality: {
    freshnessAt: string | null;
    latestCompleteDate: string | null;
    coverageStartDate: string | null;
    coverageEndDate: string | null;
    missingDays: number;
    missingDates: string[];
    comparisonAvailable: boolean;
    comparisonAvailableOn: Record<'7' | '28' | '90', string | null>;
    sourceCoverage: {
      family: 'operations' | 'people' | 'activation' | 'support';
      label: string;
      availableFrom: string;
      status: 'available' | 'partial' | 'unavailable';
      assessedAt: string;
    }[];
  };
}

export class ControlExecutiveApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ControlExecutiveApiError';
  }
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !datePattern.test(value)) {
    throw new ControlExecutiveApiError('invalid_payload', `Data inválida em ${field}.`);
  }
  return value;
}

function parseTimestamp(value: unknown, field: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new ControlExecutiveApiError('invalid_payload', `Timestamp inválido em ${field}.`);
  }
  return value;
}

function parseFiniteNumber(
  value: unknown,
  field: string,
  { nullable = false, nonNegative = false }: { nullable?: boolean; nonNegative?: boolean } = {},
): number | null {
  if (nullable && value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || (nonNegative && value < 0)) {
    throw new ControlExecutiveApiError('invalid_payload', `Número inválido em ${field}.`);
  }
  return value;
}

function parseInteger(value: unknown, field: string): number {
  const parsed = parseFiniteNumber(value, field, { nonNegative: true });
  if (parsed === null || !Number.isInteger(parsed)) {
    throw new ControlExecutiveApiError('invalid_payload', `Inteiro inválido em ${field}.`);
  }
  return parsed;
}

function parseNullableInteger(value: unknown, field: string): number | null {
  if (value === null) return null;
  return parseInteger(value, field);
}

function parseScopeType(value: unknown): ControlMetricScopeType {
  if (value !== 'global' && value !== 'organization' && value !== 'establishment') {
    throw new ControlExecutiveApiError('invalid_payload', 'Escopo analítico inválido.');
  }
  return value;
}

function parseMetricComparison(value: unknown, field: string): MetricComparison {
  if (!isRecord(value)) {
    throw new ControlExecutiveApiError('invalid_payload', `Comparação inválida em ${field}.`);
  }
  const comparisonStatus = value.comparison_status;
  if (
    comparisonStatus !== 'available'
    && comparisonStatus !== 'current_incomplete'
    && comparisonStatus !== 'comparison_unavailable'
    && comparisonStatus !== 'source_unavailable'
    && comparisonStatus !== 'no_denominator'
    && comparisonStatus !== 'previous_zero'
  ) {
    throw new ControlExecutiveApiError('invalid_payload', `Status inválido em ${field}.`);
  }
  return {
    value: parseFiniteNumber(value.value, `${field}.value`, { nullable: true, nonNegative: true }),
    previous: parseFiniteNumber(value.previous, `${field}.previous`, { nullable: true, nonNegative: true }),
    deltaAbsolute: parseFiniteNumber(value.delta_absolute, `${field}.delta_absolute`, { nullable: true }),
    deltaPercent: parseFiniteNumber(value.delta_percent, `${field}.delta_percent`, { nullable: true }),
    comparisonStatus,
  };
}

function requireRecord(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = parent[key];
  if (!isRecord(value)) {
    throw new ControlExecutiveApiError('invalid_payload', `Objeto ausente em ${key}.`);
  }
  return value;
}

function parsePeriod(value: unknown, field: string) {
  if (!isRecord(value)) {
    throw new ControlExecutiveApiError('invalid_payload', `Período inválido em ${field}.`);
  }
  return {
    start: parseDate(value.start, `${field}.start`),
    end: parseDate(value.end, `${field}.end`),
    days: parseInteger(value.days, `${field}.days`),
  };
}

export function parseControlExecutiveDashboard(value: unknown): ControlExecutiveDashboard {
  if (!isRecord(value)) {
    throw new ControlExecutiveApiError('invalid_payload', 'O painel retornou um formato inválido.');
  }

  const scope = requireRecord(value, 'scope');
  const kpis = requireRecord(value, 'kpis');
  const drivers = requireRecord(value, 'drivers');
  const guardrails = requireRecord(value, 'guardrails');
  const dataQuality = requireRecord(value, 'data_quality');
  if (!Array.isArray(value.series)) {
    throw new ControlExecutiveApiError('invalid_payload', 'A série histórica retornou um formato inválido.');
  }

  const scopeId = scope.id;
  if (scopeId !== null && typeof scopeId !== 'string') {
    throw new ControlExecutiveApiError('invalid_payload', 'Identificador de escopo inválido.');
  }
  if (typeof scope.label !== 'string' || !scope.label.trim()) {
    throw new ControlExecutiveApiError('invalid_payload', 'Nome de escopo inválido.');
  }
  if (typeof value.timezone !== 'string' || !value.timezone.trim()) {
    throw new ControlExecutiveApiError('invalid_payload', 'Timezone analítico inválido.');
  }
  if (typeof dataQuality.comparison_available !== 'boolean') {
    throw new ControlExecutiveApiError('invalid_payload', 'Disponibilidade da comparação inválida.');
  }
  if (
    !Array.isArray(dataQuality.missing_dates)
    || !Array.isArray(dataQuality.source_coverage)
    || !isRecord(dataQuality.comparison_available_on)
  ) {
    throw new ControlExecutiveApiError(
      'invalid_payload',
      'Detalhes de cobertura analítica inválidos.',
    );
  }

  const comparisonAvailableOn = dataQuality.comparison_available_on;
  const parseSourceFamily = (
    source: unknown,
    index: number,
  ): ControlExecutiveDashboard['dataQuality']['sourceCoverage'][number] => {
    if (
      !isRecord(source)
      || (
        source.family !== 'operations'
        && source.family !== 'people'
        && source.family !== 'activation'
        && source.family !== 'support'
      )
      || typeof source.label !== 'string'
      || (
        source.status !== 'available'
        && source.status !== 'partial'
        && source.status !== 'unavailable'
      )
    ) {
      throw new ControlExecutiveApiError(
        'invalid_payload',
        `Fonte analítica inválida em ${index}.`,
      );
    }
    return {
      family: source.family,
      label: source.label,
      availableFrom: parseDate(
        source.available_from,
        `data_quality.source_coverage.${index}.available_from`,
      ),
      status: source.status,
      assessedAt: parseTimestamp(
        source.assessed_at,
        `data_quality.source_coverage.${index}.assessed_at`,
      ),
    };
  };

  return {
    generatedAt: parseTimestamp(value.generated_at, 'generated_at'),
    timezone: value.timezone,
    definitionVersion: parseInteger(value.definition_version, 'definition_version'),
    scope: {
      type: parseScopeType(scope.type),
      id: scopeId,
      label: scope.label,
    },
    period: parsePeriod(value.period, 'period'),
    comparisonPeriod: parsePeriod(value.comparison_period, 'comparison_period'),
    kpis: {
      completedAppointments: parseMetricComparison(kpis.completed_appointments, 'kpis.completed_appointments'),
      operatingEstablishments: parseMetricComparison(kpis.operating_establishments, 'kpis.operating_establishments'),
      returningClientsRate: parseMetricComparison(kpis.returning_clients_rate, 'kpis.returning_clients_rate'),
    },
    drivers: {
      appointmentsCreated: parseMetricComparison(drivers.appointments_created, 'drivers.appointments_created'),
      appointmentsConfirmed: parseMetricComparison(drivers.appointments_confirmed, 'drivers.appointments_confirmed'),
      completionRate: parseMetricComparison(drivers.completion_rate, 'drivers.completion_rate'),
      approvedEstablishments: parseMetricComparison(drivers.approved_establishments, 'drivers.approved_establishments'),
      activatedEstablishments14d: parseMetricComparison(drivers.activated_establishments_14d, 'drivers.activated_establishments_14d'),
      averageDaysToFirstCompletion: parseMetricComparison(drivers.average_days_to_first_completion, 'drivers.average_days_to_first_completion'),
      newClients: parseMetricComparison(drivers.new_clients, 'drivers.new_clients'),
      returningClients: parseMetricComparison(drivers.returning_clients, 'drivers.returning_clients'),
      activeProfessionals: parseMetricComparison(drivers.active_professionals, 'drivers.active_professionals'),
      activeOwners: parseMetricComparison(drivers.active_owners, 'drivers.active_owners'),
      activeClients: parseMetricComparison(drivers.active_clients, 'drivers.active_clients'),
    },
    guardrails: {
      cancellationRate: parseMetricComparison(guardrails.cancellation_rate, 'guardrails.cancellation_rate'),
      identifiedClientCoverage: parseMetricComparison(guardrails.identified_client_coverage, 'guardrails.identified_client_coverage'),
      criticalTickets: parseMetricComparison(guardrails.critical_tickets, 'guardrails.critical_tickets'),
      slaAtRisk: parseMetricComparison(guardrails.sla_at_risk, 'guardrails.sla_at_risk'),
      syncFailed: parseMetricComparison(guardrails.sync_failed, 'guardrails.sync_failed'),
    },
    series: value.series.map((point, index) => {
      if (!isRecord(point)) {
        throw new ControlExecutiveApiError('invalid_payload', `Ponto inválido na série ${index}.`);
      }
      return {
        date: parseDate(point.date, `series.${index}.date`),
        completedAppointments: parseNullableInteger(
          point.completed_appointments,
          `series.${index}.completed_appointments`,
        ),
        operatingEstablishments: parseNullableInteger(
          point.operating_establishments,
          `series.${index}.operating_establishments`,
        ),
        returningClientsRate: parseFiniteNumber(point.returning_clients_rate, `series.${index}.returning_clients_rate`, { nullable: true, nonNegative: true }),
        cancellationRate: parseFiniteNumber(point.cancellation_rate, `series.${index}.cancellation_rate`, { nullable: true, nonNegative: true }),
      };
    }),
    dataQuality: {
      freshnessAt: dataQuality.freshness_at === null
        ? null
        : parseTimestamp(dataQuality.freshness_at, 'data_quality.freshness_at'),
      latestCompleteDate: dataQuality.latest_complete_date === null
        ? null
        : parseDate(dataQuality.latest_complete_date, 'data_quality.latest_complete_date'),
      coverageStartDate: dataQuality.coverage_start_date === null
        ? null
        : parseDate(dataQuality.coverage_start_date, 'data_quality.coverage_start_date'),
      coverageEndDate: dataQuality.coverage_end_date === null
        ? null
        : parseDate(dataQuality.coverage_end_date, 'data_quality.coverage_end_date'),
      missingDays: parseInteger(dataQuality.missing_days, 'data_quality.missing_days'),
      missingDates: dataQuality.missing_dates.map((date, index) => (
        parseDate(date, `data_quality.missing_dates.${index}`)
      )),
      comparisonAvailable: dataQuality.comparison_available,
      comparisonAvailableOn: {
        '7': comparisonAvailableOn['7'] === null
          ? null
          : parseDate(comparisonAvailableOn['7'], 'data_quality.comparison_available_on.7'),
        '28': comparisonAvailableOn['28'] === null
          ? null
          : parseDate(comparisonAvailableOn['28'], 'data_quality.comparison_available_on.28'),
        '90': comparisonAvailableOn['90'] === null
          ? null
          : parseDate(comparisonAvailableOn['90'], 'data_quality.comparison_available_on.90'),
      },
      sourceCoverage: dataQuality.source_coverage.map(parseSourceFamily),
    },
  };
}

export function parseControlMetricScopes(value: unknown): ControlMetricScopeOption[] {
  if (!Array.isArray(value)) {
    throw new ControlExecutiveApiError('invalid_payload', 'Os escopos retornaram um formato inválido.');
  }
  return value.map((item) => {
    if (!isRecord(item)) {
      throw new ControlExecutiveApiError('invalid_payload', 'Um escopo retornou um formato inválido.');
    }
    const id = item.scope_id;
    const parentId = item.parent_id;
    if ((id !== null && typeof id !== 'string') || (parentId !== null && typeof parentId !== 'string')) {
      throw new ControlExecutiveApiError('invalid_payload', 'Identificador de escopo inválido.');
    }
    if (typeof item.label !== 'string' || !item.label.trim()) {
      throw new ControlExecutiveApiError('invalid_payload', 'Nome de escopo inválido.');
    }
    return {
      type: parseScopeType(item.scope_type),
      id,
      parentId,
      label: item.label,
    };
  });
}

function translateExecutiveError(message: string | undefined): ControlExecutiveApiError {
  const normalized = message?.toLowerCase() ?? '';
  if (normalized.includes('forbidden') || normalized.includes('aal2')) {
    return new ControlExecutiveApiError('forbidden', 'Sua sessão não pode consultar estes indicadores.');
  }
  if (
    normalized.includes('invalid_analytics_range')
    || normalized.includes('analytics_range_too_large')
  ) {
    return new ControlExecutiveApiError('invalid_range', 'Escolha um período completo de até 90 dias.');
  }
  if (normalized.includes('analytics_range_not_complete')) {
    return new ControlExecutiveApiError(
      'incomplete_range',
      'O período deve terminar, no máximo, no dia anterior em America/Sao_Paulo.',
    );
  }
  if (
    normalized.includes('invalid_analytics_scope')
    || normalized.includes('analytics_scope_not_found')
  ) {
    return new ControlExecutiveApiError('invalid_scope', 'O escopo selecionado não está mais disponível.');
  }
  return new ControlExecutiveApiError('unavailable', 'Não foi possível carregar os indicadores agora.');
}

export async function listControlMetricScopes(): Promise<ControlMetricScopeOption[]> {
  const result = await (supabase.rpc as any)('list_control_metric_scopes');
  if (result.error) throw translateExecutiveError(result.error.message);
  return parseControlMetricScopes(result.data);
}

export async function loadControlExecutiveDashboard(input: {
  start: string;
  end: string;
  scopeType: ControlMetricScopeType;
  scopeId: string | null;
}): Promise<ControlExecutiveDashboard> {
  const result = await (supabase.rpc as any)('get_control_executive_dashboard', {
    range_start: input.start,
    range_end: input.end,
    scope_type: input.scopeType,
    scope_id: input.scopeId,
  });
  if (result.error) throw translateExecutiveError(result.error.message);
  return parseControlExecutiveDashboard(result.data);
}
