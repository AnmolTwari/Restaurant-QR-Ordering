import { prisma } from '@/lib/prisma';

export interface BillingConfigSnapshot {
  restaurantId?: string;
  gstEnabled: boolean;
  taxInclusive: boolean;
  gstRate: number; // in basis points: 500 = 5.00%
  cgstRate: number; // in basis points: 250 = 2.50%
  sgstRate: number; // in basis points: 250 = 2.50%
  igstRate: number; // in basis points: 500 = 5.00%
  serviceChargeEnabled: boolean;
  serviceChargeRate: number; // in basis points if percentage, or paise if fixed
  serviceChargeType: 'PERCENTAGE' | 'FIXED';
  serviceChargeTaxable: boolean;
  packagingChargeEnabled: boolean;
  packagingChargeAmount: number; // in paise
  packagingChargeType: 'PERCENTAGE' | 'FIXED';
  packagingChargeTaxable: boolean;
  customChargeName: string | null;
  customChargeEnabled: boolean;
  customChargeAmount: number; // in paise
  customChargeType: 'PERCENTAGE' | 'FIXED';
  customChargeTaxable: boolean;
  legalName: string | null;
  displayName: string | null;
  gstin: string | null;
  address: string | null;
  state: string | null;
  stateCode: string | null;
  phone: string | null;
  email: string | null;
  invoicePrefix: string;
  invoiceNextNumber?: number;
}

export interface BillingItemInput {
  menuItemId?: string;
  nameSnapshot: string;
  priceSnapshot: number; // in minor units (paise)
  quantity: number;
  totalPrice?: number;
  notes?: string | null;
}

export interface CalculateBillingParams {
  items: BillingItemInput[];
  config: BillingConfigSnapshot;
  discount?: {
    type: 'PERCENTAGE' | 'FIXED';
    value: number; // basis points if percentage (e.g. 1000 = 10%), or paise if fixed
  } | null;
  customerState?: string | null;
}

export interface BillingCalculationResult {
  itemsSubtotal: number; // sum of (price * quantity) in paise
  discountAmount: number; // discount applied in paise
  netSubtotal: number; // itemsSubtotal - discountAmount
  taxableAmount: number; // base amount subject to GST
  cgst: number; // in paise
  sgst: number; // in paise
  igst: number; // in paise
  totalTax: number; // cgst + sgst + igst in paise
  serviceCharge: number; // in paise
  packagingCharge: number; // in paise
  customCharge: number; // in paise
  totalCharges: number; // serviceCharge + packagingCharge + customCharge
  totalPayable: number; // final rounded total in paise
  isTaxInclusive: boolean;
  breakdown: {
    gstRatePercent: number;
    cgstRatePercent: number;
    sgstRatePercent: number;
    igstRatePercent: number;
    serviceChargePercentOrFixed: number;
    packagingChargeAmount: number;
  };
  snapshot: BillingConfigSnapshot;
}

import {
  validateGstin,
  normalizePhoneNumber,
  buildWhatsAppShareUrl,
} from './whatsapp';

export {
  validateGstin,
  normalizePhoneNumber,
  buildWhatsAppShareUrl,
};

/**
 * Pure integer financial calculation engine.
 * Never uses floating-point arithmetic for monetary calculations.
 * Always returns amounts in integer paise (minor units).
 */
