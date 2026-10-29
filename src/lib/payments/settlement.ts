/**
 * Settlement & Reconciliation Module
 * Decoupled into specialized domain services:
 * - counter-settlement: staff counter payments, authorization, exact amount checks
 * - online-settlement: Razorpay verified callbacks, webhooks, failure handling
 * - reconciliation: gateway state queries and status reconciliation
 */

export {
  SettlementError,
  settleCounterPayment,
  type SettleCounterParams,
} from './counter-settlement';

export {
  recordOnlinePaymentVerified,
  recordOnlinePaymentFailed,
  type RecordOnlinePaymentVerifiedParams,
} from './online-settlement';

export {
  reconcilePaymentRecord,
} from './reconciliation';
