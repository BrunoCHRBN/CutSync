import {
  mapBusinessScheduleBlock,
  type BusinessScheduleBlock,
} from '@cutsync/database';

import {
  assertIsoTimestamp,
  assertUuid,
  BusinessFeatureError,
  callBusinessRpc,
} from '@/features/connectivity/business-rpc';

export type BusinessScheduleBlockKind = BusinessScheduleBlock['kind'];

export interface BusinessScheduleBlockValues {
  professionalId: string;
  startsAt: string;
  endsAt: string;
  kind: BusinessScheduleBlockKind;
  reason?: string | null;
  allDay?: boolean;
  localDate?: string | null;
}

const valuesArgs = (values: BusinessScheduleBlockValues) => {
  if (!['break', 'time_off', 'blocked'].includes(values.kind)) {
    throw new BusinessFeatureError('invalid_request');
  }
  return {
    target_professional_id: assertUuid(values.professionalId),
    target_starts_at: assertIsoTimestamp(values.startsAt),
    target_ends_at: assertIsoTimestamp(values.endsAt),
    target_kind: values.kind,
    target_reason: values.reason?.trim() || null,
    target_all_day: Boolean(values.allDay),
    target_local_date: values.allDay ? values.localDate : null,
  };
};

export const businessSchedulesApi = {
  async list(input: {
    establishmentId: string;
    rangeStart: string;
    rangeEnd: string;
    professionalId?: string | null;
  }): Promise<BusinessScheduleBlock[]> {
    const data = await callBusinessRpc('get_business_schedule_blocks', {
      target_establishment_id: assertUuid(input.establishmentId),
      target_range_start: assertIsoTimestamp(input.rangeStart),
      target_range_end: assertIsoTimestamp(input.rangeEnd),
      target_professional_id: input.professionalId ? assertUuid(input.professionalId) : null,
    });
    if (!Array.isArray(data)) throw new BusinessFeatureError('invalid_response');
    const blocks = data.flatMap((row) => {
      const mapped = mapBusinessScheduleBlock(row);
      return mapped ? [mapped] : [];
    });
    if (blocks.length !== data.length) throw new BusinessFeatureError('invalid_response');
    return blocks;
  },

  create(establishmentId: string, requestId: string, values: BusinessScheduleBlockValues) {
    return callBusinessRpc('create_business_schedule_block', {
      target_establishment_id: assertUuid(establishmentId),
      target_request_id: assertUuid(requestId),
      ...valuesArgs(values),
    });
  },

  update(establishmentId: string, blockId: string, requestId: string, values: BusinessScheduleBlockValues) {
    return callBusinessRpc('update_business_schedule_block', {
      target_establishment_id: assertUuid(establishmentId),
      target_schedule_block_id: assertUuid(blockId),
      target_request_id: assertUuid(requestId),
      ...valuesArgs(values),
    });
  },

  remove(establishmentId: string, blockId: string, requestId: string) {
    return callBusinessRpc('delete_business_schedule_block', {
      target_establishment_id: assertUuid(establishmentId),
      target_schedule_block_id: assertUuid(blockId),
      target_request_id: assertUuid(requestId),
    });
  },
};

