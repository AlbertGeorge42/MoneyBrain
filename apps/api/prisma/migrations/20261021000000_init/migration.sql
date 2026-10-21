-- CreateTable
CREATE TABLE "account_categories" (
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
    CONSTRAINT "account_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "account_categories" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "initialBalance" DECIMAL NOT NULL DEFAULT 0,
    "initialBalanceDate" DATETIME,
    "icon" TEXT,
    "color" TEXT,
    "categoryId" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "accounts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "account_categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "transaction_categories" (
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
    CONSTRAINT "transaction_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "transaction_categories" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importKey" TEXT,
    "type" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "fee" DECIMAL NOT NULL DEFAULT 0,
    "coupon" DECIMAL NOT NULL DEFAULT 0,
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

-- CreateTable
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
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

-- CreateTable
CREATE TABLE "investment_asset_classes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "targetRatio" DECIMAL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "investment_asset_classes_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "investment_allocation_snapshots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "accountBalance" DECIMAL NOT NULL,
    "previousSnapshotId" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "investment_allocation_snapshots_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "investment_allocation_snapshots_previousSnapshotId_fkey" FOREIGN KEY ("previousSnapshotId") REFERENCES "investment_allocation_snapshots" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "investment_allocation_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "assetClassId" TEXT NOT NULL,
    "marketValue" DECIMAL NOT NULL,
    "periodNetFlow" DECIMAL NOT NULL DEFAULT 0,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "investment_allocation_items_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "investment_allocation_snapshots" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "investment_allocation_items_assetClassId_fkey" FOREIGN KEY ("assetClassId") REFERENCES "investment_asset_classes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "account_categories_parentId_idx" ON "account_categories"("parentId");

-- CreateIndex
CREATE INDEX "accounts_categoryId_idx" ON "accounts"("categoryId");

-- CreateIndex
CREATE INDEX "accounts_type_idx" ON "accounts"("type");

-- CreateIndex
CREATE INDEX "transaction_categories_parentId_idx" ON "transaction_categories"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_importKey_key" ON "transactions"("importKey");

-- CreateIndex
CREATE INDEX "transactions_date_idx" ON "transactions"("date");

-- CreateIndex
CREATE INDEX "transactions_accountId_date_idx" ON "transactions"("accountId", "date");

-- CreateIndex
CREATE INDEX "transactions_categoryId_date_idx" ON "transactions"("categoryId", "date");

-- CreateIndex
CREATE INDEX "transactions_type_date_idx" ON "transactions"("type", "date");

-- CreateIndex
CREATE INDEX "transactions_relatedTransactionId_idx" ON "transactions"("relatedTransactionId");

-- CreateIndex
CREATE INDEX "budgets_type_idx" ON "budgets"("type");

-- CreateIndex
CREATE INDEX "budgets_accountId_idx" ON "budgets"("accountId");

-- CreateIndex
CREATE INDEX "budgets_categoryId_idx" ON "budgets"("categoryId");

-- CreateIndex
CREATE INDEX "budgets_categoryId_isActive_idx" ON "budgets"("categoryId", "isActive");

-- CreateIndex
CREATE INDEX "investment_asset_classes_accountId_idx" ON "investment_asset_classes"("accountId");

-- CreateIndex
CREATE INDEX "investment_allocation_snapshots_accountId_date_idx" ON "investment_allocation_snapshots"("accountId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "investment_allocation_items_snapshotId_assetClassId_key" ON "investment_allocation_items"("snapshotId", "assetClassId");

