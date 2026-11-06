-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filename" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "includesJson" TEXT NOT NULL,
    "importedJson" TEXT NOT NULL,
    "createdJson" TEXT NOT NULL,
    "transactionCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "rolledBackAt" DATETIME,
    "rolledBackJson" TEXT
);

-- CreateIndex
CREATE INDEX "import_batches_createdAt_idx" ON "import_batches"("createdAt");
