import { supabase } from '@/services/supabase';
import type { GovernanceRole } from '@/types/control';

export interface ControlAccessProfile {
  profileId: string;
  name: string;
  email: string;
}

export interface ControlAccessUser extends ControlAccessProfile {
  role: GovernanceRole;
  isActive: boolean;
  expiresAt: string | null;
  grantedAt: string;
  revokedAt: string | null;
}

type ServiceError = {
  message?: string;
  code?: string;
  details?: string;
};

type ControlRpc = (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: ServiceError | null }>;

const governanceRoles: GovernanceRole[] = [
  'SaaS_Viewer',
  'SaaS_Editor',
  'SaaS_Owner',
];

const errorMessages: Record<string, string> = {
  access_expiry_invalid: 'Escolha uma data de expiração futura.',
  access_reason_required: 'Informe uma justificativa entre 10 e 500 caracteres.',
  aal2_required: 'Confirme o autenticador para realizar esta operação.',
  authentication_required: 'Sua sessão expirou. Entre novamente para continuar.',
  control_aal2_required: 'Confirme o autenticador para acessar o CutSync Control.',
  forbidden: 'Somente um proprietário ativo pode administrar os acessos.',
  governance_user_not_active: 'Este acesso já está inativo. Atualize a lista e tente novamente.',
  last_owner_protected:
    'O último proprietário ativo não pode ser rebaixado, receber expiração ou ser revogado.',
  profile_email_ambiguous: 'Mais de uma conta corresponde ao e-mail informado. Solicite uma revisão cadastral.',
  profile_email_required: 'Informe o e-mail exato de uma conta CutSync existente.',
  profile_not_found: 'Nenhuma conta CutSync foi encontrada com esse e-mail.',
  PGRST202: 'A gestão de acessos ainda não está disponível neste ambiente.',
};

export class ControlAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ControlAccessError';
  }
}

function findKnownError(value: string): string | null {
  const normalized = value.toLowerCase();
  const code = Object.keys(errorMessages).find((candidate) => (
    normalized.includes(candidate.toLowerCase())
  ));
  return code ? errorMessages[code] : null;
}

export function getControlAccessErrorMessage(
  error: unknown,
  fallback = 'Não foi possível concluir a operação. Tente novamente.',
): string {
  if (error instanceof ControlAccessError) return error.message;
  if (!error || typeof error !== 'object') return fallback;

  const serviceError = error as ServiceError;
  return findKnownError(
    `${serviceError.code ?? ''} ${serviceError.message ?? ''} ${serviceError.details ?? ''}`,
  ) ?? fallback;
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ControlAccessError('Os dados de acesso retornaram em um formato inesperado.');
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ControlAccessError('Os dados de acesso retornaram em um formato inesperado.');
  }
  return value;
}

function allowEmptyString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ControlAccessError('Os dados de acesso retornaram em um formato inesperado.');
  }
  return value;
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return requireString(value);
}

function parseGovernanceRole(value: unknown): GovernanceRole {
  if (!governanceRoles.includes(value as GovernanceRole)) {
    throw new ControlAccessError('Os dados de acesso retornaram em um formato inesperado.');
  }
  return value as GovernanceRole;
}

export function parseControlAccessProfile(value: unknown): ControlAccessProfile {
  const record = requireRecord(value);
  return {
    profileId: requireString(record.profile_id),
    name: requireString(record.name),
    email: requireString(record.email),
  };
}

export function parseControlAccessUser(value: unknown): ControlAccessUser {
  const record = requireRecord(value);
  if (typeof record.is_active !== 'boolean') {
    throw new ControlAccessError('Os dados de acesso retornaram em um formato inesperado.');
  }

  return {
    profileId: requireString(record.profile_id),
    name: requireString(record.name),
    email: allowEmptyString(record.email),
    role: parseGovernanceRole(record.role),
    isActive: record.is_active,
    expiresAt: nullableString(record.expires_at),
    grantedAt: requireString(record.granted_at),
    revokedAt: nullableString(record.revoked_at),
  };
}

