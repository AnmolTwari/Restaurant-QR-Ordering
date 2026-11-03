-- AlterTable
ALTER TABLE "table_sessions" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "table_sessions" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);
ALTER TABLE "table_sessions" ADD COLUMN IF NOT EXISTS "closedByUserId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "table_sessions_restaurantId_tableId_status_idx" ON "table_sessions"("restaurantId", "tableId", "status");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'table_sessions_closedByUserId_fkey'
  ) THEN
    ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

