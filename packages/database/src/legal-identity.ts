export type LegalEntityType = 'person' | 'company';
export type LegalDocumentType = 'CPF' | 'CNPJ';
export type LegalEntityVerificationStatus = 'pending' | 'verified' | 'disputed' | 'rejected';
export type BusinessRegistrationStatus = 'created' | 'unit_added' | 'under_review';
export type IdentityConflictAction = 'link' | 'reject' | 'request_evidence';

export interface MaskedLegalEntityContext {
  legal_entity_id: string;
  entity_type: LegalEntityType;
  document_type: LegalDocumentType;
  masked_document: string;
  verification_status: LegalEntityVerificationStatus;
  organization_id: string | null;
}

export interface BusinessRegistrationInput {
  documentType: LegalDocumentType;
  document: string;
  name: string;
  slug: string;
  address?: string;
  phone?: string;
  primaryColor: string;
}

export interface BusinessRegistrationResult {
  status: BusinessRegistrationStatus;
  establishmentId: string | null;
  organizationId: string | null;
}

export interface IdentityMigrationConflict {
  conflict_id: string;
  legacy_source: 'establishment' | 'establishment_request' | 'manual';
  legacy_record_id: string | null;
  legal_entity_id: string | null;
  organization_id: string | null;
  requester_profile_id: string | null;
  document_type: LegalDocumentType | null;
  masked_document: string | null;
  reason_code:
    | 'secure_backfill_required'
    | 'invalid_legacy_document'
    | 'ambiguous_owner'
    | 'document_claimed_by_another_profile'
    | 'document_claimed_by_another_organization';
  status: 'pending' | 'linked' | 'rejected' | 'evidence_requested';
  created_at: string;
}