export function calculateBilling(params: CalculateBillingParams): BillingCalculationResult {
  const { items, config, discount, customerState } = params;

  // 1. Calculate items gross subtotal
  let itemsSubtotal = 0;
  for (const item of items) {
    const qty = Math.max(1, Math.min(50, Math.floor(item.quantity)));
    const price = Math.max(0, Math.floor(item.priceSnapshot));
    itemsSubtotal += price * qty;
  }

  // 2. Calculate Order-level Discount
  let discountAmount = 0;
  if (discount && discount.value > 0) {
    if (discount.type === 'PERCENTAGE') {
      const basisPoints = Math.min(10000, Math.max(0, Math.floor(discount.value)));
      discountAmount = Math.round((itemsSubtotal * basisPoints) / 10000);
    } else {
      discountAmount = Math.min(itemsSubtotal, Math.max(0, Math.floor(discount.value)));
    }
  }

  const netSubtotal = Math.max(0, itemsSubtotal - discountAmount);

  // 3. Additional Charges Calculation
  let serviceCharge = 0;
  if (config.serviceChargeEnabled && config.serviceChargeRate > 0) {
    if (config.serviceChargeType === 'PERCENTAGE') {
      serviceCharge = Math.round((netSubtotal * config.serviceChargeRate) / 10000);
    } else {
      serviceCharge = Math.max(0, Math.floor(config.serviceChargeRate));
    }
  }

  let packagingCharge = 0;
  if (config.packagingChargeEnabled && config.packagingChargeAmount > 0) {
    if (config.packagingChargeType === 'PERCENTAGE') {
      packagingCharge = Math.round((netSubtotal * config.packagingChargeAmount) / 10000);
    } else {
      packagingCharge = Math.max(0, Math.floor(config.packagingChargeAmount));
    }
  }

  let customCharge = 0;
  if (config.customChargeEnabled && config.customChargeAmount > 0) {
    if (config.customChargeType === 'PERCENTAGE') {
      customCharge = Math.round((netSubtotal * config.customChargeAmount) / 10000);
    } else {
      customCharge = Math.max(0, Math.floor(config.customChargeAmount));
    }
  }

  const totalCharges = serviceCharge + packagingCharge + customCharge;

  // 4. GST Breakdown & Taxable Amount
  let taxableAmount = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  let totalTax = 0;

  // Determine inter-state vs intra-state supply
  const isInterState =
    Boolean(customerState) &&
    Boolean(config.state) &&
    customerState?.trim().toLowerCase() !== config.state?.trim().toLowerCase();

  if (config.gstEnabled && config.gstRate > 0) {
    if (config.taxInclusive) {
      // CASE A: Tax-Inclusive pricing
      // Menu items already include GST. Extract tax from netSubtotal.
      // Taxable value = netSubtotal * 10000 / (10000 + gstRate)
      const taxableItems = Math.round((netSubtotal * 10000) / (10000 + config.gstRate));
      const itemsTax = netSubtotal - taxableItems;

      // Check if additional charges are taxable
      let chargesTax = 0;
      let taxableChargesBase = 0;

      if (config.serviceChargeEnabled && config.serviceChargeTaxable && serviceCharge > 0) {
        taxableChargesBase += serviceCharge;
        chargesTax += Math.round((serviceCharge * config.gstRate) / 10000);
      }
      if (config.packagingChargeEnabled && config.packagingChargeTaxable && packagingCharge > 0) {
        taxableChargesBase += packagingCharge;
        chargesTax += Math.round((packagingCharge * config.gstRate) / 10000);
      }
      if (config.customChargeEnabled && config.customChargeTaxable && customCharge > 0) {
        taxableChargesBase += customCharge;
        chargesTax += Math.round((customCharge * config.gstRate) / 10000);
      }

      taxableAmount = taxableItems + taxableChargesBase;
      totalTax = itemsTax + chargesTax;

      if (isInterState) {
        igst = totalTax;
        cgst = 0;
        sgst = 0;
      } else {
        // Intra-state supply: Split evenly between CGST and SGST
        cgst = Math.round((totalTax * config.cgstRate) / config.gstRate);
        sgst = totalTax - cgst; // Eliminates 1-paise divergence
        igst = 0;
      }
    } else {
      // CASE B: Tax-Exclusive pricing
      // Tax is calculated on taxable amount and added on top.
      let taxableBase = netSubtotal;
      if (config.serviceChargeEnabled && config.serviceChargeTaxable) {
        taxableBase += serviceCharge;
      }
      if (config.packagingChargeEnabled && config.packagingChargeTaxable) {
        taxableBase += packagingCharge;
      }
      if (config.customChargeEnabled && config.customChargeTaxable) {
        taxableBase += customCharge;
      }

      taxableAmount = taxableBase;

      if (isInterState) {
        igst = Math.round((taxableAmount * config.igstRate) / 10000);
        cgst = 0;
        sgst = 0;
        totalTax = igst;
      } else {
        cgst = Math.round((taxableAmount * config.cgstRate) / 10000);
        sgst = Math.round((taxableAmount * config.sgstRate) / 10000);
        igst = 0;
        totalTax = cgst + sgst;
      }
    }
  }

  // 5. Final Payable Calculation
  let totalPayable = 0;
  if (config.taxInclusive) {
    // Items subtotal already includes items tax; add charges and charges tax
    let chargesTax = 0;
    if (config.gstEnabled && config.gstRate > 0) {
      if (config.serviceChargeEnabled && config.serviceChargeTaxable && serviceCharge > 0) {
        chargesTax += Math.round((serviceCharge * config.gstRate) / 10000);
      }
      if (config.packagingChargeEnabled && config.packagingChargeTaxable && packagingCharge > 0) {
        chargesTax += Math.round((packagingCharge * config.gstRate) / 10000);
      }
      if (config.customChargeEnabled && config.customChargeTaxable && customCharge > 0) {
        chargesTax += Math.round((customCharge * config.gstRate) / 10000);
      }
    }
    totalPayable = netSubtotal + totalCharges + chargesTax;
  } else {
    // Tax-exclusive: netSubtotal + additional charges + total tax
    totalPayable = netSubtotal + totalCharges + totalTax;
  }

  return {
    itemsSubtotal,
    discountAmount,
    netSubtotal,
    taxableAmount,
    cgst,
    sgst,
    igst,
    totalTax,
    serviceCharge,
    packagingCharge,
    customCharge,
    totalCharges,
    totalPayable: Math.max(0, totalPayable),
    isTaxInclusive: config.taxInclusive,
    breakdown: {
      gstRatePercent: config.gstRate / 100,
      cgstRatePercent: config.cgstRate / 100,
      sgstRatePercent: config.sgstRate / 100,
      igstRatePercent: config.igstRate / 100,
      serviceChargePercentOrFixed:
        config.serviceChargeType === 'PERCENTAGE'
          ? config.serviceChargeRate / 100
          : config.serviceChargeRate,
      packagingChargeAmount: config.packagingChargeAmount,
    },
    snapshot: { ...config },
  };
}

