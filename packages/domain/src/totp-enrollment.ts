type TotpFactorLike = {
  id: string;
  factor_type: string;
  friendly_name?: string;
  status: string;
};

type AuthFailureLike = {
  code?: string;
  message?: string;
};

export type TotpFactorState = {
  verifiedFactorId: string | null;
  unverifiedFactorIds: string[];
};

export const getTotpFactorState = (
  factors: readonly TotpFactorLike[] | null | undefined,
  enrollmentFriendlyName?: string,
): TotpFactorState => {
  const totpFactors = (factors ?? []).filter((factor) => factor.factor_type === 'totp');

  return {
    verifiedFactorId: totpFactors.find((factor) => factor.status === 'verified')?.id ?? null,
    unverifiedFactorIds: totpFactors
      .filter((factor) => (
        factor.status === 'unverified'
        && (!enrollmentFriendlyName || factor.friendly_name === enrollmentFriendlyName)
      ))
      .map((factor) => factor.id),
  };
};

export const getTotpEnrollmentErrorMessage = (
  failure: AuthFailureLike | null | undefined,
): string => {
  switch (failure?.code) {
    case 'mfa_factor_name_conflict':
      return 'Já existe um cadastro incompleto deste autenticador. Tente novamente para gerar um novo QR Code.';
    case 'mfa_totp_enroll_not_enabled':
      return 'O cadastro por aplicativo autenticador está desativado neste ambiente.';
    case 'over_request_rate_limit':
      return 'Muitas tentativas foram realizadas. Aguarde alguns minutos e tente novamente.';
    case 'no_authorization':
    case 'bad_jwt':
    case 'session_not_found':
      return 'Sua sessão expirou. Entre novamente para cadastrar o autenticador.';
    default:
      if (failure?.message?.toLowerCase().includes('network')) {
        return 'Não foi possível acessar o serviço de autenticação. Verifique sua conexão.';
      }
      return 'Não foi possível cadastrar o autenticador.';
  }
};
