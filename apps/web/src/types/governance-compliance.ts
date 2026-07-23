import type { GovernanceRole } from './governance-knowledge';

export type GovernanceRequestStatus = 'pending' | 'approved' | 'rejected';
export type VerificationDecision = 'submitted' | 'approved' | 'rejected';
export type PrivacyRequestStatus = 'pending' | 'executed' | 'rejected';

export interface GovernanceRequest {
  id: string;
  requester_id: string;
  requester_name: string;
  requester_email: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  document_number: string | null;
  status: GovernanceRequestStatus;
  rejection_reason: string | null;
  establishment_id: string | null;
  created_at: string;
  reviewed_at: string | null;
  total_count: number;
}

export interface VerificationReview {
  id: string;
  establishment_id: string;
  establishment_name: string;
  document_path: string | null;
  previous_status: string;
  decision: VerificationDecision;
  reason: string;
  reviewer_id: string | null;
  created_at: string;
}

export interface PrivacyRequest {
  id: string;
  target_profile_id: string;
  target_name: string;
  requested_by: string;
  status: PrivacyRequestStatus;
  request_reason: string;
  decision_reason: string | null;
  decided_by: string | null;
  decided_at: string | null;
  executed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GovernanceUser {
  profile_id: string;
  name: string;
  email: string | null;
  role: GovernanceRole;
  granted_at: string;
  updated_at: string;
}

export interface GovernanceMembership {
  id: string;
  profile_id: string;
  profile_name: string;
  profile_email: string | null;
  establishment_id: string;
  establishment_name: string;
  role: 'admin' | 'professional';
  status: 'active' | 'revoked';
  created_at: string;
  revoked_at: string | null;
}

export interface GovernanceInvitation {
  id: string;
  establishment_id: string;
  establishment_name: string;
  invited_email: string;
  role: 'admin' | 'professional';
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expires_at: string;
  created_at: string;
}

export interface SignedKycDocument {
  path: string;
  signedUrl: string;
  expiresAt: string;
  mimeType?: string;
}
