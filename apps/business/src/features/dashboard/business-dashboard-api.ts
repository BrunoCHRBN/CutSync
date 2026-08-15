import { mapBusinessDailyMetrics, type BusinessDailyMetrics } from '@cutsync/database';

import { assertUuid, BusinessFeatureError, callBusinessRpc } from '@/features/connectivity/business-rpc';

const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export const businessDashboardApi = {
  async getDailyMetrics(
    establishmentId: string,
    localDate: string,
  ): Promise<BusinessDailyMetrics> {
    if (!localDatePattern.test(localDate)) throw new BusinessFeatureError('invalid_request');
    const data = await callBusinessRpc('get_business_daily_metrics', {
      target_establishment_id: assertUuid(establishmentId),
      target_local_date: localDate,
    });
    const metrics = mapBusinessDailyMetrics(data);
    if (!metrics) throw new BusinessFeatureError('invalid_response');
    return metrics;
  },
};