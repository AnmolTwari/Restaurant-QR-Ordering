-- Clean up expired active sessions if any exist
UPDATE "table_sessions"
SET "status" = 'EXPIRED', "isActive" = false, "closedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'ACTIVE' AND "expiresAt" <= CURRENT_TIMESTAMP;

-- In case historical test data created duplicate active sessions for the same table,
-- keep only the latest active session per table and mark older duplicates as CLOSED.
UPDATE "table_sessions"
SET "status" = 'CLOSED', "isActive" = false, "closedAt" = CURRENT_TIMESTAMP
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id",
           ROW_NUMBER() OVER (
             PARTITION BY "restaurantId", "tableId"
             ORDER BY "createdAt" DESC
           ) as rn
    FROM "table_sessions"
    WHERE "status" = 'ACTIVE'
  ) sub
  WHERE sub.rn > 1
);

-- Create partial unique index enforcing at most one ACTIVE session per physical table
CREATE UNIQUE INDEX IF NOT EXISTS "table_sessions_active_table_unique_idx"
ON "table_sessions"("restaurantId", "tableId")
WHERE "status" = 'ACTIVE';

