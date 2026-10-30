-- AlterTable
ALTER TABLE "orders" ADD COLUMN "refundedAtCounterAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "refundCompletedAt" TIMESTAMP(3),
ADD COLUMN "refundCompletedByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_refundCompletedByUserId_fkey" FOREIGN KEY ("refundCompletedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