export function isControlAccessEffective(
  user: Pick<ControlAccessUser, 'isActive' | 'expiresAt' | 'revokedAt'>,
  now = Date.now(),
): boolean {
  return user.isActive
    && !user.revokedAt
    && (!user.expiresAt || new Date(user.expiresAt).getTime() > now);
}

export function validateControlAccessReason(value: string): string {
  const reason = value.trim();
  if (reason.length < 10 || reason.length > 500) {
    throw new ControlAccessError(errorMessages.access_reason_required);
  }
  return reason;
}

export function normalizeControlAccessEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ControlAccessError('Informe o e-mail exato de uma conta CutSync existente.');
  }
  return email;
}

export function toControlAccessDateInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find((item) => item.type === type)?.value ?? ''
  );
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function parseControlAccessExpiryInput(
  value: string,
  now = Date.now(),
): string | null {
  const dateInput = value.trim();
  if (!dateInput) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    throw new ControlAccessError('Informe a expiração no formato AAAA-MM-DD.');
  }

  const expiration = new Date(`${dateInput}T23:59:59.999-03:00`);
  if (
    !Number.isFinite(expiration.getTime())
    || toControlAccessDateInput(expiration.toISOString()) !== dateInput
    || expiration.getTime() <= now
  ) {
    throw new ControlAccessError(errorMessages.access_expiry_invalid);
  }
  return expiration.toISOString();
}

function rpc(
  name: string,
  args?: Record<string, unknown>,
): ReturnType<ControlRpc> {
  return (supabase.rpc as unknown as ControlRpc)(name, args);
}

function throwRpcError(error: ServiceError | null, fallback: string): void {
  if (error) {
    throw new ControlAccessError(getControlAccessErrorMessage(error, fallback));
  }
}

export async function listControlAccessUsers(): Promise<ControlAccessUser[]> {
  const result = await rpc('list_control_users');
  throwRpcError(result.error, 'Não foi possível consultar os acessos.');
  if (!Array.isArray(result.data)) {
    throw new ControlAccessError('Os dados de acesso retornaram em um formato inesperado.');
  }
  return result.data.map(parseControlAccessUser);
}

export async function findControlProfileByEmail(
  targetEmail: string,
): Promise<ControlAccessProfile | null> {
  const email = normalizeControlAccessEmail(targetEmail);
  const result = await rpc('find_control_profile_by_email', { target_email: email });
  throwRpcError(result.error, 'Não foi possível procurar a conta informada.');
  if (!Array.isArray(result.data) || result.data.length > 1) {
    throw new ControlAccessError('Os dados da conta retornaram em um formato inesperado.');
  }
  return result.data.length === 0 ? null : parseControlAccessProfile(result.data[0]);
}

export async function setControlUserAccess(
  profileId: string,
  role: GovernanceRole,
  expiresAt: string | null,
  reasonValue: string,
): Promise<void> {
  const reason = validateControlAccessReason(reasonValue);
  if (!governanceRoles.includes(role)) {
    throw new ControlAccessError('Selecione um perfil de acesso válido.');
  }
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    throw new ControlAccessError(errorMessages.access_expiry_invalid);
  }

  const result = await rpc('set_control_user_access', {
    target_profile_id: profileId,
    target_role: role,
    target_expires_at: expiresAt,
    reason,
  });
  throwRpcError(result.error, 'Não foi possível atualizar o acesso.');
}

export async function revokeControlUserAccess(
  profileId: string,
  reasonValue: string,
): Promise<void> {
  const reason = validateControlAccessReason(reasonValue);
  const result = await rpc('revoke_control_user_access', {
    target_profile_id: profileId,
    reason,
  });
  throwRpcError(result.error, 'Não foi possível revogar o acesso.');
}
