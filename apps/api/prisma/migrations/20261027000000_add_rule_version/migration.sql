-- 交易记录写入时的账务口径版本。
-- 旧交易按 1（v1）解释；之后改口径只影响新写入的交易。
ALTER TABLE "transactions" ADD COLUMN "ruleVersion" INTEGER NOT NULL DEFAULT 1;
