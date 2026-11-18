-- 数据修复：账户分类按需求只有「一级分类 → 账户」两层。
-- 历史配置导入递归建出了「长期资产 → 现金 / 投资」二级结构，标志被清为 NULL 后
-- 整个资产树都失去了现金等价 / 投资口径。这里把两个资产子分类提升为一级分类，
-- 并恢复各自的计算属性；账户的 categoryId 不变，无需迁移账户。
UPDATE "account_categories"
SET "parentId" = NULL, "isCashEquivalent" = 1, "isInvestment" = 0
WHERE "type" = 'asset' AND "name" = '现金' AND "parentId" IS NOT NULL;

UPDATE "account_categories"
SET "parentId" = NULL, "isCashEquivalent" = 0, "isInvestment" = 1
WHERE "type" = 'asset' AND "name" = '投资' AND "parentId" IS NOT NULL;
