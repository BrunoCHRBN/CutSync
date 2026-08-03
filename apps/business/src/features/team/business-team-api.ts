import {
  mapBusinessTeamInvitation,
  mapBusinessTeamMember,
  type BusinessInvitationRole,
  type BusinessTeamInvitation,
  type BusinessTeamMember,
} from '@cutsync/database';

import {
  assertUuid,
  BusinessFeatureError,
  callBusinessRpc,
  isRpcRecord,
} from '@/features/connectivity/business-rpc';

export interface BusinessTeamSnapshot {
  members: BusinessTeamMember[];
  invitations: BusinessTeamInvitation[];
}

export interface BusinessTeamInvitationDetails {
  invitationId: string;
  establishmentId: string;
  establishmentName: string;
  role: BusinessInvitationRole;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expiresAt: string;
}

export interface BusinessTeamInvitationAcceptance {
  invitationId: string;
  membershipId: string;
  establishmentId: string;
  status: 'accepted';
}

export interface BusinessInvitationCommandResult {
  invitationId: string;
  establishmentId: string;
  status: 'pending' | 'revoked';
  expiresAt: string | null;
  invitationToken: string | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INVITATION_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

const oneRecord = (value: unknown) => {
  if (isRpcRecord(value)) return value;
  if (Array.isArray(value) && value.length === 1 && isRpcRecord(value[0])) return value[0];
  return null;
};

const mapInvitationCommand = (
  value: unknown,
  tokenRequired: boolean,
): BusinessInvitationCommandResult => {
  const row = oneRecord(value);
  const invitationId = typeof row?.invitationId === 'string' ? row.invitationId : '';
  const establishmentId = typeof row?.establishmentId === 'string' ? row.establishmentId : '';
  const invitationToken = typeof row?.invitationToken === 'string'
    ? row.invitationToken
    : null;
  const expiresAt = typeof row?.expiresAt === 'string' ? row.expiresAt : null;
  const status = row?.status === 'pending' || row?.status === 'revoked' ? row.status : null;
  if (
    !UUID_PATTERN.test(invitationId)
    || !UUID_PATTERN.test(establishmentId)
    || !status
    || (expiresAt !== null && !Number.isFinite(Date.parse(expiresAt)))
    || (tokenRequired && (!invitationToken || !INVITATION_TOKEN_PATTERN.test(invitationToken)))
    || (!tokenRequired && invitationToken !== null)
  ) throw new BusinessFeatureError('invalid_response');
  return { invitationId, establishmentId, status, expiresAt, invitationToken };
};

const mapTeamInvitationAcceptance = (
  value: unknown,
  invitationId: string,
): BusinessTeamInvitationAcceptance => {
  const row = oneRecord(value);
  const result = {
    invitationId: typeof row?.invitationId === 'string' ? row.invitationId : '',
    membershipId: typeof row?.membershipId === 'string' ? row.membershipId : '',
    establishmentId: typeof row?.establishmentId === 'string' ? row.establishmentId : '',
    status: row?.status === 'accepted' ? row.status : null,
  };
  if (
    result.invitationId !== invitationId
    || !UUID_PATTERN.test(result.membershipId)
    || !UUID_PATTERN.test(result.establishmentId)
    || result.status !== 'accepted'
  ) throw new BusinessFeatureError('invalid_response');
  return result as BusinessTeamInvitationAcceptance;
};

const mapAll = <T>(rows: unknown, map: (row: unknown) => T | null) => {
  if (!Array.isArray(rows)) throw new BusinessFeatureError('invalid_response');
  const mapped = rows.flatMap((row) => {
    const item = map(row);
    return item ? [item] : [];
  });
  if (mapped.length !== rows.length) throw new BusinessFeatureError('invalid_response');
  return mapped;
};

export const businessTeamApi = {
  async getMyInvitation(invitationId: string): Promise<BusinessTeamInvitationDetails> {
    const data = await callBusinessRpc('get_my_business_team_invitation', {
      target_invitation_id: assertUuid(invitationId),
    });
    if (!isRpcRecord(data)) throw new BusinessFeatureError('invalid_response');
    const role = data.role;
    const status = data.status;
    const normalizedRole: BusinessInvitationRole | null = role === 'admin' || role === 'professional'
      ? role
      : null;
    const result = {
      invitationId: typeof data.invitationId === 'string' ? data.invitationId : '',
      establishmentId: typeof data.establishmentId === 'string' ? data.establishmentId : '',
      establishmentName: typeof data.establishmentName === 'string' ? data.establishmentName : '',
      role: normalizedRole,
      status: status === 'pending' || status === 'accepted' || status === 'revoked' || status === 'expired'
        ? status
        : null,
      expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : '',
    };
    if (
      result.invitationId !== invitationId
      || !result.establishmentName.trim()
      || !result.role
      || !result.status
      || !Number.isFinite(Date.parse(result.expiresAt))
    ) throw new BusinessFeatureError('invalid_response');
    assertUuid(result.establishmentId);
    return result as BusinessTeamInvitationDetails;
  },

  async acceptMyInvitation(
    invitationId: string,
    requestId: string,
  ): Promise<BusinessTeamInvitationAcceptance> {
    const data = await callBusinessRpc('accept_business_team_invite', {
      target_invitation_id: assertUuid(invitationId),
      target_request_id: assertUuid(requestId),
    });
    return mapTeamInvitationAcceptance(data, invitationId);
  },

  async get(establishmentId: string): Promise<BusinessTeamSnapshot> {
    assertUuid(establishmentId);
    const data = await callBusinessRpc('get_business_team', {
      target_establishment_id: establishmentId,
    });
    if (!isRpcRecord(data)) throw new BusinessFeatureError('invalid_response');
    return {
      members: mapAll(data.members, (row) => isRpcRecord(row)
        ? mapBusinessTeamMember({ ...row, establishmentId })
        : null),
      invitations: mapAll(data.invitations, (row) => isRpcRecord(row)
        ? mapBusinessTeamInvitation({ ...row, establishmentId })
        : null),
    };
  },

  async invite(
    establishmentId: string,
    contact: string,
    role: BusinessInvitationRole,
    requestId: string,
  ) {
    const normalized = contact.trim().toLowerCase();
    if (!normalized || (role !== 'admin' && role !== 'professional')) {
      throw new BusinessFeatureError('invalid_request');
    }
    const data = await callBusinessRpc('create_business_team_invite', {
      target_establishment_id: assertUuid(establishmentId),
      target_contact: normalized,
      target_role: role,
      target_request_id: assertUuid(requestId),
    });
    return mapInvitationCommand(data, true);
  },

  async invitationAction(
    establishmentId: string,
    invitationId: string,
    action: 'resend' | 'revoke',
    requestId: string,
  ) {
    const data = await callBusinessRpc(
      action === 'resend' ? 'resend_business_team_invite' : 'revoke_business_team_invite',
      {
        target_establishment_id: assertUuid(establishmentId),
        target_invitation_id: assertUuid(invitationId),
        target_request_id: assertUuid(requestId),
      },
    );
    return mapInvitationCommand(data, action === 'resend');
  },

  memberStatus(
    establishmentId: string,
    membershipId: string,
    action: 'suspend' | 'reactivate' | 'remove',
    requestId: string,
  ) {
    const name = {
      suspend: 'suspend_business_team_member',
      reactivate: 'reactivate_business_team_member',
      remove: 'remove_business_team_member',
    } as const;
    return callBusinessRpc(name[action], {
      target_establishment_id: assertUuid(establishmentId),
      target_membership_id: assertUuid(membershipId),
      target_request_id: assertUuid(requestId),
    });
  },

  updateCommission(
    establishmentId: string,
    membershipId: string,
    commissionRate: number,
    requestId: string,
  ) {
    if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 1) {
      throw new BusinessFeatureError('invalid_request');
    }
    return callBusinessRpc('update_business_team_commission', {
      target_establishment_id: assertUuid(establishmentId),
      target_membership_id: assertUuid(membershipId),
      target_commission_rate: commissionRate,
      target_request_id: assertUuid(requestId),
    });
  },
};
