import { labelForTransitionValue } from '@/modules/support/presentation/support-labels';

const eventLabels: Record<string, string> = {
  ticket_created: 'Chamado criado',
  ticket_routed: 'Chamado encaminhado',
  ticket_synced: 'Sincronização concluída',
  ticket_sync_failed: 'Falha na sincronização',
  ticket_reprocessed: 'Sincronização reprocessada',
  assignee_changed: 'Responsável alterado',
  priority_changed: 'Prioridade alterada',
  status_changed: 'Status alterado',
  escalation_changed: 'Escalonamento alterado',
  ticket_escalated: 'Chamado escalado',
  message_added: 'Mensagem registrada',
  note_added: 'Nota interna registrada',
  sync_started: 'Sincronização iniciada',
  sync_completed: 'Sincronização concluída',
};

function humanizeUnknownEvent(value: string): string {
  const readable = value.replace(/[_-]+/g, ' ').trim();
  return `Evento: ${readable}`;
}

export function labelForEventType(eventType: string | null | undefined): string {
  if (!eventType) return 'Evento';
  return eventLabels[eventType] ?? humanizeUnknownEvent(eventType);
}

export function formatEventTransition(
  fromValue: string | null | undefined,
  toValue: string | null | undefined,
): string | null {
  const from = labelForTransitionValue(fromValue);
  const to = labelForTransitionValue(toValue);
  if (from && to) return `${from} → ${to}`;
  if (to) return to;
  if (from) return from;
  return null;
}

export function isAutomaticEventActor(actorDisplayName: string | null | undefined): boolean {
  if (!actorDisplayName) return true;
  const normalized = actorDisplayName.trim().toLowerCase();
  return (
    normalized === 'sistema'
    || normalized.includes('sistema')
    || normalized.includes('jira')
    || normalized.includes('jsm')
    || normalized.includes('cutsync')
  );
}
