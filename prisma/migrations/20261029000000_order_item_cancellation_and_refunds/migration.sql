-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIALLY_REFUNDED';

-- CreateEnum
CREATE TYPE "OrderItemStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN "cancelNote" TEXT,
ADD COLUMN "cancelReason" TEXT,
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancelledByUserId" TEXT,
ADD COLUMN "status" "OrderItemStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "refundAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "refundStatus" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN "gatewayRefundId" TEXT,
ADD COLUMN "refundAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "refundStatus" TEXT;

-- CreateIndex
CREATE INDEX "order_items_orderId_status_idx" ON "order_items"("orderId", "status");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

