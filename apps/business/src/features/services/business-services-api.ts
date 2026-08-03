import { mapBusinessService, type BusinessService } from '@cutsync/database';

import {
  assertUuid,
  BusinessFeatureError,
  callBusinessRpc,
} from '@/features/connectivity/business-rpc';

export interface BusinessServiceValues {
  name: string;
  price: number;
  durationMinutes: number;
  sortOrder?: number | null;
}

const serviceId = (value: string) => {
  const normalized = value.trim();
  if (!normalized) throw new BusinessFeatureError('invalid_request');
  return normalized;
};

const valuesArgs = (values: BusinessServiceValues) => {
  const name = values.name.trim();
  if (
    name.length < 2
    || !Number.isFinite(values.price)
    || values.price < 0
    || !Number.isInteger(values.durationMinutes)
    || values.durationMinutes < 1
  ) throw new BusinessFeatureError('invalid_request');
  return {
    target_name: name,
    target_price: values.price,
    target_duration_minutes: values.durationMinutes,
    target_sort_order: values.sortOrder ?? null,
  };
};

export const businessServicesApi = {
  async list(establishmentId: string): Promise<BusinessService[]> {
    const data = await callBusinessRpc('get_business_services', {
      target_establishment_id: assertUuid(establishmentId),
    });
    if (!Array.isArray(data)) throw new BusinessFeatureError('invalid_response');
    const services = data.flatMap((value) => {
      const mapped = mapBusinessService(value);
      return mapped ? [mapped] : [];
    });
    if (services.length !== data.length) throw new BusinessFeatureError('invalid_response');
    return services;
  },

  create(establishmentId: string, requestId: string, values: BusinessServiceValues) {
    return callBusinessRpc('create_business_service', {
      target_establishment_id: assertUuid(establishmentId),
      target_request_id: assertUuid(requestId),
      ...valuesArgs(values),
    });
  },

  update(establishmentId: string, targetServiceId: string, requestId: string, values: BusinessServiceValues) {
    return callBusinessRpc('update_business_service', {
      target_establishment_id: assertUuid(establishmentId),
      target_service_id: serviceId(targetServiceId),
      target_request_id: assertUuid(requestId),
      ...valuesArgs(values),
    });
  },

  setStatus(establishmentId: string, targetServiceId: string, isActive: boolean, requestId: string) {
    return callBusinessRpc('set_business_service_status', {
      target_establishment_id: assertUuid(establishmentId),
      target_service_id: serviceId(targetServiceId),
      target_is_active: isActive,
      target_request_id: assertUuid(requestId),
    });
  },

  reorder(establishmentId: string, serviceIds: string[], requestId: string) {
    if (!serviceIds.length || new Set(serviceIds).size !== serviceIds.length) {
      throw new BusinessFeatureError('invalid_request');
    }
    return callBusinessRpc('reorder_business_services', {
      target_establishment_id: assertUuid(establishmentId),
      target_service_ids: serviceIds.map(serviceId),
      target_request_id: assertUuid(requestId),
    });
  },

  associateProfessional(input: {
    establishmentId: string;
    professionalId: string;
    serviceId: string;
    price: number;
    durationMinutes: number;
    isActive: boolean;
    requestId: string;
  }) {
    if (!Number.isFinite(input.price) || input.price < 0 || !Number.isInteger(input.durationMinutes) || input.durationMinutes < 1) {
      throw new BusinessFeatureError('invalid_request');
    }
    return callBusinessRpc('upsert_business_professional_service', {
      target_establishment_id: assertUuid(input.establishmentId),
      target_professional_id: assertUuid(input.professionalId),
      target_service_id: serviceId(input.serviceId),
      target_price: input.price,
      target_duration_minutes: input.durationMinutes,
      target_is_active: input.isActive,
      target_request_id: assertUuid(input.requestId),
    });
  },
};

