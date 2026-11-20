-- 转账五类由代码按账户性质自动归类，活动归属固定：
-- 转账→经营，买入/卖出→投资，还款/借款/借贷→筹资。
-- 原地给已有同名分类补写 cashFlowType（保留 id，历史交易不断链）；
-- 设置页不再展示转账分类配置，故这些分类不再由用户手工改活动归属。

UPDATE "transaction_categories"
SET "cashFlowType" = 'operating'
WHERE "type" = 'transfer' AND "parentId" IS NULL AND "name" = '转账';

UPDATE "transaction_categories"
SET "cashFlowType" = 'investing'
WHERE "type" = 'transfer' AND "parentId" IS NULL AND "name" IN ('买入', '卖出');

UPDATE "transaction_categories"
SET "cashFlowType" = 'financing'
WHERE "type" = 'transfer' AND "parentId" IS NULL AND "name" IN ('还款', '借款', '借贷');
