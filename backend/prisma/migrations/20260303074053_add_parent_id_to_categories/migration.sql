-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_account_categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "icon" TEXT,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "account_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "account_categories" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
INSERT INTO "new_account_categories" ("createdAt", "icon", "id", "name", "type", "updatedAt") SELECT "createdAt", "icon", "id", "name", "type", "updatedAt" FROM "account_categories";
DROP TABLE "account_categories";
ALTER TABLE "new_account_categories" RENAME TO "account_categories";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
