import {
  BUSINESS_PAYMENT_METHODS,
  mapBusinessCheckoutSummary,
  mapBusinessPaymentReceipt,
  type BusinessCheckoutSummary,
  type BusinessPaymentMethod,
  type BusinessPaymentReceipt,
} from '@cutsync/database';

import { assertUuid, BusinessFeatureError, callBusinessRpc } from '@/features/connectivity/business-rpc';

export const businessCheckoutApi = {
  async getSummary(
    establishmentId: string,
    serviceOrderId: string,
  ): Promise<BusinessCheckoutSummary> {
    const data = await callBusinessRpc('get_business_service_order_checkout', {
      target_establishment_id: assertUuid(establishmentId),
      target_service_order_id: assertUuid(serviceOrderId),
    });
    const summary = mapBusinessCheckoutSummary(data);
    if (!summary) throw new BusinessFeatureError('invalid_response');
    return summary;
  },

  async recordPayment(input: {
    establishmentId: string;
    serviceOrderId: string;
    expectedVersion: number;
    requestId: string;
    method: BusinessPaymentMethod;
    amountCents: number;
  }): Promise<BusinessPaymentReceipt> {
    if (!BUSINESS_PAYMENT_METHODS.includes(input.method)) throw new BusinessFeatureError('invalid_request');
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 1) throw new BusinessFeatureError('invalid_request');
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) throw new BusinessFeatureError('invalid_request');
    const data = await callBusinessRpc('record_business_service_order_payment', {
      target_establishment_id: assertUuid(input.establishmentId),
      target_service_order_id: assertUuid(input.serviceOrderId),
      target_expected_version: input.expectedVersion,
      target_request_id: assertUuid(input.requestId),
      target_method: input.method,
      target_amount_cents: input.amountCents,
    });
    const receipt = mapBusinessPaymentReceipt(data);
    if (!receipt) throw new BusinessFeatureError('invalid_response');
    return receipt;
  },
};