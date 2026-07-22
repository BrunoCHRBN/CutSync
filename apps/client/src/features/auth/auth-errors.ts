interface AuthFailure {
  code?: string;
  message?: string;
}

const isNetworkFailure = (failure: AuthFailure | null | undefined) => {
  const message = failure?.message?.toLowerCase() ?? '';
  return message.includes('network') || message.includes('fetch');
};

export const getClientAuthErrorMessage = (failure: AuthFailure | null | undefined) => {
  switch (failure?.code) {
    case 'invalid_credentials':
      return 'E-mail ou senha incorretos.';
    case 'email_not_confirmed':
      return 'Confirme seu e-mail antes de entrar.';
    case 'user_banned':
      return 'Esta conta está temporariamente indisponível.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Muitas tentativas. Aguarde um pouco e tente novamente.';
    default:
      break;
  }

  if (isNetworkFailure(failure)) {
    return 'Não foi possível conectar. Verifique sua internet e tente novamente.';
  }

  return 'Não foi possível entrar agora. Tente novamente em instantes.';
};

export const getClientSignUpErrorMessage = (failure: AuthFailure | null | undefined) => {
  if (failure?.code === 'over_request_rate_limit' || failure?.code === 'over_email_send_rate_limit') {
    return 'Muitas tentativas. Aguarde um pouco e tente novamente.';
  }
  if (failure?.code === 'weak_password') return 'A senha não atende aos requisitos de segurança.';
  if (isNetworkFailure(failure)) return 'Não foi possível conectar. Verifique sua internet e tente novamente.';
  return 'Não foi possível concluir o cadastro agora. Tente novamente em instantes.';
};

export const getClientEmailActionErrorMessage = (failure: AuthFailure | null | undefined) => {
  if (failure?.code === 'over_request_rate_limit' || failure?.code === 'over_email_send_rate_limit') {
    return 'Muitas solicitações. Aguarde um pouco antes de tentar novamente.';
  }
  if (isNetworkFailure(failure)) return 'Não foi possível conectar. Verifique sua internet e tente novamente.';
  return 'Não foi possível enviar o e-mail agora. Tente novamente em instantes.';
};
