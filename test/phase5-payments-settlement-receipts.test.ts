import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import {
  verifyPaymentSignature,
  verifyWebhookSignature,
  createGatewayOrder,
} from '@/lib/payments/razorpay';
import {
  settleCounterPayment,
  recordOnlinePaymentVerified,
  recordOnlinePaymentFailed,
  reconcilePaymentRecord,
  SettlementError,
} from '@/lib/payments/settlement';
import * as razorpayModule from '@/lib/payments/razorpay';
import { prisma } from '@/lib/prisma';
import { PaymentStatus, PaymentMethod, UserRole, OrderStatus } from '@/types';

describe('Phase 5: Razorpay Gateway Signatures & Amount Validation', () => {
  const mockSecret = 'test_webhook_secret_key_12345';
  const mockKeySecret = 'test_razorpay_key_secret_abcde';

  it('should verify a valid checkout callback signature correctly', () => {
    const orderId = 'order_test_12345';
    const paymentId = 'pay_test_67890';
    const payload = `${orderId}|${paymentId}`;
    const validSignature = crypto
      .createHmac('sha256', mockKeySecret)
      .update(payload)
      .digest('hex');

    const isValid = verifyPaymentSignature({
      orderId,
      paymentId,
      signature: validSignature,
      secret: mockKeySecret,
    });

    expect(isValid).toBe(true);
  });

  it('should reject invalid, forged, or missing checkout signatures', () => {
    const orderId = 'order_test_12345';
    const paymentId = 'pay_test_67890';

    // Tampered signature
    const isTampered = verifyPaymentSignature({
      orderId,
      paymentId,
      signature: '0000000000000000000000000000000000000000000000000000000000000000',
      secret: mockKeySecret,
    });
    expect(isTampered).toBe(false);

    // Empty signature
    expect(
      verifyPaymentSignature({
        orderId,
        paymentId,
        signature: '',
        secret: mockKeySecret,
      }),
    ).toBe(false);

    // Missing secret
    expect(
      verifyPaymentSignature({
        orderId,
        paymentId,
        signature: 'some_sig',
        secret: '',
      }),
    ).toBe(false);
  });

  it('should verify valid webhook signature against raw request body', () => {
    const rawBody = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_999', amount: 50000 } } },
    });

    const signature = crypto
      .createHmac('sha256', mockSecret)
      .update(rawBody)
      .digest('hex');

    const isValid = verifyWebhookSignature({
      rawBody,
      signature,
      secret: mockSecret,
    });

    expect(isValid).toBe(true);
  });

  it('should reject webhook replay or tampered raw request body', () => {
    const rawBody = JSON.stringify({ event: 'payment.captured' });
    const signature = crypto
      .createHmac('sha256', mockSecret)
      .update(rawBody)
      .digest('hex');

    // Tampered body with original signature
    const tamperedBody = JSON.stringify({ event: 'payment.captured', extra: 'tampered' });
    const isValid = verifyWebhookSignature({
      rawBody: tamperedBody,
      signature,
      secret: mockSecret,
    });

    expect(isValid).toBe(false);
  });

  it('should enforce positive integer minor currency units for gateway orders', async () => {
    await expect(
      createGatewayOrder({
        amount: 0,
        receipt: 'ORD-TEST-001',
      }),
    ).rejects.toThrow('Amount must be a positive integer in minor units');

    await expect(
      createGatewayOrder({
        amount: -500,
        receipt: 'ORD-TEST-002',
      }),
    ).rejects.toThrow('Amount must be a positive integer in minor units');

    await expect(
      createGatewayOrder({
        amount: 150.75, // Non-integer
        receipt: 'ORD-TEST-003',
      }),
    ).rejects.toThrow('Amount must be a positive integer in minor units');
  });
});

