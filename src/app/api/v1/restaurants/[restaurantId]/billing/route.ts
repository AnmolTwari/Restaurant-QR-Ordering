import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireRestaurantAccess } from '@/lib/auth/guards';
import { UserRole } from '@/types';
import { apiSuccess, handleApiError } from '@/lib/api-response';
import {
  getOrCreateRestaurantBillingConfig,
  validateGstin,
} from '@/lib/billing/billing-engine';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    restaurantId: string;
  }>;
}

const UpdateBillingConfigSchema = z.object({
  legalName: z.string().max(100).nullable().optional(),
  displayName: z.string().max(100).nullable().optional(),
  gstin: z.string().max(20).nullable().optional(),
  address: z.string().max(250).nullable().optional(),
  state: z.string().max(50).nullable().optional(),
  stateCode: z.string().max(10).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  email: z.string().email().max(100).nullable().optional().or(z.literal('')),
  invoicePrefix: z.string().min(1).max(10).default('INV-'),
  invoiceNextNumber: z.number().int().min(1).optional(),
  invoiceNumberPadding: z.number().int().min(1).max(8).optional(),
  gstEnabled: z.boolean().default(false),
  taxInclusive: z.boolean().default(false),
  gstRate: z.number().int().min(0).max(2800).default(500), // in basis points (500 = 5.00%)
  cgstRate: z.number().int().min(0).max(1400).optional(),
  sgstRate: z.number().int().min(0).max(1400).optional(),
  igstRate: z.number().int().min(0).max(2800).optional(),
  serviceChargeEnabled: z.boolean().default(false),
  serviceChargeRate: z.number().int().min(0).default(0),
  serviceChargeType: z.enum(['PERCENTAGE', 'FIXED']).default('PERCENTAGE'),
  serviceChargeTaxable: z.boolean().default(true),
  packagingChargeEnabled: z.boolean().default(false),
  packagingChargeAmount: z.number().int().min(0).default(0),
  packagingChargeType: z.enum(['PERCENTAGE', 'FIXED']).default('FIXED'),
  packagingChargeTaxable: z.boolean().default(true),
  customChargeName: z.string().max(50).nullable().optional(),
  customChargeEnabled: z.boolean().default(false),
  customChargeAmount: z.number().int().min(0).default(0),
  customChargeType: z.enum(['PERCENTAGE', 'FIXED']).default('FIXED'),
  customChargeTaxable: z.boolean().default(false),
  defaultDiscountType: z.enum(['PERCENTAGE', 'FIXED']).default('PERCENTAGE'),
  maxDiscountPercent: z.number().int().min(0).max(100).default(100),
}).refine(
  (data) => {
    if (data.gstin && data.gstin.trim().length > 0) {
      return validateGstin(data.gstin.trim());
    }
    return true;
  },
  {
    message:
      'Invalid GSTIN format. Must be a valid 15-character Indian Goods and Services Tax Identification Number (e.g. 27AAPFU0939F1ZV).',
    path: ['gstin'],
  },
);

/**
 * GET: Retrieve billing & tax configuration.
 * Accessible to OWNER and MANAGER.
 */
