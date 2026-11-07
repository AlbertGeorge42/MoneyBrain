/*
  Warnings:

  - You are about to drop the column `color` on the `account_categories` table. All the data in the column will be lost.
  - You are about to drop the column `icon` on the `account_categories` table. All the data in the column will be lost.
  - You are about to drop the column `color` on the `accounts` table. All the data in the column will be lost.
  - You are about to drop the column `icon` on the `accounts` table. All the data in the column will be lost.
  - You are about to drop the column `color` on the `investment_asset_classes` table. All the data in the column will be lost.
  - You are about to drop the column `icon` on the `investment_asset_classes` table. All the data in the column will be lost.
  - You are about to drop the column `color` on the `transaction_categories` table. All the data in the column will be lost.
  - You are about to drop the column `icon` on the `transaction_categories` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_account_categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
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
INSERT INTO "new_account_categories" ("createdAt", "id", "isCashEquivalent", "isInvestment", "name", "parentId", "rev", "sort", "type", "updatedAt", "vv") SELECT "createdAt", "id", "isCashEquivalent", "isInvestment", "name", "parentId", "rev", "sort", "type", "updatedAt", "vv" FROM "account_categories";
DROP TABLE "account_categories";
ALTER TABLE "new_account_categories" RENAME TO "account_categories";
CREATE INDEX "account_categories_parentId_idx" ON "account_categories"("parentId");
CREATE TABLE "new_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "initialBalance" BIGINT NOT NULL DEFAULT 0,
    "initialBalanceDate" DATETIME,
    "categoryId" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "vv" TEXT,
    CONSTRAINT "accounts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "account_categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_accounts" ("categoryId", "createdAt", "id", "initialBalance", "initialBalanceDate", "name", "rev", "sort", "type", "updatedAt", "vv") SELECT "categoryId", "createdAt", "id", "initialBalance", "initialBalanceDate", "name", "rev", "sort", "type", "updatedAt", "vv" FROM "accounts";
DROP TABLE "accounts";
ALTER TABLE "new_accounts" RENAME TO "accounts";
CREATE INDEX "accounts_categoryId_idx" ON "accounts"("categoryId");
CREATE INDEX "accounts_type_idx" ON "accounts"("type");
CREATE TABLE "new_investment_asset_classes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetRatio" DECIMAL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "investment_asset_classes_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_investment_asset_classes" ("accountId", "createdAt", "id", "name", "sort", "targetRatio", "updatedAt") SELECT "accountId", "createdAt", "id", "name", "sort", "targetRatio", "updatedAt" FROM "investment_asset_classes";
DROP TABLE "investment_asset_classes";
ALTER TABLE "new_investment_asset_classes" RENAME TO "investment_asset_classes";
CREATE INDEX "investment_asset_classes_accountId_idx" ON "investment_asset_classes"("accountId");
CREATE TABLE "new_transaction_categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "cashFlowType" TEXT,
    "parentId" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "vv" TEXT,
    CONSTRAINT "transaction_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "transaction_categories" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
INSERT INTO "new_transaction_categories" ("cashFlowType", "createdAt", "id", "name", "parentId", "rev", "sort", "type", "updatedAt", "vv") SELECT "cashFlowType", "createdAt", "id", "name", "parentId", "rev", "sort", "type", "updatedAt", "vv" FROM "transaction_categories";
DROP TABLE "transaction_categories";
ALTER TABLE "new_transaction_categories" RENAME TO "transaction_categories";
CREATE INDEX "transaction_categories_parentId_idx" ON "transaction_categories"("parentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
