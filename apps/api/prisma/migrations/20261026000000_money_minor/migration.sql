-- A1：金额从「元（Decimal，SQLite 里可能是 REAL）」改成「整数分（BIGINT）」。
--
-- 本迁移只改单位，不改语义：每一列都乘 100 并 half-up 取整，其余字段原样搬。
-- 旧库里偶有浮点尾巴（如 8.120000000000001），ROUND 会把它收成 812 分；
-- 迁移前后必须跑 scripts/a1-reconcile.mts 逐行对账，要求分文不差。
--
-- A4（amount 由净额改本金）**没有**并进来：收入的手续费符号与支出相反，
-- 退款的 amount 本身没有本金/手续费拆分，且退款上限依赖原交易金额——语义未定，
-- 贸然迁移会改变「可退金额」。见 docs/rewrite-blueprint.md 批次 A 的 A4 行。

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    CONSTRAINT "accounts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "account_categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_accounts" ("categoryId", "color", "createdAt", "icon", "id", "initialBalance", "initialBalanceDate", "name", "sort", "type", "updatedAt") SELECT "categoryId", "color", "createdAt", "icon", "id", CAST(ROUND("initialBalance" * 100) AS INTEGER), "initialBalanceDate", "name", "sort", "type", "updatedAt" FROM "accounts";
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
    CONSTRAINT "budgets_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "budgets_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "budgets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "transaction_categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_budgets" ("accountId", "amount", "categoryId", "createdAt", "endDate", "id", "isActive", "name", "note", "period", "startDate", "toAccountId", "transactionTime", "type", "updatedAt") SELECT "accountId", CAST(ROUND("amount" * 100) AS INTEGER), "categoryId", "createdAt", "endDate", "id", "isActive", "name", "note", "period", "startDate", "toAccountId", "transactionTime", "type", "updatedAt" FROM "budgets";
DROP TABLE "budgets";
ALTER TABLE "new_budgets" RENAME TO "budgets";
CREATE INDEX "budgets_type_idx" ON "budgets"("type");
CREATE INDEX "budgets_accountId_idx" ON "budgets"("accountId");
CREATE INDEX "budgets_categoryId_idx" ON "budgets"("categoryId");
CREATE INDEX "budgets_categoryId_isActive_idx" ON "budgets"("categoryId", "isActive");
CREATE TABLE "new_investment_allocation_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "assetClassId" TEXT NOT NULL,
    "marketValue" BIGINT NOT NULL,
    "periodNetFlow" BIGINT NOT NULL DEFAULT 0,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "investment_allocation_items_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "investment_allocation_snapshots" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "investment_allocation_items_assetClassId_fkey" FOREIGN KEY ("assetClassId") REFERENCES "investment_asset_classes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_investment_allocation_items" ("assetClassId", "id", "marketValue", "periodNetFlow", "snapshotId", "sort") SELECT "assetClassId", "id", CAST(ROUND("marketValue" * 100) AS INTEGER), CAST(ROUND("periodNetFlow" * 100) AS INTEGER), "snapshotId", "sort" FROM "investment_allocation_items";
DROP TABLE "investment_allocation_items";
ALTER TABLE "new_investment_allocation_items" RENAME TO "investment_allocation_items";
CREATE UNIQUE INDEX "investment_allocation_items_snapshotId_assetClassId_key" ON "investment_allocation_items"("snapshotId", "assetClassId");
CREATE TABLE "new_investment_allocation_snapshots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "accountBalance" BIGINT NOT NULL,
    "previousSnapshotId" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "investment_allocation_snapshots_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "investment_allocation_snapshots_previousSnapshotId_fkey" FOREIGN KEY ("previousSnapshotId") REFERENCES "investment_allocation_snapshots" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_investment_allocation_snapshots" ("accountBalance", "accountId", "createdAt", "date", "id", "note", "previousSnapshotId", "updatedAt") SELECT CAST(ROUND("accountBalance" * 100) AS INTEGER), "accountId", "createdAt", "date", "id", "note", "previousSnapshotId", "updatedAt" FROM "investment_allocation_snapshots";
DROP TABLE "investment_allocation_snapshots";
ALTER TABLE "new_investment_allocation_snapshots" RENAME TO "investment_allocation_snapshots";
CREATE INDEX "investment_allocation_snapshots_accountId_date_idx" ON "investment_allocation_snapshots"("accountId", "date");
CREATE TABLE "new_transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importKey" TEXT,
    "type" TEXT NOT NULL,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "transactions_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "transactions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "transaction_categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "transactions_relatedTransactionId_fkey" FOREIGN KEY ("relatedTransactionId") REFERENCES "transactions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_transactions" ("accountId", "amount", "categoryId", "coupon", "createdAt", "date", "excludeFromIncomeExpense", "fee", "id", "importKey", "note", "relatedTransactionId", "relatedType", "toAccountId", "type") SELECT "accountId", CAST(ROUND("amount" * 100) AS INTEGER), "categoryId", CAST(ROUND("coupon" * 100) AS INTEGER), "createdAt", "date", "excludeFromIncomeExpense", CAST(ROUND("fee" * 100) AS INTEGER), "id", "importKey", "note", "relatedTransactionId", "relatedType", "toAccountId", "type" FROM "transactions";
DROP TABLE "transactions";
ALTER TABLE "new_transactions" RENAME TO "transactions";
CREATE UNIQUE INDEX "transactions_importKey_key" ON "transactions"("importKey");
CREATE INDEX "transactions_date_idx" ON "transactions"("date");
CREATE INDEX "transactions_accountId_date_idx" ON "transactions"("accountId", "date");
CREATE INDEX "transactions_categoryId_date_idx" ON "transactions"("categoryId", "date");
CREATE INDEX "transactions_type_date_idx" ON "transactions"("type", "date");
CREATE INDEX "transactions_relatedTransactionId_idx" ON "transactions"("relatedTransactionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
