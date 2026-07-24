import { supabaseGovernance } from './supabaseGovernance';
import type { GovernanceRole } from '../types/governance-knowledge';
import type { GovernanceInvitation, GovernanceMembership, GovernanceRequest, GovernanceUser, PrivacyRequest, SignedKycDocument, VerificationReview } from '../types/governance-compliance';

type RpcResult<T> = { data: T | null; error: { message?: string; code?: string } | null };
const rpc = (name: string, args: Record<string, unknown>) =>
  (supabaseGovernance.rpc as unknown as (fn: string, params: Record<string, unknown>) => Promise<RpcResult<unknown>>)(name, args);

function ensure(error: RpcResult<unknown>['error'], fallback: string): never {
  const message = error?.message || fallback;
  const errors: Record<string, string> = {
    forbidden: 'Você não possui permissão para executar esta ação.',
    request_not_pending: 'A solicitação já foi analisada.',
    approval_reason_required: 'A aprovação exige uma justificativa de 10 a 500 caracteres.',
    rejection_reason_required: 'A rejeição exige uma justificativa de 10 a 500 caracteres.',
    verification_reason_required: 'A revisão exige uma justificativa de 10 a 500 caracteres.',
    privacy_reason_required: 'A justificativa deve ter entre 10 e 500 caracteres.',
    access_reason_required: 'A alteração de acesso exige uma justificativa.',
    last_owner_protected: 'O último SaaS_Owner não pode ser removido ou rebaixado.',
    invalid_kyc_document_path: 'O documento precisa ser PDF, JPEG ou PNG em um caminho privado válido.',
  };
  throw new Error(Object.entries(errors).find(([key]) => message.includes(key))?.[1] || message);
}

export async function listGovernanceRequests(params: { searchTerm?: string; status?: string | null }): Promise<GovernanceRequest[]> {
  const result = await rpc('list_governance_establishment_requests', { search_term: params.searchTerm || null, status_filter: params.status || null, page_size: 100, page_offset: 0 });
  if (result.error) ensure(result.error, 'Não foi possível carregar as solicitações.');
  return ((result.data || []) as Record<string, unknown>[]).map((item) => ({
    ...item,
    masked_document: (item.document_number as string | null) ?? null,
    document_number: undefined,
  })) as unknown as GovernanceRequest[];
}

export async function approveGovernanceRequest(id: string, reason: string) {
  const result = await rpc('approve_governance_establishment_request', { target_request_id: id, reason: reason.trim() });
  if (result.error) ensure(result.error, 'Não foi possível aprovar a solicitação.');
  return (result.data as Array<{ establishment_id: string; invitation_id: string; raw_token: string; invited_email: string; expires_at: string }> | null)?.[0] || null;
}

export async function rejectGovernanceRequest(id: string, reason: string) {
  const result = await rpc('reject_governance_establishment_request', { target_request_id: id, reason: reason.trim() });
  if (result.error) ensure(result.error, 'Não foi possível rejeitar a solicitação.');
}

export async function listVerificationReviews(establishmentId?: string, decision?: string): Promise<VerificationReview[]> {
  const result = await rpc('list_governance_verification_reviews', { target_establishment_id: establishmentId || null, status_filter: decision || null });
  if (result.error) ensure(result.error, 'Não foi possível carregar as verificações.');
  return (result.data || []) as VerificationReview[];
}

export async function submitVerification(establishmentId: string, documentPath: string, reason: string) {
  const result = await rpc('submit_governance_verification', { target_establishment_id: establishmentId, document_path: documentPath, reason: reason.trim() });
  if (result.error) ensure(result.error, 'Não foi possível enviar o documento.');
  return result.data;
}

export async function reviewVerification(reviewId: string, decision: 'approved' | 'rejected', reason: string) {
  const result = await rpc('review_governance_verification', { target_review_id: reviewId, target_decision: decision, reason: reason.trim() });
  if (result.error) ensure(result.error, 'Não foi possível concluir a revisão.');
  return result.data;
}

