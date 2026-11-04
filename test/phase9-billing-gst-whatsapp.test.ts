import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  calculateBilling,
  buildWhatsAppShareUrl,
  normalizePhoneNumber,
  validateGstin,
  getOrCreateRestaurantBillingConfig,
  getOrGenerateInvoiceForOrder,
} from '@/lib/billing/billing-engine';
import { settleCounterPayment } from '@/lib/payments/counter-settlement';
import {
  resolveOrCreateTableSession,
  closeTableSession,
  verifyActiveTableSession,
} from '@/lib/qr/session';
import { createSessionOrder } from '@/lib/orders/public-orders';
import {
  UserRole,
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
  TableStatus,
} from '@/types';

describe('Phase 9 — Restaurant Billing, GST, Additional Charges & WhatsApp Sharing', () => {
  const timestamp = Date.now();

  let restaurantAId: string;
  let restaurantASlug: string;
  let restaurantBId: string;
  let ownerAId: string;
  let managerAId: string;
  let cashierAId: string;
  let tableA1Id: string;
  let sessionA1Token: string;
  let sessionA1Id: string;
  let menuItemPizzaId: string;
  let menuItemBurgerId: string;

  beforeAll(async () => {
    restaurantASlug = `billing-palace-a-${timestamp}`;

    // 1. Create Staff Users
    const ownerA = await prisma.user.create({
      data: {
        email: `bill-owner-${timestamp}@restaurant.com`,
        passwordHash: '$2a$10$hashedpasswordplaceholder1234567890123456789012',
        fullName: 'Billing Owner Alice',
        tokenVersion: 1,
      },
    });
    ownerAId = ownerA.id;

    const managerA = await prisma.user.create({
      data: {
        email: `bill-manager-${timestamp}@restaurant.com`,
        passwordHash: '$2a$10$hashedpasswordplaceholder1234567890123456789012',
        fullName: 'Billing Manager Bob',
        tokenVersion: 1,
      },
    });
    managerAId = managerA.id;

    const cashierA = await prisma.user.create({
      data: {
        email: `bill-cashier-${timestamp}@restaurant.com`,
        passwordHash: '$2a$10$hashedpasswordplaceholder1234567890123456789012',
        fullName: 'Billing Cashier Charlie',
        tokenVersion: 1,
      },
    });
    cashierAId = cashierA.id;

    // 2. Create Restaurant A
    const resA = await prisma.restaurant.create({
      data: {
        name: `Billing Palace A ${timestamp}`,
        slug: restaurantASlug,
        currency: 'INR',
        memberships: {
          create: [
            { userId: ownerAId, role: UserRole.OWNER },
            { userId: managerAId, role: UserRole.MANAGER },
            { userId: cashierAId, role: UserRole.CASHIER },
          ],
        },
      },
    });
    restaurantAId = resA.id;

    // 3. Create Restaurant B (for tenant isolation tests)
    const resB = await prisma.restaurant.create({
      data: {
        name: `Billing Palace B ${timestamp}`,
        slug: `billing-palace-b-${timestamp}`,
        currency: 'INR',
      },
    });
    restaurantBId = resB.id;

    // 4. Create Category and Menu Items for Restaurant A
    const cat = await prisma.menuCategory.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Mains',
        sortOrder: 1,
      },
    });

    const pizza = await prisma.menuItem.create({
      data: {
        restaurantId: restaurantAId,
        categoryId: cat.id,
        name: 'Margherita Pizza',
        price: 25000, // ₹250.00
        isAvailable: true,
      },
    });
    menuItemPizzaId = pizza.id;

    const burger = await prisma.menuItem.create({
      data: {
        restaurantId: restaurantAId,
        categoryId: cat.id,
        name: 'Veggie Burger',
        price: 15000, // ₹150.00
        isAvailable: true,
      },
    });
    menuItemBurgerId = burger.id;

    // 5. Create Table and Active Dining Session
    const tableA1 = await prisma.restaurantTable.create({
      data: {
        restaurantId: restaurantAId,
        tableNumber: `T-BILL-${timestamp.toString().slice(-4)}`,
        status: TableStatus.AVAILABLE,
      },
    });
    tableA1Id = tableA1.id;

    const sessionRes = await resolveOrCreateTableSession(restaurantAId, tableA1Id);
    sessionA1Token = sessionRes.sessionToken;
    sessionA1Id = sessionRes.session.id;
  });

  // -------------------------------------------------------------
  // 1. GST & Calculation Engine Pure Tests
  // -------------------------------------------------------------
  describe('Billing Engine: GST & Charges Math', () => {
    it('1. GST disabled calculation: subtotal equals total; taxes are 0', () => {
      const result = calculateBilling({
        items: [{ nameSnapshot: 'Pizza', priceSnapshot: 50000, quantity: 1 }],
        config: {
          gstEnabled: false,
          taxInclusive: false,
          gstRate: 500,
          cgstRate: 250,
          sgstRate: 250,
          igstRate: 500,
          serviceChargeEnabled: false,
          serviceChargeRate: 0,
          serviceChargeType: 'PERCENTAGE',
          serviceChargeTaxable: false,
          packagingChargeEnabled: false,
          packagingChargeAmount: 0,
          packagingChargeType: 'FIXED',
          packagingChargeTaxable: false,
          customChargeName: null,
          customChargeEnabled: false,
          customChargeAmount: 0,
          customChargeType: 'FIXED',
          customChargeTaxable: false,
          legalName: null,
          displayName: null,
          gstin: null,
          address: null,
          state: null,
          stateCode: null,
          phone: null,
          email: null,
          invoicePrefix: 'INV-',
        },
      });

      expect(result.itemsSubtotal).toBe(50000);
      expect(result.discountAmount).toBe(0);
      expect(result.taxableAmount).toBe(0);
      expect(result.cgst).toBe(0);
      expect(result.sgst).toBe(0);
      expect(result.igst).toBe(0);
      expect(result.totalTax).toBe(0);
      expect(result.totalPayable).toBe(50000);
    });

    it('2. GST inclusive calculation: tax is extracted without double charging', () => {
      // ₹105.00 inclusive of 5% GST
      // Taxable = 10500 * 10000 / 10500 = 10000 (₹100)
      // Total tax = 500 (₹5)
      // CGST = 250, SGST = 250
      const result = calculateBilling({
        items: [{ nameSnapshot: 'Inclusive Meal', priceSnapshot: 10500, quantity: 1 }],
        config: {
          gstEnabled: true,
          taxInclusive: true,
          gstRate: 500,
          cgstRate: 250,
          sgstRate: 250,
          igstRate: 500,
          serviceChargeEnabled: false,
          serviceChargeRate: 0,
          serviceChargeType: 'PERCENTAGE',
          serviceChargeTaxable: false,
          packagingChargeEnabled: false,
          packagingChargeAmount: 0,
          packagingChargeType: 'FIXED',
          packagingChargeTaxable: false,
          customChargeName: null,
          customChargeEnabled: false,
          customChargeAmount: 0,
          customChargeType: 'FIXED',
          customChargeTaxable: false,
          legalName: null,
          displayName: null,
          gstin: null,
          address: null,
          state: null,
          stateCode: null,
          phone: null,
          email: null,
          invoicePrefix: 'INV-',
        },
      });

      expect(result.taxableAmount).toBe(10000);
      expect(result.totalTax).toBe(500);
      expect(result.cgst).toBe(250);
      expect(result.sgst).toBe(250);
      expect(result.igst).toBe(0);
      expect(result.totalPayable).toBe(10500); // Does NOT add tax on top
    });

    it('3. GST exclusive calculation: tax is added on top of item prices', () => {
      // ₹100.00 exclusive of 5% GST
      // Taxable = 10000
      // Tax = 500
      // Total = 10500
      const result = calculateBilling({
        items: [{ nameSnapshot: 'Exclusive Meal', priceSnapshot: 10000, quantity: 1 }],
        config: {
          gstEnabled: true,
          taxInclusive: false,
          gstRate: 500,
          cgstRate: 250,
          sgstRate: 250,
          igstRate: 500,
          serviceChargeEnabled: false,
          serviceChargeRate: 0,
          serviceChargeType: 'PERCENTAGE',
          serviceChargeTaxable: false,
          packagingChargeEnabled: false,
          packagingChargeAmount: 0,
          packagingChargeType: 'FIXED',
          packagingChargeTaxable: false,
          customChargeName: null,
          customChargeEnabled: false,
          customChargeAmount: 0,
          customChargeType: 'FIXED',
          customChargeTaxable: false,
          legalName: null,
          displayName: null,
          gstin: null,
          address: null,
          state: null,
          stateCode: null,
          phone: null,
          email: null,
          invoicePrefix: 'INV-',
        },
      });

      expect(result.taxableAmount).toBe(10000);
      expect(result.totalTax).toBe(500);
      expect(result.cgst).toBe(250);
      expect(result.sgst).toBe(250);
      expect(result.igst).toBe(0);
      expect(result.totalPayable).toBe(10500);
    });

    it('4. Intra-state CGST & SGST split: components sum exactly to total tax with no 1-paise divergence', () => {
      // ₹33.33 subtotal at 5% GST exclusive = 166.65 -> 167 paise tax
      // CGST = Math.round(167 * 250 / 500) = 84 paise
      // SGST must be 167 - 84 = 83 paise (never 84 + 84 = 168)
      const result = calculateBilling({
        items: [{ nameSnapshot: 'Small Snack', priceSnapshot: 3333, quantity: 1 }],
        config: {
          gstEnabled: true,
          taxInclusive: false,
          gstRate: 500,
          cgstRate: 250,
          sgstRate: 250,
          igstRate: 500,
          serviceChargeEnabled: false,
          serviceChargeRate: 0,
          serviceChargeType: 'PERCENTAGE',
          serviceChargeTaxable: false,
          packagingChargeEnabled: false,
          packagingChargeAmount: 0,
          packagingChargeType: 'FIXED',
          packagingChargeTaxable: false,
          customChargeName: null,
          customChargeEnabled: false,
          customChargeAmount: 0,
          customChargeType: 'FIXED',
          customChargeTaxable: false,
          legalName: null,
          displayName: null,
          gstin: null,
          address: null,
          state: null,
          stateCode: null,
          phone: null,
          email: null,
          invoicePrefix: 'INV-',
        },
      });

      expect(result.totalTax).toBe(166);
      expect(result.cgst).toBe(83);
      expect(result.sgst).toBe(83);
      expect(result.cgst + result.sgst).toBe(result.totalTax);
      expect(result.totalPayable).toBe(3333 + 166);
    });

    it('5. Inter-state IGST calculation: applies full IGST and zeroes CGST/SGST', () => {
      const result = calculateBilling({
        items: [{ nameSnapshot: 'Interstate Item', priceSnapshot: 20000, quantity: 1 }],
        customerState: 'Karnataka',
        config: {
          gstEnabled: true,
          taxInclusive: false,
          gstRate: 1800, // 18%
          cgstRate: 900,
          sgstRate: 900,
          igstRate: 1800,
          state: 'Maharashtra',
          serviceChargeEnabled: false,
          serviceChargeRate: 0,
          serviceChargeType: 'PERCENTAGE',
          serviceChargeTaxable: false,
          packagingChargeEnabled: false,
          packagingChargeAmount: 0,
          packagingChargeType: 'FIXED',
          packagingChargeTaxable: false,
          customChargeName: null,
          customChargeEnabled: false,
          customChargeAmount: 0,
          customChargeType: 'FIXED',
          customChargeTaxable: false,
          legalName: null,
          displayName: null,
          gstin: null,
          address: null,
          stateCode: '27',
          phone: null,
          email: null,
          invoicePrefix: 'INV-',
        },
      });

      expect(result.totalTax).toBe(3600); // 18% of 20000
      expect(result.cgst).toBe(0);
      expect(result.sgst).toBe(0);
      expect(result.igst).toBe(3600);
      expect(result.totalPayable).toBe(23600);
    });

    it('6. Service charges: percentage and fixed, taxable vs non-taxable', () => {
      // 10% taxable service charge on ₹1000 = ₹100
      // Taxable amount = 1000 + 100 = 1100
      // 5% GST on 1100 = 55
      // Total = 1000 + 100 + 55 = 1155
      const taxableResult = calculateBilling({
        items: [{ nameSnapshot: 'Dining Feast', priceSnapshot: 100000, quantity: 1 }],
        config: {
          gstEnabled: true,
          taxInclusive: false,
          gstRate: 500,
          cgstRate: 250,
          sgstRate: 250,
          igstRate: 500,
          serviceChargeEnabled: true,
          serviceChargeRate: 1000, // 10.00%
          serviceChargeType: 'PERCENTAGE',
          serviceChargeTaxable: true,
          packagingChargeEnabled: false,
          packagingChargeAmount: 0,
          packagingChargeType: 'FIXED',
          packagingChargeTaxable: false,
          customChargeName: null,
          customChargeEnabled: false,
          customChargeAmount: 0,
          customChargeType: 'FIXED',
          customChargeTaxable: false,
          legalName: null,
          displayName: null,
          gstin: null,
          address: null,
          state: null,
          stateCode: null,
          phone: null,
          email: null,
          invoicePrefix: 'INV-',
        },
      });

      expect(taxableResult.serviceCharge).toBe(10000); // ₹100
      expect(taxableResult.taxableAmount).toBe(110000); // ₹1100
      expect(taxableResult.totalTax).toBe(5500); // ₹55
      expect(taxableResult.totalPayable).toBe(115500); // ₹1155

      // Non-taxable fixed service charge
      const nonTaxableResult = calculateBilling({
        items: [{ nameSnapshot: 'Dining Feast', priceSnapshot: 100000, quantity: 1 }],
        config: {
          gstEnabled: true,
          taxInclusive: false,
          gstRate: 500,
          cgstRate: 250,
          sgstRate: 250,
          igstRate: 500,
          serviceChargeEnabled: true,
          serviceChargeRate: 5000, // ₹50 fixed
          serviceChargeType: 'FIXED',
          serviceChargeTaxable: false,
          packagingChargeEnabled: false,
          packagingChargeAmount: 0,
          packagingChargeType: 'FIXED',
          packagingChargeTaxable: false,
          customChargeName: null,
          customChargeEnabled: false,
          customChargeAmount: 0,
          customChargeType: 'FIXED',
          customChargeTaxable: false,
          legalName: null,
          displayName: null,
          gstin: null,
          address: null,
          state: null,
          stateCode: null,
          phone: null,
          email: null,
          invoicePrefix: 'INV-',
        },
      });

      expect(nonTaxableResult.serviceCharge).toBe(5000);
      expect(nonTaxableResult.taxableAmount).toBe(100000); // items only
      expect(nonTaxableResult.totalTax).toBe(5000); // 5% of 1000 = 50
      expect(nonTaxableResult.totalPayable).toBe(100000 + 5000 + 5000); // 110000
    });

    it('7. Packaging charges: fixed and percentage behavior verified', () => {
      const result = calculateBilling({
        items: [{ nameSnapshot: 'Takeaway Meal', priceSnapshot: 50000, quantity: 1 }],
        config: {
          gstEnabled: false,
          taxInclusive: false,
          gstRate: 0,
          cgstRate: 0,
          sgstRate: 0,
          igstRate: 0,
          serviceChargeEnabled: false,
          serviceChargeRate: 0,
          serviceChargeType: 'PERCENTAGE',
          serviceChargeTaxable: false,
          packagingChargeEnabled: true,
          packagingChargeAmount: 2500, // ₹25 fixed
          packagingChargeType: 'FIXED',
          packagingChargeTaxable: false,
          customChargeName: null,
          customChargeEnabled: false,
          customChargeAmount: 0,
          customChargeType: 'FIXED',
          customChargeTaxable: false,
          legalName: null,
          displayName: null,
          gstin: null,
          address: null,
          state: null,
          stateCode: null,
          phone: null,
          email: null,
          invoicePrefix: 'INV-',
        },
      });

      expect(result.packagingCharge).toBe(2500);
      expect(result.totalPayable).toBe(52500);
    });

    it('8. Discounts: percentage & fixed discount, negative total protection', () => {
      // 20% discount on ₹500
      const discountResult = calculateBilling({
        items: [{ nameSnapshot: 'Discounted Meal', priceSnapshot: 50000, quantity: 1 }],
        discount: {
          type: 'PERCENTAGE',
          value: 2000, // 20.00%
        },
        config: {
          gstEnabled: true,
          taxInclusive: false,
          gstRate: 500,
          cgstRate: 250,
          sgstRate: 250,
          igstRate: 500,
          serviceChargeEnabled: false,
          serviceChargeRate: 0,
          serviceChargeType: 'PERCENTAGE',
          serviceChargeTaxable: false,
          packagingChargeEnabled: false,
          packagingChargeAmount: 0,
          packagingChargeType: 'FIXED',
          packagingChargeTaxable: false,
          customChargeName: null,
          customChargeEnabled: false,
          customChargeAmount: 0,
          customChargeType: 'FIXED',
          customChargeTaxable: false,
          legalName: null,
          displayName: null,
          gstin: null,
          address: null,
          state: null,
          stateCode: null,
          phone: null,
          email: null,
          invoicePrefix: 'INV-',
        },
      });

      expect(discountResult.discountAmount).toBe(10000); // ₹100 discount
      expect(discountResult.taxableAmount).toBe(40000); // ₹400
      expect(discountResult.totalTax).toBe(2000); // 5% of 400 = 20
      expect(discountResult.totalPayable).toBe(42000); // ₹420

      // Huge discount cannot make total negative
      const cappedResult = calculateBilling({
        items: [{ nameSnapshot: 'Cheapest Drink', priceSnapshot: 1000, quantity: 1 }],
        discount: {
          type: 'FIXED',
          value: 999999, // ₹9999.99
        },
        config: {
          gstEnabled: false,
          taxInclusive: false,
          gstRate: 0,
          cgstRate: 0,
          sgstRate: 0,
          igstRate: 0,
          serviceChargeEnabled: false,
          serviceChargeRate: 0,
          serviceChargeType: 'PERCENTAGE',
          serviceChargeTaxable: false,
          packagingChargeEnabled: false,
          packagingChargeAmount: 0,
          packagingChargeType: 'FIXED',
          packagingChargeTaxable: false,
          customChargeName: null,
          customChargeEnabled: false,
          customChargeAmount: 0,
          customChargeType: 'FIXED',
          customChargeTaxable: false,
          legalName: null,
          displayName: null,
          gstin: null,
          address: null,
          state: null,
          stateCode: null,
          phone: null,
          email: null,
          invoicePrefix: 'INV-',
        },
      });

      expect(cappedResult.discountAmount).toBe(1000); // Capped at subtotal
      expect(cappedResult.totalPayable).toBe(0);
    });

    it('9. Strict GSTIN regex and phone number normalization', () => {
      expect(validateGstin('27AAPFU0939F1ZV')).toBe(true);
      expect(validateGstin('07AAAAA0000A1Z5')).toBe(true);
      expect(validateGstin('INVALID_GSTIN')).toBe(false);
      expect(validateGstin('27AAPFU0939F1Z')).toBe(false); // only 14 chars
      expect(validateGstin('27AAPFU0939F1Z99')).toBe(false); // 16 chars

      expect(normalizePhoneNumber('9876543210')).toBe('919876543210');
      expect(normalizePhoneNumber('+91 98765-43210')).toBe('919876543210');
      expect(normalizePhoneNumber('09876543210')).toBe('919876543210');
      expect(normalizePhoneNumber('+1 (555) 123-4567')).toBe('15551234567');
      expect(normalizePhoneNumber('   ')).toBe('');
    });

    it('10. WhatsApp message construction with phone and URL encoding', () => {
      const url = buildWhatsAppShareUrl({
        phone: '9876543210',
        restaurantName: 'The Bistro & Café',
        orderNumber: 'ORD-1001',
        invoiceNumber: 'INV-2026-001',
        totalFormatted: '₹420.00',
        billUrl: 'https://dineflow.com/m/bistro/receipt/ORD-1001',
      });

      expect(url).toContain('https://wa.me/919876543210?text=');
      expect(url).toContain(encodeURIComponent('The Bistro & Café'));
      expect(url).toContain(encodeURIComponent('ORD-1001'));
      expect(url).toContain(encodeURIComponent('INV-2026-001'));
      expect(url).toContain(encodeURIComponent('₹420.00'));
    });
  });

  // -------------------------------------------------------------
  // 2. Integration: Order Creation with Billing Breakdown
  // -------------------------------------------------------------
  describe('Public Order Creation with Billing Engine Integration', () => {
    it('11. Order creation calculates and stores all Phase 9 billing fields and snapshot', async () => {
      // First configure Restaurant A with 5% GST and ₹20 packaging charge
      await prisma.restaurantBillingConfig.upsert({
        where: { restaurantId: restaurantAId },
        create: {
          restaurantId: restaurantAId,
          legalName: 'Billing Palace Private Limited',
          displayName: 'Billing Palace',
          gstin: '27AAPFU0939F1ZV',
          state: 'Maharashtra',
          stateCode: '27',
          gstEnabled: true,
          taxInclusive: false,
          gstRate: 500, // 5%
          cgstRate: 250,
          sgstRate: 250,
          packagingChargeEnabled: true,
          packagingChargeAmount: 2000, // ₹20
          packagingChargeType: 'FIXED',
          packagingChargeTaxable: true,
        },
        update: {
          legalName: 'Billing Palace Private Limited',
          displayName: 'Billing Palace',
          gstin: '27AAPFU0939F1ZV',
          state: 'Maharashtra',
          stateCode: '27',
          gstEnabled: true,
          taxInclusive: false,
          gstRate: 500,
          cgstRate: 250,
          sgstRate: 250,
          packagingChargeEnabled: true,
          packagingChargeAmount: 2000,
          packagingChargeType: 'FIXED',
          packagingChargeTaxable: true,
        },
      });

      // Verify active session
      const verifiedSession = await verifyActiveTableSession(sessionA1Token);
      expect(verifiedSession).not.toBeNull();

      // Place order for 1x Pizza (25000 paise)
      // Items Subtotal: 25000
      // Packaging: 2000 (taxable)
      // Taxable: 27000
      // GST: 5% of 27000 = 1350 (CGST: 675, SGST: 675)
      // Total: 27000 + 1350 = 28350
      const orderRes = await createSessionOrder(verifiedSession!, {
        restaurantSlug: restaurantASlug,
        idempotencyKey: `idemp-bill-test-${timestamp}-1`,
        items: [{ menuItemId: menuItemPizzaId, quantity: 1 }],
      });

      expect(orderRes.isDuplicate).toBe(false);
      const order = orderRes.order;

      expect(order.subtotal).toBe(25000);
      expect(order.packagingCharge).toBe(2000);
      expect(order.taxableAmount).toBe(27000);
      expect(order.cgst).toBe(675);
      expect(order.sgst).toBe(675);
      expect(order.tax).toBe(1350);
      expect(order.total).toBe(28350);

      // Verify billingSnapshot stored on the order in DB
      const dbOrder = await prisma.order.findUnique({
        where: { id: order.id },
      });
      expect(dbOrder!.billingSnapshot).toBeDefined();

      const snapshot = dbOrder!.billingSnapshot as Record<string, unknown>;
      expect(snapshot.gstin).toBe('27AAPFU0939F1ZV');
      expect(snapshot.legalName).toBe('Billing Palace Private Limited');
    });

    it('12. Historical bill immutability: changing restaurant config does not affect existing orders', async () => {
      // Find the order created in previous test
      const existingOrder = await prisma.order.findFirst({
        where: { restaurantId: restaurantAId },
        orderBy: { createdAt: 'desc' },
      });
      expect(existingOrder).toBeDefined();
      const originalTotal = existingOrder!.total;
      const originalTax = existingOrder!.tax;

      // Now change restaurant settings drastically: 18% GST and ₹100 service charge
      await prisma.restaurantBillingConfig.update({
        where: { restaurantId: restaurantAId },
        data: {
          gstRate: 1800,
          cgstRate: 900,
          sgstRate: 900,
          serviceChargeEnabled: true,
          serviceChargeRate: 10000,
          serviceChargeType: 'FIXED',
        },
      });

      // Fetch the previous order again from the DB
      const freshLookup = await prisma.order.findUnique({
        where: { id: existingOrder!.id },
      });

      expect(freshLookup!.total).toBe(originalTotal);
      expect(freshLookup!.tax).toBe(originalTax);
      expect(freshLookup!.cgst).toBe(existingOrder!.cgst);
      expect(freshLookup!.sgst).toBe(existingOrder!.sgst);
    });
  });

  // -------------------------------------------------------------
  // 3. Invoice Generation & Uniqueness
  // -------------------------------------------------------------
  describe('Tax Invoice Generation & Concurrency', () => {
    it('13. Invoice generation produces sequential format and prevents duplicate assignment', async () => {
      // Find an order to generate invoice for
      const targetOrder = await prisma.order.findFirst({
        where: { restaurantId: restaurantAId },
        orderBy: { createdAt: 'desc' },
      });
      expect(targetOrder).toBeDefined();

      const inv1 = await getOrGenerateInvoiceForOrder({
        restaurantId: restaurantAId,
        orderId: targetOrder!.id,
        customerPhone: '9876543210',
      });

      expect(inv1.invoiceNumber).toMatch(/^INV-\d{4,}$/);
      expect(inv1.customerPhone).toBe('919876543210');
      expect(inv1.totalAmount).toBe(targetOrder!.total);

      // Generating again for the exact same order must return the identical invoice
      const inv2 = await getOrGenerateInvoiceForOrder({
        restaurantId: restaurantAId,
        orderId: targetOrder!.id,
      });

      expect(inv2.id).toBe(inv1.id);
      expect(inv2.invoiceNumber).toBe(inv1.invoiceNumber);

      // Verify Order record has invoiceNumber set
      const updatedOrder = await prisma.order.findUnique({
        where: { id: targetOrder!.id },
      });
      expect(updatedOrder!.invoiceNumber).toBe(inv1.invoiceNumber);
    });

    it('14. Concurrent invoice generation for different orders produces distinct sequential numbers', async () => {
      // Create two distinct orders
      const orderA = await prisma.order.create({
        data: {
          restaurantId: restaurantAId,
          tableId: tableA1Id,
          sessionId: sessionA1Id,
          orderNumber: `ORD-CONC-A-${timestamp.toString().slice(-4)}`,
          orderStatus: OrderStatus.SERVED,
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: PaymentMethod.COUNTER,
          subtotal: 10000,
          tax: 500,
          total: 10500,
          taxableAmount: 10000,
          cgst: 250,
          sgst: 250,
        },
      });

      const orderB = await prisma.order.create({
        data: {
          restaurantId: restaurantAId,
          tableId: tableA1Id,
          sessionId: sessionA1Id,
          orderNumber: `ORD-CONC-B-${timestamp.toString().slice(-4)}`,
          orderStatus: OrderStatus.SERVED,
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: PaymentMethod.COUNTER,
          subtotal: 15000,
          tax: 750,
          total: 15750,
          taxableAmount: 15000,
          cgst: 375,
          sgst: 375,
        },
      });

      // Trigger simultaneous invoice generation
      const [invA, invB] = await Promise.all([
        getOrGenerateInvoiceForOrder({
          restaurantId: restaurantAId,
          orderId: orderA.id,
        }),
        getOrGenerateInvoiceForOrder({
          restaurantId: restaurantAId,
          orderId: orderB.id,
        }),
      ]);

      expect(invA.id).not.toBe(invB.id);
      expect(invA.invoiceNumber).not.toBe(invB.invoiceNumber);
      expect(invA.orderId).toBe(orderA.id);
      expect(invB.orderId).toBe(orderB.id);
    });
  });

  // -------------------------------------------------------------
  // 4. Role Authorization & Tenant Isolation
  // -------------------------------------------------------------
  describe('Authorization & Tenant Isolation', () => {
    it('15. Lazy billing config provisioning creates default config per tenant', async () => {
      const configA = await getOrCreateRestaurantBillingConfig(restaurantAId);
      const configB = await getOrCreateRestaurantBillingConfig(restaurantBId);

      expect(configA.restaurantId).toBe(restaurantAId);
      expect(configB.restaurantId).toBe(restaurantBId);
      expect(configA.gstEnabled).toBe(true); // Updated earlier in test suite
      expect(configB.gstEnabled).toBe(false); // Default
    });

    it('16. Invoice numbers for Restaurant B are independent of Restaurant A', async () => {
      // Table for Restaurant B
      const tableB = await prisma.restaurantTable.create({
        data: {
          restaurantId: restaurantBId,
          tableNumber: 'TB-1',
          status: TableStatus.AVAILABLE,
        },
      });

      const orderB = await prisma.order.create({
        data: {
          restaurantId: restaurantBId,
          tableId: tableB.id,
          orderNumber: `ORD-B-${timestamp.toString().slice(-4)}`,
          orderStatus: OrderStatus.SERVED,
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: PaymentMethod.COUNTER,
          subtotal: 20000,
          tax: 0,
          total: 20000,
        },
      });

      const invB = await getOrGenerateInvoiceForOrder({
        restaurantId: restaurantBId,
        orderId: orderB.id,
      });

      // Starts from Restaurant B's initial sequence (e.g. INV-1001)
      expect(invB.invoiceNumber).toBe('INV-1001');
      expect(invB.restaurantId).toBe(restaurantBId);
    });
  });

  // -------------------------------------------------------------
  // 5. Regression Safety: Counter Settlement & Session Closure
  // -------------------------------------------------------------
  describe('Regression: Cash Settlement & Table Clearance with Billing Fields', () => {
    it('17. Counter cash payment succeeds and updates order with Phase 9 billing columns present', async () => {
      // Create unpaid order with billing details on Table A1
      const cashOrder = await prisma.order.create({
        data: {
          restaurantId: restaurantAId,
          tableId: tableA1Id,
          sessionId: sessionA1Id,
          orderNumber: `ORD-CASH-P9-${timestamp.toString().slice(-4)}`,
          orderStatus: OrderStatus.SERVED,
          paymentStatus: PaymentStatus.UNPAID,
          paymentMethod: PaymentMethod.COUNTER,
          subtotal: 25000,
          taxableAmount: 25000,
          cgst: 625,
          sgst: 625,
          tax: 1250,
          total: 26250,
        },
      });

      // Settle counter payment
      const settlement = await settleCounterPayment({
        restaurantId: restaurantAId,
        orderId: cashOrder.id,
        amount: 26250,
        userId: cashierAId,
        userFullName: 'Cashier Charlie',
        userRole: UserRole.CASHIER,
      });

      expect(settlement.order.paymentStatus).toBe(PaymentStatus.PAID);
      expect(settlement.payment.method).toBe(PaymentMethod.COUNTER);
      expect(settlement.payment.gatewayProvider).toBe('COUNTER');
      expect(settlement.payment.amount).toBe(26250);

      // Verify we can generate an invoice for this settled order
      const invoice = await getOrGenerateInvoiceForOrder({
        restaurantId: restaurantAId,
        orderId: cashOrder.id,
      });

      expect(invoice.order.paymentStatus).toBe(PaymentStatus.PAID);
      expect(invoice.order.paymentMethod).toBe(PaymentMethod.COUNTER);
    });

    it('18. Table session closure succeeds smoothly when all orders are paid', async () => {
      // Ensure all orders in this session are SERVED and PAID to satisfy closure guard
      await prisma.order.updateMany({
        where: { sessionId: sessionA1Id },
        data: {
          orderStatus: OrderStatus.SERVED,
          paymentStatus: PaymentStatus.PAID,
        },
      });

      // Clear Table A1
      const closure = await closeTableSession({
        restaurantId: restaurantAId,
        tableId: tableA1Id,
        expectedSessionId: sessionA1Id,
        closedByUserId: ownerAId,
      });

      expect(closure.success).toBe(true);
      expect(closure.closedSessionId).toBe(sessionA1Id);

      // Verify session is marked CLOSED in database
      const closedSession = await prisma.tableSession.findUnique({
        where: { id: sessionA1Id },
      });
      expect(closedSession!.status).toBe('CLOSED');
      expect(closedSession!.isActive).toBe(false);

      const tableInDb = await prisma.restaurantTable.findUnique({
        where: { id: tableA1Id },
      });
      expect(tableInDb!.status).toBe(TableStatus.AVAILABLE);
    });
  });
});