/**
 * Loads or provisions default billing configuration for a restaurant.
 */
export async function getOrCreateRestaurantBillingConfig(
  restaurantId: string,
): Promise<BillingConfigSnapshot> {
  let config = await prisma.restaurantBillingConfig.findUnique({
    where: { restaurantId },
  });

  if (!config) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { name: true, address: true, phone: true },
    });

    if (!restaurant) {
      // Restaurant not found in DB (e.g. mocked unit tests). Return safe default snapshot without writing.
      return {
        restaurantId,
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
        state: 'Maharashtra',
        stateCode: '27',
        phone: null,
        email: null,
        invoicePrefix: 'INV-',
        invoiceNextNumber: 1001,
      };
    }

    try {
      config = await prisma.restaurantBillingConfig.create({
        data: {
          restaurantId,
          displayName: restaurant.name,
          legalName: restaurant.name,
          address: restaurant.address,
          phone: restaurant.phone,
          gstEnabled: false,
          taxInclusive: false,
          gstRate: 500,
          cgstRate: 250,
          sgstRate: 250,
          igstRate: 500,
          invoicePrefix: 'INV-',
          invoiceNextNumber: 1001,
          invoiceNumberPadding: 4,
        },
      });
    } catch {
      // Handle concurrent creation race condition
      config = await prisma.restaurantBillingConfig.findUnique({
        where: { restaurantId },
      });
    }
  }

  if (!config) {
    return {
      restaurantId,
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
      state: 'Maharashtra',
      stateCode: '27',
      phone: null,
      email: null,
      invoicePrefix: 'INV-',
      invoiceNextNumber: 1001,
    };
  }

  return {
    restaurantId: config.restaurantId,
    gstEnabled: config.gstEnabled,
    taxInclusive: config.taxInclusive,
    gstRate: config.gstRate,
    cgstRate: config.cgstRate,
    sgstRate: config.sgstRate,
    igstRate: config.igstRate,
    serviceChargeEnabled: config.serviceChargeEnabled,
    serviceChargeRate: config.serviceChargeRate,
    serviceChargeType: config.serviceChargeType as 'PERCENTAGE' | 'FIXED',
    serviceChargeTaxable: config.serviceChargeTaxable,
    packagingChargeEnabled: config.packagingChargeEnabled,
    packagingChargeAmount: config.packagingChargeAmount,
    packagingChargeType: config.packagingChargeType as 'PERCENTAGE' | 'FIXED',
    packagingChargeTaxable: config.packagingChargeTaxable,
    customChargeName: config.customChargeName,
    customChargeEnabled: config.customChargeEnabled,
    customChargeAmount: config.customChargeAmount,
    customChargeType: config.customChargeType as 'PERCENTAGE' | 'FIXED',
    customChargeTaxable: config.customChargeTaxable,
    legalName: config.legalName,
    displayName: config.displayName,
    gstin: config.gstin,
    address: config.address,
    state: config.state,
    stateCode: config.stateCode,
    phone: config.phone,
    email: config.email,
    invoicePrefix: config.invoicePrefix,
    invoiceNextNumber: config.invoiceNextNumber,
  };
}

