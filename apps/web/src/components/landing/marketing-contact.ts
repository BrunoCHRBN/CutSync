import {
  MarketingContactInput,
  MarketingContactValidation,
  validateMarketingContactRequest,
} from '@cutsync/validation';
import { isSupabaseConfigured, supabase } from '../../services/supabase';

export type MarketingContactOutcome = 'received' | 'invalid' | 'error';

export const validateMarketingContact = (input: MarketingContactInput): MarketingContactValidation =>
  validateMarketingContactRequest(input);

export const submitMarketingContactRequest = async (input: MarketingContactInput): Promise<MarketingContactOutcome> => {
  const validation = validateMarketingContactRequest(input);
  if (!validation.ok) return 'invalid';
  if (!isSupabaseConfigured) return 'error';

  try {
    const { data, error } = await supabase.rpc('submit_marketing_contact_request' as never, {
      request_origin: validation.value.origin,
      contact_name: validation.value.name,
      contact_email: validation.value.email,
      contact_establishment_name: validation.value.establishmentName,
      contact_message: validation.value.message,
      contact_consent: true,
      contact_trap: input.honeypot ?? '',
    } as never);
    if (error) return 'error';
    const status = (data as { status?: string } | null)?.status;
    return status === 'received' ? 'received' : 'invalid';
  } catch {
    return 'error';
  }
};