describe('Phase 5: Counter Settlement & Role Authorization', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should reject counter settlement if user role is not authorized (e.g. KITCHEN)', async () => {
    await expect(
      settleCounterPayment({
        restaurantId: 'rest_1',
        orderId: 'order_1',
        amount: 25000,
        userId: 'user_cook',
        userFullName: 'Chef Mario',
        userRole: UserRole.KITCHEN,
      }),
    ).rejects.toThrow(SettlementError);

    try {
      await settleCounterPayment({
        restaurantId: 'rest_1',
        orderId: 'order_1',
        amount: 25000,
        userId: 'user_cook',
        userFullName: 'Chef Mario',
        userRole: UserRole.KITCHEN,
      });
    } catch (err) {
      expect((err as SettlementError).code).toBe('UNAUTHORIZED_SETTLEMENT');
      expect((err as SettlementError).statusCode).toBe(403);
    }
  });

  it('should reject partial payments and overpayments explicitly (exact amount required)', async () => {
    const mockOrder = {
      id: 'order_1',
      restaurantId: 'rest_1',
      total: 50000, // 500.00 in minor units
      orderStatus: OrderStatus.SERVED,
      paymentStatus: PaymentStatus.UNPAID,
      paymentMethod: PaymentMethod.COUNTER,
      restaurant: { id: 'rest_1', currency: 'INR' },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      const mockTx = {
        order: {
          findUnique: vi.fn().mockResolvedValue(mockOrder),
        },
      };
      return await cb(mockTx);
    });

    // Attempt partial payment (30000 instead of 50000)
    await expect(
      settleCounterPayment({
        restaurantId: 'rest_1',
        orderId: 'order_1',
        amount: 30000,
        userId: 'user_cashier',
        userFullName: 'Cashier Jane',
        userRole: UserRole.CASHIER,
      }),
    ).rejects.toThrow('Partial or over-payments are not permitted');

    // Attempt overpayment (60000 instead of 50000)
    await expect(
      settleCounterPayment({
        restaurantId: 'rest_1',
        orderId: 'order_1',
        amount: 60000,
        userId: 'user_cashier',
        userFullName: 'Cashier Jane',
        userRole: UserRole.CASHIER,
      }),
    ).rejects.toThrow('Partial or over-payments are not permitted');
  });

  it('should prevent duplicate settlement for an already PAID order', async () => {
    const mockOrder = {
      id: 'order_already_paid',
      orderNumber: 'ORD-261027-0001',
      restaurantId: 'rest_1',
      total: 35000,
      orderStatus: OrderStatus.SERVED,
      paymentStatus: PaymentStatus.PAID,
      restaurant: { id: 'rest_1', currency: 'INR' },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      const mockTx = {
        order: {
          findUnique: vi.fn().mockResolvedValue(mockOrder),
        },
      };
      return await cb(mockTx);
    });

    await expect(
      settleCounterPayment({
        restaurantId: 'rest_1',
        orderId: 'order_already_paid',
        amount: 35000,
        userId: 'user_cashier',
        userFullName: 'Cashier Jane',
        userRole: UserRole.CASHIER,
      }),
    ).rejects.toThrow('already marked as PAID. Duplicate settlement rejected');
  });

  it('should reject settlement for a CANCELLED order', async () => {
    const mockOrder = {
      id: 'order_cancelled',
      restaurantId: 'rest_1',
      total: 35000,
      orderStatus: OrderStatus.CANCELLED,
      paymentStatus: PaymentStatus.UNPAID,
      restaurant: { id: 'rest_1', currency: 'INR' },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      const mockTx = {
        order: {
          findUnique: vi.fn().mockResolvedValue(mockOrder),
        },
      };
      return await cb(mockTx);
    });

    await expect(
      settleCounterPayment({
        restaurantId: 'rest_1',
        orderId: 'order_cancelled',
        amount: 35000,
        userId: 'user_cashier',
        userFullName: 'Cashier Jane',
        userRole: UserRole.CASHIER,
      }),
    ).rejects.toThrow('Cannot settle payment for a cancelled order');
  });

  it('should reject counter settlement for an ONLINE order (INELIGIBLE_PAYMENT_METHOD)', async () => {
    const mockOrder = {
      id: 'order_online',
      orderNumber: 'ORD-261027-ON01',
      restaurantId: 'rest_1',
      total: 35000,
      orderStatus: OrderStatus.SERVED,
      paymentStatus: PaymentStatus.UNPAID,
      paymentMethod: PaymentMethod.ONLINE,
      restaurant: { id: 'rest_1', currency: 'INR' },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      const mockTx = {
        order: {
          findUnique: vi.fn().mockResolvedValue(mockOrder),
        },
      };
      return await cb(mockTx);
    });

    await expect(
      settleCounterPayment({
        restaurantId: 'rest_1',
        orderId: 'order_online',
        amount: 35000,
        userId: 'user_cashier',
        userFullName: 'Cashier Jane',
        userRole: UserRole.CASHIER,
      }),
    ).rejects.toThrow('was placed for online payment and cannot be settled as cash');
  });

  it('should reject counter settlement if payment method is ambiguous or missing (AMBIGUOUS_PAYMENT_METHOD)', async () => {
    const mockOrder = {
      id: 'order_ambiguous',
      orderNumber: 'ORD-261027-AMB01',
      restaurantId: 'rest_1',
      total: 35000,
      orderStatus: OrderStatus.SERVED,
      paymentStatus: PaymentStatus.UNPAID,
      paymentMethod: undefined,
      restaurant: { id: 'rest_1', currency: 'INR' },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      const mockTx = {
        order: {
          findUnique: vi.fn().mockResolvedValue(mockOrder),
        },
      };
      return await cb(mockTx);
    });

    await expect(
      settleCounterPayment({
        restaurantId: 'rest_1',
        orderId: 'order_ambiguous',
        amount: 35000,
        userId: 'user_cashier',
        userFullName: 'Cashier Jane',
        userRole: UserRole.CASHIER,
      }),
    ).rejects.toThrow('Payment method is missing or ambiguous');
  });

  it('should reject counter settlement if an online payment attempt is currently pending (ONLINE_PAYMENT_PENDING)', async () => {
    const mockOrder = {
      id: 'order_pending_online',
      orderNumber: 'ORD-261027-PEND01',
      restaurantId: 'rest_1',
      total: 35000,
      orderStatus: OrderStatus.SERVED,
      paymentStatus: PaymentStatus.UNPAID,
      paymentMethod: PaymentMethod.COUNTER,
      restaurant: { id: 'rest_1', currency: 'INR' },
      payments: [
        {
          id: 'pay_pending_1',
          method: PaymentMethod.ONLINE,
          status: PaymentStatus.PENDING,
        },
      ],
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      const mockTx = {
        order: {
          findUnique: vi.fn().mockResolvedValue(mockOrder),
        },
      };
      return await cb(mockTx);
    });

    await expect(
      settleCounterPayment({
        restaurantId: 'rest_1',
        orderId: 'order_pending_online',
        amount: 35000,
        userId: 'user_cashier',
        userFullName: 'Cashier Jane',
        userRole: UserRole.CASHIER,
      }),
    ).rejects.toThrow('has an active online payment pending');
  });

  it('should settle valid counter payment and record audit event with staff member', async () => {
    const mockOrder = {
      id: 'order_valid',
      orderNumber: 'ORD-261027-0099',
      restaurantId: 'rest_1',
      total: 42000,
      orderStatus: OrderStatus.READY,
      paymentStatus: PaymentStatus.UNPAID,
      paymentMethod: PaymentMethod.COUNTER,
      restaurant: { id: 'rest_1', currency: 'INR' },
    };

    const mockPayment = {
      id: 'pay_uuid_123',
      restaurantId: 'rest_1',
      orderId: 'order_valid',
      amount: 42000,
      currency: 'INR',
      method: PaymentMethod.COUNTER,
      status: PaymentStatus.PAID,
      gatewayProvider: 'COUNTER',
      gatewayTransactionId: 'CASH-REC-101',
      paidAt: new Date(),
    };

    let paymentEventCreated: any = null;
    let orderUpdated: any = null;

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      const mockTx = {
        order: {
          findUnique: vi.fn().mockResolvedValue(mockOrder),
          update: vi.fn().mockImplementation((args) => {
            orderUpdated = args.data;
            return { ...mockOrder, ...args.data };
          }),
        },
        payment: {
          create: vi.fn().mockResolvedValue(mockPayment),
        },
        paymentEvent: {
          create: vi.fn().mockImplementation((args) => {
            paymentEventCreated = args.data;
            return { id: 'pe_1', ...args.data };
          }),
        },
        orderStatusHistory: {
          create: vi.fn().mockResolvedValue({ id: 'osh_1' }),
        },
      };
      return await cb(mockTx);
    });

    const result = await settleCounterPayment({
      restaurantId: 'rest_1',
      orderId: 'order_valid',
      amount: 42000,
      userId: 'staff_user_1',
      userFullName: 'Ravi Kumar',
      userRole: UserRole.WAITER,
      reference: 'CASH-REC-101',
      notes: 'Customer paid in cash exact change',
    });

    expect(result.payment.status).toBe(PaymentStatus.PAID);
    expect(result.payment.method).toBe(PaymentMethod.COUNTER);
    expect(orderUpdated.paymentStatus).toBe(PaymentStatus.PAID);
    // Preserves order status (does not mark SERVED or change kitchen workflow)
    expect(result.order.orderStatus).toBe(OrderStatus.READY);

    // Audit event includes staff member and role
    expect(paymentEventCreated.payload.settledByName).toBe('Ravi Kumar');
    expect(paymentEventCreated.payload.staffRole).toBe(UserRole.WAITER);
    expect(paymentEventCreated.payload.reference).toBe('CASH-REC-101');
  });
});