export async function uploadKycDocument(file: Blob, mimeType: string, establishmentId: string): Promise<SignedKycDocument> {
  const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
  if (!allowed.includes(mimeType)) throw new Error('Tipo de documento não aceito. Use PDF, JPEG ou PNG.');
  if (file.size > 10 * 1024 * 1024) throw new Error('O documento deve ter no máximo 10 MB.');
  const extension = mimeType === 'application/pdf' ? 'pdf' : mimeType === 'image/jpeg' ? 'jpg' : 'png';
  const randomId = `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  const path = `${establishmentId}/${randomId}.${extension}`;
  const { error } = await supabaseGovernance.storage.from('governance-kyc').upload(path, file, { contentType: mimeType, upsert: false });
  if (error) throw new Error('Não foi possível armazenar o documento privado.');
  const signed = await supabaseGovernance.storage.from('governance-kyc').createSignedUrl(path, 300);
  if (signed.error || !signed.data?.signedUrl) throw new Error('Não foi possível gerar a visualização temporária.');
  return { path, signedUrl: signed.data.signedUrl, expiresAt: new Date(Date.now() + 300000).toISOString(), mimeType };
}

export async function getSignedKycDocument(path: string): Promise<SignedKycDocument> {
  const signed = await supabaseGovernance.storage.from('governance-kyc').createSignedUrl(path, 300);
  if (signed.error || !signed.data?.signedUrl) throw new Error('Não foi possível visualizar o documento privado.');
  return { path, signedUrl: signed.data.signedUrl, expiresAt: new Date(Date.now() + 300000).toISOString() };
}

export async function listPrivacyRequests(status?: string): Promise<PrivacyRequest[]> {
  const result = await rpc('list_governance_privacy_requests', { status_filter: status || null });
  if (result.error) ensure(result.error, 'Não foi possível carregar as solicitações LGPD.');
  return (result.data || []) as PrivacyRequest[];
}
export async function submitPrivacyRequest(profileId: string, reason: string) { const result = await rpc('submit_governance_privacy_request', { target_profile_id: profileId, reason: reason.trim() }); if (result.error) ensure(result.error, 'Não foi possível abrir a solicitação LGPD.'); return result.data as PrivacyRequest; }
export async function executePrivacyRequest(id: string, reason: string) {
  const result = await supabaseGovernance.functions.invoke('execute-client-account-deletion', {
    body: { requestId: id, reason: reason.trim() },
  });
  if (result.error) {
    throw new Error('Não foi possível executar a exclusão auditada. Verifique o AAL2 e tente novamente.');
  }
  return result.data as { requestId: string; status: 'executed'; idempotent: boolean };
}
export async function rejectPrivacyRequest(id: string, reason: string) { const result = await rpc('reject_governance_privacy_request', { request_id: id, reason: reason.trim() }); if (result.error) ensure(result.error, 'Não foi possível rejeitar a solicitação LGPD.'); }

export async function listGovernanceUsers(): Promise<GovernanceUser[]> { const result = await rpc('list_governance_users', {}); if (result.error) ensure(result.error, 'Não foi possível carregar os papéis.'); return (result.data || []) as GovernanceUser[]; }
export async function grantGovernanceRole(profileId: string, role: GovernanceRole, reason: string) { const result = await rpc('grant_governance_role', { target_profile_id: profileId, target_role: role, reason: reason.trim() }); if (result.error) ensure(result.error, 'Não foi possível alterar o papel.'); return result.data as GovernanceUser; }
export async function revokeGovernanceRole(profileId: string, reason: string) { const result = await rpc('revoke_governance_role', { target_profile_id: profileId, reason: reason.trim() }); if (result.error) ensure(result.error, 'Não foi possível remover o papel.'); }
export async function listGovernanceMemberships(status?: string): Promise<GovernanceMembership[]> { const result = await rpc('list_governance_memberships', { status_filter: status || null }); if (result.error) ensure(result.error, 'Não foi possível carregar os vínculos.'); return (result.data || []) as GovernanceMembership[]; }
export async function revokeGovernanceMembership(id: string, reason: string) { const result = await rpc('revoke_governance_membership', { target_membership_id: id, reason: reason.trim() }); if (result.error) ensure(result.error, 'Não foi possível revogar o vínculo.'); }
export async function listGovernanceInvitations(status?: string): Promise<GovernanceInvitation[]> { const result = await rpc('list_governance_invitations', { status_filter: status || null }); if (result.error) ensure(result.error, 'Não foi possível carregar os convites.'); return (result.data || []) as GovernanceInvitation[]; }
export async function revokeGovernanceInvitation(id: string, reason: string) { const result = await rpc('revoke_governance_invitation', { target_invitation_id: id, reason: reason.trim() }); if (result.error) ensure(result.error, 'Não foi possível revogar o convite.'); }
