import { validateProductEvent, type ProductEventName } from '@cutsync/domain';

import { createMobileRequestId } from '@/lib/mobile-request-id';
import { supabase } from '@/lib/supabase';

export function recordBusinessProductEvent(input: {
  name: ProductEventName;
  route: string;
  role?: 'professional' | 'admin' | 'owner' | 'manager' | 'finance' | 'unknown';
  properties?: Record<string, string>;
}) {
  if (!supabase) return;
  const event = {
    ...input,
    surface: 'business_mobile' as const,
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