export async function GET(req: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    const { restaurant, membership } = await requireRestaurantAccess(
      params.restaurantId,
      [UserRole.OWNER, UserRole.MANAGER],
    );

    const config = await getOrCreateRestaurantBillingConfig(restaurant.id);

    return apiSuccess({
      config,
      userRole: membership.role,
      isOwner: membership.role === UserRole.OWNER,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT: Update billing & tax configuration.
 * Strictly restricted to OWNER role only.
 */
export async function PUT(req: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    const { restaurant } = await requireRestaurantAccess(params.restaurantId, [
      UserRole.OWNER,
    ]);

    const body = await req.json();
    const validated = UpdateBillingConfigSchema.parse(body);

    // Auto-calculate CGST and SGST rates if not explicitly passed
    const gstRate = validated.gstRate;
    const cgstRate =
      validated.cgstRate !== undefined ? validated.cgstRate : Math.floor(gstRate / 2);
    const sgstRate =
      validated.sgstRate !== undefined ? validated.sgstRate : gstRate - cgstRate;
    const igstRate = validated.igstRate !== undefined ? validated.igstRate : gstRate;

    const emailValue = validated.email === '' ? null : validated.email;

    const updatedConfig = await prisma.restaurantBillingConfig.upsert({
      where: { restaurantId: restaurant.id },
      create: {
        restaurantId: restaurant.id,
        legalName: validated.legalName?.trim() || null,
        displayName: validated.displayName?.trim() || null,
        gstin: validated.gstin?.trim().toUpperCase() || null,
        address: validated.address?.trim() || null,
        state: validated.state?.trim() || 'Maharashtra',
        stateCode: validated.stateCode?.trim() || '27',
        phone: validated.phone?.trim() || null,
        email: emailValue?.trim() || null,
        invoicePrefix: validated.invoicePrefix.trim() || 'INV-',
        invoiceNextNumber: validated.invoiceNextNumber ?? 1001,
        invoiceNumberPadding: validated.invoiceNumberPadding ?? 4,
        gstEnabled: validated.gstEnabled,
        taxInclusive: validated.taxInclusive,
        gstRate,
        cgstRate,
        sgstRate,
        igstRate,
        serviceChargeEnabled: validated.serviceChargeEnabled,
        serviceChargeRate: validated.serviceChargeRate,
        serviceChargeType: validated.serviceChargeType,
        serviceChargeTaxable: validated.serviceChargeTaxable,
        packagingChargeEnabled: validated.packagingChargeEnabled,
        packagingChargeAmount: validated.packagingChargeAmount,
        packagingChargeType: validated.packagingChargeType,
        packagingChargeTaxable: validated.packagingChargeTaxable,
        customChargeName: validated.customChargeName?.trim() || null,
        customChargeEnabled: validated.customChargeEnabled,
        customChargeAmount: validated.customChargeAmount,
        customChargeType: validated.customChargeType,
        customChargeTaxable: validated.customChargeTaxable,
        defaultDiscountType: validated.defaultDiscountType,
        maxDiscountPercent: validated.maxDiscountPercent,
      },
      update: {
        legalName: validated.legalName?.trim() || null,
        displayName: validated.displayName?.trim() || null,
        gstin: validated.gstin?.trim().toUpperCase() || null,
        address: validated.address?.trim() || null,
        state: validated.state?.trim() || 'Maharashtra',
        stateCode: validated.stateCode?.trim() || '27',
        phone: validated.phone?.trim() || null,
        email: emailValue?.trim() || null,
        invoicePrefix: validated.invoicePrefix.trim() || 'INV-',
        ...(validated.invoiceNextNumber !== undefined
          ? { invoiceNextNumber: validated.invoiceNextNumber }
          : {}),
        ...(validated.invoiceNumberPadding !== undefined
          ? { invoiceNumberPadding: validated.invoiceNumberPadding }
          : {}),
        gstEnabled: validated.gstEnabled,
        taxInclusive: validated.taxInclusive,
        gstRate,
        cgstRate,
        sgstRate,
        igstRate,
        serviceChargeEnabled: validated.serviceChargeEnabled,
        serviceChargeRate: validated.serviceChargeRate,
        serviceChargeType: validated.serviceChargeType,
        serviceChargeTaxable: validated.serviceChargeTaxable,
        packagingChargeEnabled: validated.packagingChargeEnabled,
        packagingChargeAmount: validated.packagingChargeAmount,
        packagingChargeType: validated.packagingChargeType,
        packagingChargeTaxable: validated.packagingChargeTaxable,
        customChargeName: validated.customChargeName?.trim() || null,
        customChargeEnabled: validated.customChargeEnabled,
        customChargeAmount: validated.customChargeAmount,
        customChargeType: validated.customChargeType,
        customChargeTaxable: validated.customChargeTaxable,
        defaultDiscountType: validated.defaultDiscountType,
        maxDiscountPercent: validated.maxDiscountPercent,
      },
    });

    return apiSuccess({
      config: updatedConfig,
      message: 'Billing and tax configuration updated successfully.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
