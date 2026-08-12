import {
  createMobileRequestId,
  validateProductEvent,
  type ProductEventName,
  type ProductSurface,
} from '@cutsync/domain';

import { supabase } from './supabase';

export function recordWebProductEvent(input: {
  name: ProductEventName;
  surface: ProductSurface;
  role?: 'client' | 'professional' | 'admin' | 'owner' | 'manager' | 'finance' | 'unknown';
  route: string;
  properties?: Record<string, string>;
}) {
  const event = {
    ...input,
    role: input.role || 'unknown' as const,
    experienceVersion: 'ui-ux-v2',
    occurredAt: new Date().toISOString(),
  };
  if (validateProductEvent(event).length) return;
  void supabase.rpc('record_product_event', {
    target_request_id: createMobileRequestId(),
    target_event_name: event.name,
    target_surface: event.surface,
    target_actor_role: event.role,
    target_route_template: event.route,
    target_experience_version: event.experienceVersion,
    target_identifiers: event.properties || {},
  }).then(() => undefined, () => undefined);
}
