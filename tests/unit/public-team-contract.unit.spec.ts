/// <reference types="node" />

import { expect, test } from '@playwright/test';
import { mapPublicTeamMember, PublicTeamMember } from '@cutsync/database';

test('mapPublicTeamMember mapeia estritamente os 6 campos do RPC get_public_team', () => {
  const rpcRow = {
    id: 'prof-123',
    name: 'João Barbeiro',
    avatar_url: 'https://example.com/avatar.jpg',
    titulo_profissional: 'Mestre da Barba',
    specialties: 'Corte, Barba',
    professional_profile_slug: 'joao-barbeiro',
  };

  const mapped: PublicTeamMember = mapPublicTeamMember(rpcRow);

  expect(mapped.id).toBe('prof-123');
  expect(mapped.name).toBe('João Barbeiro');
  expect(mapped.avatarUrl).toBe('https://example.com/avatar.jpg');
  expect(mapped.tituloProfissional).toBe('Mestre da Barba');
  expect(mapped.specialties).toBe('Corte, Barba');
  expect(mapped.profileSlug).toBe('joao-barbeiro');

  // Garante ausência de dados fictícios / simulados
  expect((mapped as any).rating).toBeUndefined();
  expect((mapped as any).totalReviews).toBeUndefined();
  expect((mapped as any).email).toBeUndefined();
  expect((mapped as any).phone).toBeUndefined();
  expect((mapped as any).commissionRate).toBeUndefined();
});

test('mapPublicTeamMember trata slug e campos nulos corretamente', () => {
  const rpcRowWithNulls = {
    id: 'prof-456',
    name: 'Carlos Silva',
    avatar_url: '',
    titulo_profissional: '',
    specialties: '',
    professional_profile_slug: null as any,
  };

  const mapped = mapPublicTeamMember(rpcRowWithNulls);

  expect(mapped.id).toBe('prof-456');
  expect(mapped.name).toBe('Carlos Silva');
  expect(mapped.profileSlug).toBeNull();
});
