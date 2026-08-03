export class BusinessTeamInvitationActivationError extends Error {
  constructor() {
    super(
      'O convite foi aceito, mas não foi possível ativar a unidade agora. '
      + 'Tente concluir novamente; o aceite não será duplicado.',
    );
    this.name = 'BusinessTeamInvitationActivationError';
  }
}

interface AcceptedInvitation {
  establishmentId: string;
}

interface ConfirmedOperationalContext {
  establishmentId: string;
}

export const activateAcceptedBusinessTeamInvitation = async <T extends AcceptedInvitation>(
  acceptance: T,
  refreshContexts: (
    preferredEstablishmentId?: string,
  ) => Promise<ConfirmedOperationalContext[]>,
  selectEstablishment: (establishmentId: string) => Promise<boolean>,
) => {
  try {
    const refreshedContexts = await refreshContexts(acceptance.establishmentId);
    const hasAcceptedEstablishment = refreshedContexts.some(
      (context) => context.establishmentId === acceptance.establishmentId,
    );
    if (!hasAcceptedEstablishment) throw new BusinessTeamInvitationActivationError();

    const selected = await selectEstablishment(acceptance.establishmentId);
    if (!selected) throw new BusinessTeamInvitationActivationError();
    return acceptance;
  } catch (error) {
    if (error instanceof BusinessTeamInvitationActivationError) throw error;
    throw new BusinessTeamInvitationActivationError();
  }
};
