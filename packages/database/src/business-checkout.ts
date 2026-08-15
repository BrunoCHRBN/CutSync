import type { ServiceOrderStatus } from './business';

export const BUSINESS_PAYMENT_METHODS = [
  'cash',
  'pix',
  'credit_card',
  'debit_card',
  'other',
] as const;

export type BusinessPaymentMethod = (typeof BUSINESS_PAYMENT_METHODS)[number];
export type BusinessPaymentStatus = 'unpaid' | 'partial' | 'paid';

export interface BusinessPaymentRecord {
  id: string;
  method: BusinessPaymentMethod;
  amountCents: number;
  recordedAt: string;
}

export interface BusinessCheckoutSummary {
  serviceOrderId: string;
  status: ServiceOrderStatus;
  version: number;
  currency: 'BRL';
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  paymentStatus: BusinessPaymentStatus;
  payments: BusinessPaymentRecord[];
}

export interface BusinessPaymentReceipt {
  serviceOrderId: string;
  paymentId: string;
  status: ServiceOrderStatus;
  version: number;
}

type RecordValue = Record<string, unknown>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isRecord = (value: unknown): value is RecordValue => typeof value === 'object' && value !== null && !Array.isArray(value);
const safeInteger = (value: unknown, minimum = 0) => typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum ? value : null;
const orderStatus = (value: unknown): ServiceOrderStatus | null => ['open', 'in_service', 'awaiting_payment', 'closed', 'voided'].includes(String(value)) ? value as ServiceOrderStatus : null;
const paymentMethod = (value: unknown): BusinessPaymentMethod | null => BUSINESS_PAYMENT_METHODS.includes(value as BusinessPaymentMethod) ? value as BusinessPaymentMethod : null;

export const mapBusinessCheckoutSummary = (value: unknown): BusinessCheckoutSummary | null => {
  if (!isRecord(value) || !Array.isArray(value.payments)) return null;
  const serviceOrderId = typeof value.serviceOrderId === 'string' && uuid.test(value.serviceOrderId) ? value.serviceOrderId : null;
  const status = orderStatus(value.status);
  const version = safeInteger(value.version, 1);
  const totalCents = safeInteger(value.totalCents);
  const paidCents = safeInteger(value.paidCents);
  const balanceCents = safeInteger(value.balanceCents);
  const paymentStatus = ['unpaid', 'partial', 'paid'].includes(String(value.paymentStatus)) ? value.paymentStatus as BusinessPaymentStatus : null;
  const payments = value.payments.map((payment): BusinessPaymentRecord | null => {
    if (!isRecord(payment)) return null;
    const id = typeof payment.id === 'string' && uuid.test(payment.id) ? payment.id : null;
    const method = paymentMethod(payment.method);
    const amountCents = safeInteger(payment.amountCents, 1);
    const recordedAt = typeof payment.recordedAt === 'string' && Number.isFinite(Date.parse(payment.recordedAt)) ? payment.recordedAt : null;
    return id && method && amountCents && recordedAt ? { id, method, amountCents, recordedAt } : null;
  });
  if (!serviceOrderId || !status || !version || value.currency !== 'BRL' || totalCents === null || paidCents === null || balanceCents === null || !paymentStatus || payments.some((payment) => !payment)) return null;
  if (paidCents + balanceCents !== totalCents) return null;
  return { serviceOrderId, status, version, currency: 'BRL', totalCents, paidCents, balanceCents, paymentStatus, payments: payments as BusinessPaymentRecord[] };
};

export const mapBusinessPaymentReceipt = (value: unknown): BusinessPaymentReceipt | null => {
  if (!isRecord(value)) return null;
  const serviceOrderId = typeof value.serviceOrderId === 'string' && uuid.test(value.serviceOrderId) ? value.serviceOrderId : null;
  const paymentId = typeof value.paymentId === 'string' && uuid.test(value.paymentId) ? value.paymentId : null;
  const status = orderStatus(value.status);
  const version = safeInteger(value.version, 1);
  return serviceOrderId && paymentId && status && version ? { serviceOrderId, paymentId, status, version } : null;
};