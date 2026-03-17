-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_account_categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "icon" TEXT,
    "parentId" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isCashEquivalent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "account_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "account_categories" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
INSERT INTO "new_account_categories" ("createdAt", "icon", "id", "isCashEquivalent", "name", "parentId", "sort", "type", "updatedAt") SELECT "createdAt", "icon", "id", "isCashEquivalent", "name", "parentId", "sort", "type", "updatedAt" FROM "account_categories";
DROP TABLE "account_categories";
ALTER TABLE "new_account_categories" RENAME TO "account_categories";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
