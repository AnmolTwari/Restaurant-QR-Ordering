-- AlterTable orders: Add GST, charge, and invoice breakdown fields
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cgst" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "sgst" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "igst" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "serviceCharge" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "packagingCharge" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "customCharge" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "discountAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "taxableAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "billingSnapshot" JSONB;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "invoiceNumber" TEXT;

-- CreateTable restaurant_billing_configs
CREATE TABLE IF NOT EXISTS "restaurant_billing_configs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "legalName" TEXT,
    "displayName" TEXT,
    "gstin" TEXT,
    "address" TEXT,
    "state" TEXT DEFAULT 'Maharashtra',
    "stateCode" TEXT DEFAULT '27',
    "phone" TEXT,
    "email" TEXT,
    "invoicePrefix" TEXT NOT NULL DEFAULT 'INV-',
    "invoiceNextNumber" INTEGER NOT NULL DEFAULT 1001,
    "invoiceNumberPadding" INTEGER NOT NULL DEFAULT 4,
    "gstEnabled" BOOLEAN NOT NULL DEFAULT false,
    "taxInclusive" BOOLEAN NOT NULL DEFAULT false,
    "gstRate" INTEGER NOT NULL DEFAULT 500,
    "cgstRate" INTEGER NOT NULL DEFAULT 250,
    "sgstRate" INTEGER NOT NULL DEFAULT 250,
    "igstRate" INTEGER NOT NULL DEFAULT 500,
    "serviceChargeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "serviceChargeRate" INTEGER NOT NULL DEFAULT 0,
    "serviceChargeType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
    "serviceChargeTaxable" BOOLEAN NOT NULL DEFAULT true,
    "packagingChargeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "packagingChargeAmount" INTEGER NOT NULL DEFAULT 0,
    "packagingChargeType" TEXT NOT NULL DEFAULT 'FIXED',
    "packagingChargeTaxable" BOOLEAN NOT NULL DEFAULT true,
    "customChargeName" TEXT,
    "customChargeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "customChargeAmount" INTEGER NOT NULL DEFAULT 0,
    "customChargeType" TEXT NOT NULL DEFAULT 'FIXED',
    "customChargeTaxable" BOOLEAN NOT NULL DEFAULT false,
    "defaultDiscountType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
    "maxDiscountPercent" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restaurant_billing_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex restaurant_billing_configs_restaurantId_key
CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_billing_configs_restaurantId_key" ON "restaurant_billing_configs"("restaurantId");

-- CreateTable invoices
CREATE TABLE IF NOT EXISTS "invoices" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "taxableAmount" INTEGER NOT NULL,
    "cgst" INTEGER NOT NULL DEFAULT 0,
    "sgst" INTEGER NOT NULL DEFAULT 0,
    "igst" INTEGER NOT NULL DEFAULT 0,
    "totalTax" INTEGER NOT NULL DEFAULT 0,
    "serviceCharge" INTEGER NOT NULL DEFAULT 0,
    "packagingCharge" INTEGER NOT NULL DEFAULT 0,
    "customCharge" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "billingSnapshot" JSONB NOT NULL,
    "customerPhone" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex invoices
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_orderId_key" ON "invoices"("orderId");
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");
CREATE INDEX IF NOT EXISTS "invoices_restaurantId_invoiceNumber_idx" ON "invoices"("restaurantId", "invoiceNumber");
CREATE INDEX IF NOT EXISTS "invoices_restaurantId_generatedAt_idx" ON "invoices"("restaurantId", "generatedAt");

-- AddForeignKey restaurant_billing_configs -> restaurants
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'restaurant_billing_configs_restaurantId_fkey'
  ) THEN
    ALTER TABLE "restaurant_billing_configs" ADD CONSTRAINT "restaurant_billing_configs_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey invoices -> restaurants
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_restaurantId_fkey'
  ) THEN
    ALTER TABLE "invoices" ADD CONSTRAINT "invoices_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey invoices -> orders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_orderId_fkey'
  ) THEN
    ALTER TABLE "invoices" ADD CONSTRAINT "invoices_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
