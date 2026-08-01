import {
  buildClientSearchKey,
  normalizeEstablishmentClientEmail,
  normalizeEstablishmentClientPhone,
} from '@cutsync/validation';

import type { DuplicateSuggestion, EstablishmentClient } from '../types/establishment-client';

const phoneDigits = (value: string | null | undefined) => (
  (value ?? '').replace(/\D/g, '')
);

const confidenceRank = { high: 0, medium: 1, low: 2 } as const;

/**
 * Local ranking only — never auto-merges. High means same normalized contact;
 * medium means strong digit overlap on phone; low means same accent-folded name.
 */
export const suggestDuplicateClients = (
  subject: EstablishmentClient,
  candidates: readonly EstablishmentClient[],
): DuplicateSuggestion[] => {
  const subjectPhone = normalizeEstablishmentClientPhone(subject.phone);
  const subjectEmail = normalizeEstablishmentClientEmail(subject.email);
  const subjectDigits = phoneDigits(subject.phone);
  const subjectNameKey = buildClientSearchKey(subject.displayName);
  const suggestions: DuplicateSuggestion[] = [];

  for (const candidate of candidates) {
    if (candidate.id === subject.id || candidate.status === 'merged') continue;

    const candidatePhone = normalizeEstablishmentClientPhone(candidate.phone);
    const candidateEmail = normalizeEstablishmentClientEmail(candidate.email);
    const candidateDigits = phoneDigits(candidate.phone);
    const candidateNameKey = buildClientSearchKey(candidate.displayName);

    if (subjectPhone && candidatePhone && subjectPhone === candidatePhone) {
      suggestions.push({
        client: candidate,
        confidence: 'high',
        reason: 'Mesmo telefone normalizado',
      });
      continue;
    }
    if (subjectEmail && candidateEmail && subjectEmail === candidateEmail) {
      suggestions.push({
        client: candidate,
        confidence: 'high',
        reason: 'Mesmo e-mail normalizado',
      });
      continue;
    }
    if (
      subjectDigits.length >= 8
      && candidateDigits.length >= 8
      && (
        subjectDigits.endsWith(candidateDigits.slice(-8))
        || candidateDigits.endsWith(subjectDigits.slice(-8))
      )
    ) {
      suggestions.push({
        client: candidate,
        confidence: 'medium',
        reason: 'Telefone com dígitos coincidentes',
      });
      continue;
    }
    if (subjectNameKey && candidateNameKey && subjectNameKey === candidateNameKey) {
      suggestions.push({
        client: candidate,
        confidence: 'low',
        reason: 'Nome equivalente (sem acento)',
      });
    }
  }

  return suggestions.sort((left, right) => (
    confidenceRank[left.confidence] - confidenceRank[right.confidence]
    || left.client.displayName.localeCompare(right.client.displayName, 'pt-BR')
  ));
};
