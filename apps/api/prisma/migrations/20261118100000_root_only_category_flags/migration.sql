-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_account_categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "parentId" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "isCashEquivalent" BOOLEAN,
    "isInvestment" BOOLEAN,
    "iconKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "vv" TEXT,
    CONSTRAINT "account_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "account_categories" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
INSERT INTO "new_account_categories" ("createdAt", "iconKey", "id", "isCashEquivalent", "isInvestment", "name", "parentId", "rev", "sort", "type", "updatedAt", "vv") SELECT "createdAt", "iconKey", "id", "isCashEquivalent", "isInvestment", "name", "parentId", "rev", "sort", "type", "updatedAt", "vv" FROM "account_categories";
DROP TABLE "account_categories";
ALTER TABLE "new_account_categories" RENAME TO "account_categories";
CREATE INDEX "account_categories_parentId_idx" ON "account_categories"("parentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


-- 数据迁移：子分类不拥有计算属性，历史脏值一律清空为 NULL。
-- 仅根节点（parentId IS NULL）保留配置值。
UPDATE "account_categories" SET "isCashEquivalent" = NULL WHERE "parentId" IS NOT NULL;
UPDATE "account_categories" SET "isInvestment" = NULL WHERE "parentId" IS NOT NULL;
UPDATE "transaction_categories" SET "cashFlowType" = NULL WHERE "parentId" IS NOT NULL;