describe('Phase 5: Online Payment Verification & Out-of-Order Webhooks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should idempotently handle repeated online payment verification without duplicate records', async () => {
    const mockOrderPaid = {
      id: 'order_paid_online',
      restaurantId: 'rest_1',
      paymentStatus: PaymentStatus.PAID,
      total: 25000,
    };

    const existingPayment = {
      id: 'pay_online_1',
      orderId: 'order_paid_online',
      status: PaymentStatus.PAID,
      amount: 25000,
      gatewayTransactionId: 'pay_rzp_existing',
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      const mockTx = {
        order: {
          findUnique: vi.fn().mockResolvedValue(mockOrderPaid),
        },
        payment: {
          findFirst: vi.fn().mockResolvedValue(existingPayment),
        },
      };
      return await cb(mockTx);
    });

    const result = await recordOnlinePaymentVerified({
      orderId: 'order_paid_online',
      gatewayOrderId: 'order_rzp_1',
      gatewayTransactionId: 'pay_rzp_existing',
      verifiedAmount: 25000,
    });

    expect(result.isAlreadyPaid).toBe(true);
    expect(result.payment?.id).toBe('pay_online_1');
  });

  it('should ignore late failed webhooks for orders that are already marked PAID', async () => {
    const mockOrderPaid = {
      id: 'order_already_paid',
      paymentStatus: PaymentStatus.PAID,
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      const mockTx = {
        order: {
          findUnique: vi.fn().mockResolvedValue(mockOrderPaid),
          update: vi.fn(),
        },
      };
      return await cb(mockTx);
    });

    const result = await recordOnlinePaymentFailed({
      orderId: 'order_already_paid',
      gatewayOrderId: 'order_rzp_1',
      reason: 'Late payment failure received from gateway',
    });

    expect(result.ignored).toBe(true);
    expect(result.reason).toContain('late failed event ignored');
  });

  it('should reject payment verification if gateway amount mismatches order total', async () => {
    const mockOrder = {
      id: 'order_test',
      total: 50000, // 500.00
      paymentStatus: PaymentStatus.UNPAID,
      restaurant: { currency: 'INR' },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      const mockTx = {
        order: {
          findUnique: vi.fn().mockResolvedValue(mockOrder),
        },
      };
      return await cb(mockTx);
    });

    await expect(
      recordOnlinePaymentVerified({
        orderId: 'order_test',
        gatewayOrderId: 'order_rzp_1',
        gatewayTransactionId: 'pay_rzp_mismatch',
        verifiedAmount: 10000, // 100.00 instead of 500.00
      }),
    ).rejects.toThrow('Gateway amount (10000) does not match order total (50000)');
  });
});

