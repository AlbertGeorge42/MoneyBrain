-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_account_categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "parentId" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "isCashEquivalent" BOOLEAN NOT NULL DEFAULT false,
    "isInvestment" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "vv" TEXT,
    CONSTRAINT "account_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "account_categories" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
INSERT INTO "new_account_categories" ("color", "createdAt", "icon", "id", "isCashEquivalent", "isInvestment", "name", "parentId", "sort", "type", "updatedAt") SELECT "color", "createdAt", "icon", "id", "isCashEquivalent", "isInvestment", "name", "parentId", "sort", "type", "updatedAt" FROM "account_categories";
DROP TABLE "account_categories";
ALTER TABLE "new_account_categories" RENAME TO "account_categories";
CREATE INDEX "account_categories_parentId_idx" ON "account_categories"("parentId");
CREATE TABLE "new_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "initialBalance" BIGINT NOT NULL DEFAULT 0,
    "initialBalanceDate" DATETIME,
    "icon" TEXT,
    "color" TEXT,
    "categoryId" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "vv" TEXT,
    CONSTRAINT "accounts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "account_categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_accounts" ("categoryId", "color", "createdAt", "icon", "id", "initialBalance", "initialBalanceDate", "name", "sort", "type", "updatedAt") SELECT "categoryId", "color", "createdAt", "icon", "id", "initialBalance", "initialBalanceDate", "name", "sort", "type", "updatedAt" FROM "accounts";
DROP TABLE "accounts";
ALTER TABLE "new_accounts" RENAME TO "accounts";
CREATE INDEX "accounts_categoryId_idx" ON "accounts"("categoryId");
CREATE INDEX "accounts_type_idx" ON "accounts"("type");
CREATE TABLE "new_budgets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "period" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "transactionTime" INTEGER,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "accountId" TEXT NOT NULL,
    "toAccountId" TEXT,
    "categoryId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "vv" TEXT,
    CONSTRAINT "budgets_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "budgets_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "budgets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "transaction_categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_budgets" ("accountId", "amount", "categoryId", "createdAt", "endDate", "id", "isActive", "name", "note", "period", "startDate", "toAccountId", "transactionTime", "type", "updatedAt") SELECT "accountId", "amount", "categoryId", "createdAt", "endDate", "id", "isActive", "name", "note", "period", "startDate", "toAccountId", "transactionTime", "type", "updatedAt" FROM "budgets";
DROP TABLE "budgets";
ALTER TABLE "new_budgets" RENAME TO "budgets";
CREATE INDEX "budgets_type_idx" ON "budgets"("type");
CREATE INDEX "budgets_accountId_idx" ON "budgets"("accountId");
CREATE INDEX "budgets_categoryId_idx" ON "budgets"("categoryId");
CREATE INDEX "budgets_categoryId_isActive_idx" ON "budgets"("categoryId", "isActive");
CREATE TABLE "new_investment_allocation_snapshots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "accountBalance" BIGINT NOT NULL,
    "previousSnapshotId" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "vv" TEXT,
    CONSTRAINT "investment_allocation_snapshots_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "investment_allocation_snapshots_previousSnapshotId_fkey" FOREIGN KEY ("previousSnapshotId") REFERENCES "investment_allocation_snapshots" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_investment_allocation_snapshots" ("accountBalance", "accountId", "createdAt", "date", "id", "note", "previousSnapshotId", "updatedAt") SELECT "accountBalance", "accountId", "createdAt", "date", "id", "note", "previousSnapshotId", "updatedAt" FROM "investment_allocation_snapshots";
DROP TABLE "investment_allocation_snapshots";
ALTER TABLE "new_investment_allocation_snapshots" RENAME TO "investment_allocation_snapshots";
CREATE INDEX "investment_allocation_snapshots_accountId_date_idx" ON "investment_allocation_snapshots"("accountId", "date");
CREATE TABLE "new_transaction_categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "cashFlowType" TEXT,
    "parentId" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "vv" TEXT,
    CONSTRAINT "transaction_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "transaction_categories" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
INSERT INTO "new_transaction_categories" ("cashFlowType", "color", "createdAt", "icon", "id", "name", "parentId", "sort", "type", "updatedAt") SELECT "cashFlowType", "color", "createdAt", "icon", "id", "name", "parentId", "sort", "type", "updatedAt" FROM "transaction_categories";
DROP TABLE "transaction_categories";
ALTER TABLE "new_transaction_categories" RENAME TO "transaction_categories";
CREATE INDEX "transaction_categories_parentId_idx" ON "transaction_categories"("parentId");
CREATE TABLE "new_transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importKey" TEXT,
    "type" TEXT NOT NULL,
    "ruleVersion" INTEGER NOT NULL DEFAULT 1,
    "amount" BIGINT NOT NULL,
    "fee" BIGINT NOT NULL DEFAULT 0,
    "coupon" BIGINT NOT NULL DEFAULT 0,
    "date" DATETIME NOT NULL,
    "note" TEXT,
    "accountId" TEXT NOT NULL,
    "toAccountId" TEXT,
    "categoryId" TEXT,
    "relatedTransactionId" TEXT,
    "relatedType" TEXT,
    "excludeFromIncomeExpense" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "vv" TEXT,
    CONSTRAINT "transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "transactions_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "transactions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "transaction_categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "transactions_relatedTransactionId_fkey" FOREIGN KEY ("relatedTransactionId") REFERENCES "transactions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_transactions" ("accountId", "amount", "categoryId", "coupon", "createdAt", "date", "deletedAt", "excludeFromIncomeExpense", "fee", "id", "importKey", "note", "relatedTransactionId", "relatedType", "ruleVersion", "toAccountId", "type") SELECT "accountId", "amount", "categoryId", "coupon", "createdAt", "date", "deletedAt", "excludeFromIncomeExpense", "fee", "id", "importKey", "note", "relatedTransactionId", "relatedType", "ruleVersion", "toAccountId", "type" FROM "transactions";
DROP TABLE "transactions";
ALTER TABLE "new_transactions" RENAME TO "transactions";
CREATE UNIQUE INDEX "transactions_importKey_key" ON "transactions"("importKey");
CREATE INDEX "transactions_date_idx" ON "transactions"("date");
CREATE INDEX "transactions_accountId_date_idx" ON "transactions"("accountId", "date");
CREATE INDEX "transactions_categoryId_date_idx" ON "transactions"("categoryId", "date");
CREATE INDEX "transactions_type_date_idx" ON "transactions"("type", "date");
CREATE INDEX "transactions_relatedTransactionId_idx" ON "transactions"("relatedTransactionId");
CREATE INDEX "transactions_deletedAt_date_idx" ON "transactions"("deletedAt", "date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
