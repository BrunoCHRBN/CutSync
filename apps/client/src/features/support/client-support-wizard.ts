import {
  supportCategoryLabels,
  isSupportCategory,
  type ClientSupportCategory,
  type SupportImpact,
} from '@cutsync/domain';
import {
  CLIENT_SUPPORT_MESSAGE_MAX_LENGTH,
  CLIENT_SUPPORT_SUBJECT_MAX_LENGTH,
  normalizeClientSupportMessage,
  normalizeClientSupportSubject,
} from '@cutsync/validation';

export type SupportWizardStep =
  | 'area'
  | 'context'
  | 'impact'
  | 'details'
  | 'review';

export type SupportAnswerKey =
  | 'attempted'
  | 'observed'
  | 'expected';

export interface SupportWizardState {
  step: SupportWizardStep;
  category: ClientSupportCategory | null;
  impact: SupportImpact;
  appointmentId: string | null;
  answers: Partial<Record<SupportAnswerKey, string>>;
  subject: string;
  subjectEdited: boolean;
  idempotencyKey: string | null;
}

export type SupportWizardAction =
  | { type: 'restore'; state: SupportWizardState }
  | { type: 'set-step'; step: SupportWizardStep }
  | { type: 'set-category'; value: ClientSupportCategory }
  | { type: 'set-impact'; value: SupportImpact }
  | { type: 'set-appointment'; value: string | null }
  | { type: 'set-answer'; key: SupportAnswerKey; value: string }
  | { type: 'set-subject'; value: string; edited?: boolean }
  | { type: 'set-idempotency'; value: string | null };

export const createInitialSupportWizardState = (
  appointmentId: string | null = null,
): SupportWizardState => ({
  step: 'area',
  category: null,
  impact: 'normal',
  appointmentId,
  answers: {},
  subject: '',
  subjectEdited: false,
  idempotencyKey: null,
});

export const hasSupportWizardDraftContent = (state: SupportWizardState) => (
  Boolean(
    state.category
    || state.appointmentId
    || state.subject.trim()
    || Object.values(state.answers).some((answer) => answer?.trim()),
  )
);

export const supportWizardReducer = (
  state: SupportWizardState,
  action: SupportWizardAction,
): SupportWizardState => {
  if (action.type === 'restore') return action.state;
  if (action.type === 'set-step') return { ...state, step: action.step };
  if (action.type === 'set-category') {
    return {
      ...state,
      category: action.value,
      subject: state.subjectEdited ? state.subject : '',
      idempotencyKey: null,
    };
  }
  if (action.type === 'set-impact') {
    return { ...state, impact: action.value, idempotencyKey: null };
  }
  if (action.type === 'set-appointment') {
    return { ...state, appointmentId: action.value, idempotencyKey: null };
  }
  if (action.type === 'set-answer') {
    return {
      ...state,
      answers: { ...state.answers, [action.key]: action.value },
      subject: state.subjectEdited ? state.subject : '',
      idempotencyKey: null,
    };
  }
  if (action.type === 'set-subject') {
    return {
      ...state,
      subject: action.value,
      subjectEdited: action.edited ?? true,
      idempotencyKey: null,
    };
  }
  return { ...state, idempotencyKey: action.value };
};

export const supportAnswerDefinitions: {
  key: SupportAnswerKey;
  label: string;
  placeholder: string;
}[] = [
  {
    key: 'attempted',
    label: 'O que estava tentando fazer?',
    placeholder: 'Descreva a ação que iniciou o problema.',
  },
  {
    key: 'observed',
    label: 'O que aconteceu?',
    placeholder: 'Informe o comportamento apresentado.',
  },
  {
    key: 'expected',
    label: 'O que deveria ter acontecido?',
    placeholder: 'Descreva o resultado esperado.',
  },
];

export const getSupportWizardSteps = ({
  hasAppointmentContext,
}: {
  hasAppointmentContext: boolean;
}): SupportWizardStep[] => [
  'area',
  ...(hasAppointmentContext ? ['context' as const] : []),
  'impact',
  'details',
  'review',
];

const firstMeaningfulAnswer = (state: SupportWizardState) => {
  return supportAnswerDefinitions
    .map(({ key }) => state.answers[key]?.trim() ?? '')
    .find((answer) => answer.length > 0) ?? '';
};

export const buildSupportWizardSubject = (state: SupportWizardState) => {
  if (!state.category) return '';
  const prefix = `Problema · ${supportCategoryLabels[state.category]}`;
  const answer = firstMeaningfulAnswer(state);
  const normalized = normalizeClientSupportSubject(
    answer ? `${prefix}: ${answer}` : prefix,
  );
  return normalized.slice(0, CLIENT_SUPPORT_SUBJECT_MAX_LENGTH).trim();
};

export const buildSupportWizardMessage = (state: SupportWizardState) => {
  if (!state.category) return '';
  const sections = [
    `Área\n${supportCategoryLabels[state.category]}`,
    ...supportAnswerDefinitions.map(({ key, label }) => (
      `${label}\n${state.answers[key]?.trim() ?? ''}`
    )),
  ];
  return normalizeClientSupportMessage(sections.join('\n\n'))
    .slice(0, CLIENT_SUPPORT_MESSAGE_MAX_LENGTH)
    .trim();
};

const supportWizardSteps = new Set<SupportWizardStep>([
  'area',
  'context',
  'impact',
  'details',
  'review',
]);
const supportImpacts = new Set<SupportImpact>(['normal', 'high', 'critical']);
const supportAnswerKeys = new Set<SupportAnswerKey>(['attempted', 'observed', 'expected']);

export const isSupportWizardState = (value: unknown): value is SupportWizardState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as Partial<SupportWizardState> & Record<string, unknown>;
  if (
    typeof state.step !== 'string'
    || !supportWizardSteps.has(state.step as SupportWizardStep)
    || (state.category !== null && (
      typeof state.category !== 'string' || !isSupportCategory(state.category)
    ))
    || typeof state.impact !== 'string'
    || !supportImpacts.has(state.impact as SupportImpact)
    || (state.appointmentId !== null && typeof state.appointmentId !== 'string')
    || typeof state.subject !== 'string'
    || typeof state.subjectEdited !== 'boolean'
    || (state.idempotencyKey !== null && typeof state.idempotencyKey !== 'string')
    || !state.answers
    || typeof state.answers !== 'object'
    || Array.isArray(state.answers)
  ) return false;

  return Object.entries(state.answers).every(([key, answer]) => (
    supportAnswerKeys.has(key as SupportAnswerKey)
    && typeof answer === 'string'
  ));
};