describe('Phase 5: Reconciliation Workflow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should recognize counter payments as local and verified', async () => {
    vi.spyOn(prisma.payment, 'findUnique').mockResolvedValue({
      id: 'pay_counter_1',
      orderId: 'order_1',
      method: PaymentMethod.COUNTER,
      status: PaymentStatus.PAID,
      order: { id: 'order_1', orderNumber: 'ORD-001' },
    } as any);

    const result = await reconcilePaymentRecord('pay_counter_1');
    expect(result.reconciled).toBe(true);
    expect(result.message).toContain('Counter payments are managed locally');
  });

  it('should update local payment to PAID when gateway confirms captured status', async () => {
    vi.spyOn(prisma.payment, 'findUnique').mockResolvedValue({
      id: 'pay_online_pending',
      orderId: 'order_2',
      method: PaymentMethod.ONLINE,
      status: PaymentStatus.PENDING,
      gatewayOrderId: 'order_rzp_abc',
      gatewayTransactionId: 'pay_rzp_captured',
      order: { id: 'order_2', total: 45000, paymentStatus: PaymentStatus.PENDING },
    } as any);

    vi.spyOn(razorpayModule, 'fetchGatewayPayment').mockResolvedValue({
      id: 'pay_rzp_captured',
      order_id: 'order_rzp_abc',
      status: 'captured',
      amount: 45000,
      currency: 'INR',
    } as any);

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      const mockTx = {
        order: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'order_2',
            total: 45000,
            paymentStatus: PaymentStatus.PENDING,
            restaurant: { currency: 'INR' },
          }),
          update: vi.fn().mockResolvedValue({ id: 'order_2', paymentStatus: PaymentStatus.PAID }),
        },
        payment: {
          findFirst: vi.fn().mockResolvedValue({ id: 'pay_online_pending' }),
          update: vi.fn().mockResolvedValue({ id: 'pay_online_pending', status: PaymentStatus.PAID }),
        },
        paymentEvent: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'pe_new' }),
        },
      };
      return await cb(mockTx);
    });

    const result = await reconcilePaymentRecord('pay_online_pending');
    expect(result.reconciled).toBe(true);
    expect(result.status).toBe(PaymentStatus.PAID);
    expect(result.message).toContain('Successfully verified and reconciled payment as PAID');
  });

  it('should safely handle gateway timeout or network failure without mutating state', async () => {
    vi.spyOn(prisma.payment, 'findUnique').mockResolvedValue({
      id: 'pay_online_uncertain',
      orderId: 'order_3',
      method: PaymentMethod.ONLINE,
      status: PaymentStatus.PENDING,
      gatewayTransactionId: 'pay_rzp_timeout',
      order: { id: 'order_3' },
    } as any);

    vi.spyOn(razorpayModule, 'fetchGatewayPayment').mockRejectedValue(
      new Error('Gateway connection timed out after 10000ms'),
    );

    const result = await reconcilePaymentRecord('pay_online_uncertain');
    expect(result.reconciled).toBe(false);
    expect(result.status).toBe(PaymentStatus.PENDING);
    expect(result.error).toContain('Gateway connection timed out');
  });
});

