export type GspSurfaceState =
  | 'available'
  | 'partial'
  | 'preparing'
  | 'unavailable'
  | 'error';

export type GspDataState =
  | 'updated'
  | 'stale'
  | 'empty'
  | 'source_missing'
  | 'not_calculated';

export type GspGovernanceState =
  | 'normal'
  | 'attention'
  | 'critical'
  | 'not_calculated';

export type GspAuditResult = 'success' | 'partial' | 'failure' | 'unknown';

export type GspStatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const surfaceLabels: Record<GspSurfaceState, string> = {
  available: 'Disponível',
  partial: 'Parcial',
  preparing: 'Em preparação',
  unavailable: 'Indisponível',
  error: 'Com erro',
};

const dataLabels: Record<GspDataState, string> = {
  updated: 'Atualizado',
  stale: 'Desatualizado',
  empty: 'Sem dados',
  source_missing: 'Fonte não conectada',
  not_calculated: 'Não calculado',
};

const governanceLabels: Record<GspGovernanceState, string> = {
  normal: 'Normal',
  attention: 'Atenção',
  critical: 'Crítico',
  not_calculated: 'Não calculado',
};

const auditResultLabels: Record<GspAuditResult, string> = {
  success: 'Sucesso',
  partial: 'Parcial',
  failure: 'Falha',
  unknown: 'Indeterminado',
};

export function labelForSurfaceState(state: GspSurfaceState): string {
  return surfaceLabels[state];
}

export function labelForDataState(state: GspDataState): string {
  return dataLabels[state];
}

export function labelForGovernanceState(state: GspGovernanceState): string {
  return governanceLabels[state];
}

export function labelForAuditResult(result: GspAuditResult): string {
  return auditResultLabels[result];
}

/** Tone for UI badges — preparing/not_calculated stay neutral/info, never danger. */
export function toneForSurfaceState(state: GspSurfaceState): GspStatusTone {
  switch (state) {
    case 'available':
      return 'success';
    case 'partial':
      return 'info';
    case 'preparing':
      return 'info';
    case 'unavailable':
      return 'neutral';
    case 'error':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function toneForDataState(state: GspDataState): GspStatusTone {
  switch (state) {
    case 'updated':
      return 'success';
    case 'stale':
      return 'warning';
    case 'empty':
      return 'neutral';
    case 'source_missing':
      return 'info';
    case 'not_calculated':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function toneForGovernanceState(state: GspGovernanceState): GspStatusTone {
  switch (state) {
    case 'normal':
      return 'success';
    case 'attention':
      return 'warning';
    case 'critical':
      return 'danger';
    case 'not_calculated':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function toneForAuditResult(result: GspAuditResult): GspStatusTone {
  switch (result) {
    case 'success':
      return 'success';
    case 'partial':
      return 'warning';
    case 'failure':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function describeDataState(state: GspDataState): string {
  switch (state) {
    case 'not_calculated':
      return 'O indicador será calculado quando as fontes necessárias estiverem disponíveis.';
    case 'source_missing':
      return 'A fonte de dados ainda não está conectada a este console.';
    case 'empty':
      return 'Nenhum registro disponível nesta sessão.';
    case 'stale':
      return 'Os dados podem estar desatualizados. Atualize a consulta.';
    default:
      return 'Dados atualizados na sessão atual.';
  }
}
