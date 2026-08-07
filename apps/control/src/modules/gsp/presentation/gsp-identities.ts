export type GspIdentity = {
  primary: string;
  secondary: string | null;
  idHint: string | null;
};

function looksLikeOpaqueId(value: string): boolean {
  return /^[0-9a-f]{6,}$/i.test(value.replace(/-/g, ''));
}

export function resolvePersonIdentity(input: {
  displayName?: string | null;
  email?: string | null;
  profileId?: string | null;
  fallbackPrimary?: string;
}): GspIdentity {
  const name = input.displayName?.trim() || null;
  const email = input.email?.trim() || null;
  const id = input.profileId?.trim() || null;
  const idHint = id ? id.slice(0, 8) : null;

  if (name && !looksLikeOpaqueId(name)) {
    return {
      primary: name,
      secondary: email ?? (idHint ? `ID ${idHint}` : null),
      idHint,
    };
  }

  if (email) {
    return {
      primary: email,
      secondary: idHint ? `ID ${idHint}` : null,
      idHint,
    };
  }

  if (id) {
    return {
      primary: input.fallbackPrimary ?? 'Usuário interno',
      secondary: `ID ${idHint}`,
      idHint,
    };
  }

  return {
    primary: input.fallbackPrimary ?? 'Não informado',
    secondary: null,
    idHint: null,
  };
}

export function resolveActorIdentity(actorName: string | null | undefined): GspIdentity {
  const name = actorName?.trim() || null;
  if (!name) {
    return { primary: 'Sistema', secondary: null, idHint: null };
  }
  const lower = name.toLowerCase();
  if (lower === 'sistema' || lower.includes('system') || lower.includes('cutsync')) {
    return { primary: name, secondary: 'Automático', idHint: null };
  }
  return resolvePersonIdentity({ displayName: name });
}
