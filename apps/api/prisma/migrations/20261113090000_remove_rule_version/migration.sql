-- 内核口径固定，移除按交易解释规则的版本字段。
-- SQLite 3.35+ 支持 DROP COLUMN；该列无索引依赖。
ALTER TABLE "transactions" DROP COLUMN "ruleVersion";