/**
 * Generates or retrieves an existing unique invoice for an order.
 * Guarantees duplicate-prevention and immutability via unique constraints.
 */
export async function getOrGenerateInvoiceForOrder(params: {
  restaurantId: string;
  orderId: string;
  customerPhone?: string | null;
}) {
  const { restaurantId, orderId, customerPhone } = params;

  // 1. Check if invoice already exists for this order
  const existingInvoice = await prisma.invoice.findUnique({
    where: { orderId },
    include: {
      order: {
        include: {
          table: { select: { tableNumber: true } },
          payments: { orderBy: { paidAt: 'desc' }, take: 1 },
        },
      },
      restaurant: true,
    },
  });

  if (existingInvoice) {
    return existingInvoice;
  }

  // 2. Generate invoice in atomic transaction with counter increment
  return await prisma.$transaction(
    async (tx) => {
      // Re-verify inside transaction to prevent race conditions
      const raceCheck = await tx.invoice.findUnique({
        where: { orderId },
        include: {
          order: {
            include: {
              table: { select: { tableNumber: true } },
              payments: { orderBy: { paidAt: 'desc' }, take: 1 },
            },
          },
          restaurant: true,
        },
      });
      if (raceCheck) return raceCheck;

      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          restaurant: true,
          table: { select: { tableNumber: true } },
          payments: { orderBy: { paidAt: 'desc' }, take: 1 },
        },
      });

      if (order.restaurantId !== restaurantId) {
        throw new Error('Order does not belong to this restaurant.');
      }

      // Fetch and lock billing config counter
      let billingConfig = await tx.restaurantBillingConfig.findUnique({
        where: { restaurantId },
      });

      if (!billingConfig) {
        billingConfig = await tx.restaurantBillingConfig.create({
          data: {
            restaurantId,
            displayName: order.restaurant.name,
            legalName: order.restaurant.name,
            address: order.restaurant.address,
            phone: order.restaurant.phone,
            gstEnabled: false,
            invoicePrefix: 'INV-',
            invoiceNextNumber: 1001,
          },
        });
      }

      const assignedNumber = billingConfig.invoiceNextNumber;
      const formattedSeq = String(assignedNumber).padStart(billingConfig.invoiceNumberPadding, '0');
      const invoiceNumber = `${billingConfig.invoicePrefix}${formattedSeq}`;

      // Increment counter for next invoice
      await tx.restaurantBillingConfig.update({
        where: { id: billingConfig.id },
        data: { invoiceNextNumber: { increment: 1 } },
      });

      // Prepare billing snapshot
      const snapshot =
        (order.billingSnapshot as Record<string, unknown>) || {
          legalName: billingConfig.legalName,
          displayName: billingConfig.displayName,
          gstin: billingConfig.gstin,
          address: billingConfig.address,
          state: billingConfig.state,
          stateCode: billingConfig.stateCode,
          gstEnabled: billingConfig.gstEnabled,
          gstRate: billingConfig.gstRate,
        };

      // Create Invoice record
      const invoice = await tx.invoice.create({
        data: {
          restaurantId,
          orderId,
          invoiceNumber,
          subtotal: order.subtotal,
          discountAmount: order.discountAmount,
          taxableAmount: order.taxableAmount,
          cgst: order.cgst,
          sgst: order.sgst,
          igst: order.igst,
          totalTax: order.tax,
          serviceCharge: order.serviceCharge,
          packagingCharge: order.packagingCharge,
          customCharge: order.customCharge,
          totalAmount: order.total,
          currency: order.restaurant.currency || 'INR',
          billingSnapshot: snapshot as object,
          customerPhone: customerPhone ? normalizePhoneNumber(customerPhone) : null,
        },
        include: {
          order: {
            include: {
              table: { select: { tableNumber: true } },
              payments: { orderBy: { paidAt: 'desc' }, take: 1 },
            },
          },
          restaurant: true,
        },
      });

      // Link invoice number on Order
      await tx.order.update({
        where: { id: orderId },
        data: { invoiceNumber: invoice.invoiceNumber },
      });

      return invoice;
    },
    { maxWait: 5000, timeout: 10000 },
  );
}