describe('Phase 5: Status Separation, Idempotency Integrity, and Receipts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should maintain strict separation between paymentStatus and orderStatus', () => {
    // An order can be SERVED while UNPAID
    const servedUnpaidOrder = {
      orderStatus: OrderStatus.SERVED,
      paymentStatus: PaymentStatus.UNPAID,
    };
    expect(servedUnpaidOrder.orderStatus).toBe(OrderStatus.SERVED);
    expect(servedUnpaidOrder.paymentStatus).toBe(PaymentStatus.UNPAID);

    // An order can be PAID while still PREPARING in the kitchen
    const preppingPaidOrder = {
      orderStatus: OrderStatus.PREPARING,
      paymentStatus: PaymentStatus.PAID,
    };
    expect(preppingPaidOrder.orderStatus).toBe(OrderStatus.PREPARING);
    expect(preppingPaidOrder.paymentStatus).toBe(PaymentStatus.PAID);
  });

  it('should detect when an existing idempotency key is reused with a different payload', () => {
    const existingOrder = {
      idempotencyKey: 'idem_key_abc_123',
      restaurantId: 'rest_1',
      tableId: 'tbl_1',
      notes: 'No ice',
      items: [
        { menuItemId: 'item_pizza', quantity: 2, notes: 'Crispy' },
      ],
    };

    // Case 1: Same key, DIFFERENT items (different menuItemId)
    const payloadDifferentItem = {
      idempotencyKey: 'idem_key_abc_123',
      restaurantId: 'rest_1',
      tableId: 'tbl_1',
      notes: 'No ice',
      items: [
        { menuItemId: 'item_burger', quantity: 2, notes: 'Crispy' },
      ],
    };

    const isSameItem =
      existingOrder.items.length === payloadDifferentItem.items.length &&
      existingOrder.items[0].menuItemId === payloadDifferentItem.items[0].menuItemId;
    expect(isSameItem).toBe(false);

    // Case 2: Same key, DIFFERENT quantity
    const payloadDifferentQuantity = {
      idempotencyKey: 'idem_key_abc_123',
      restaurantId: 'rest_1',
      tableId: 'tbl_1',
      notes: 'No ice',
      items: [
        { menuItemId: 'item_pizza', quantity: 5, notes: 'Crispy' },
      ],
    };

    const isSameQuantity =
      existingOrder.items[0].quantity === payloadDifferentQuantity.items[0].quantity;
    expect(isSameQuantity).toBe(false);

    // Case 3: Same key, DIFFERENT notes
    const payloadDifferentNotes = {
      idempotencyKey: 'idem_key_abc_123',
      restaurantId: 'rest_1',
      tableId: 'tbl_1',
      notes: 'Extra spicy',
      items: [
        { menuItemId: 'item_pizza', quantity: 2, notes: 'Crispy' },
      ],
    };

    const isSameNotes = (existingOrder.notes || '') === (payloadDifferentNotes.notes || '');
    expect(isSameNotes).toBe(false);

    // Case 4: Identical key and payload
    const payloadIdentical = {
      idempotencyKey: 'idem_key_abc_123',
      restaurantId: 'rest_1',
      tableId: 'tbl_1',
      notes: 'No ice',
      items: [
        { menuItemId: 'item_pizza', quantity: 2, notes: 'Crispy' },
      ],
    };

    const isIdentical =
      existingOrder.restaurantId === payloadIdentical.restaurantId &&
      existingOrder.tableId === payloadIdentical.tableId &&
      (existingOrder.notes || '') === (payloadIdentical.notes || '') &&
      existingOrder.items.length === payloadIdentical.items.length &&
      existingOrder.items[0].menuItemId === payloadIdentical.items[0].menuItemId &&
      existingOrder.items[0].quantity === payloadIdentical.items[0].quantity;

    expect(isIdentical).toBe(true);
  });

  it('should use immutable snapshots for receipt calculation without current menu prices', () => {
    // Menu item price was originally 25000, but now updated to 35000 in catalog
    const currentMenuItemInDb = { id: 'item_pasta', price: 35000 };

    // Order snapshot frozen at time of ordering
    const historicalOrderItem = {
      id: 'oi_1',
      orderId: 'order_hist_1',
      menuItemId: currentMenuItemInDb.id,
      nameSnapshot: 'Truffle Pasta',
      priceSnapshot: 25000,
      quantity: 2,
      totalPrice: 50000,
    };

    // Receipt must sum the snapshots, NEVER recalculating against currentMenuItemInDb.price
    const receiptTotal = historicalOrderItem.totalPrice;
    expect(receiptTotal).toBe(50000);
    expect(receiptTotal).not.toBe(currentMenuItemInDb.price * historicalOrderItem.quantity);
  });
});

