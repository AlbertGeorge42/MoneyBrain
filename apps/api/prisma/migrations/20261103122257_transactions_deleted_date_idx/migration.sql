-- DropIndex
DROP INDEX "transactions_deletedAt_idx";

-- CreateIndex
CREATE INDEX "transactions_deletedAt_date_idx" ON "transactions"("deletedAt", "date");
