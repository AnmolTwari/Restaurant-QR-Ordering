-- Drop global unique constraint on invoices.invoiceNumber and replace with tenant-scoped compound unique index
DROP INDEX IF EXISTS "invoices_invoiceNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_restaurantId_invoiceNumber_key" ON "invoices"("restaurantId", "invoiceNumber");
