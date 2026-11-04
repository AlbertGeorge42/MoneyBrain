-- CreateTable
CREATE TABLE "sync_conflicts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "version_a" TEXT NOT NULL,
    "version_b" TEXT NOT NULL,
    "detected_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" DATETIME
);

-- CreateIndex
CREATE INDEX "sync_conflicts_entity_type_entity_id_idx" ON "sync_conflicts"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "sync_conflicts_resolved_at_idx" ON "sync_conflicts"("resolved_at");
