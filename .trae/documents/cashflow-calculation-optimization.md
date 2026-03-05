# 现金流量表计算逻辑优化

## 目标
1. 取消账户中的现金流量活动类型（cashFlowType）字段
2. 在收支分类中添加转账分类支持
3. 通过现金账户 + 交易类型 + 分类类型共同完成现金流量表计算

## 当前问题分析

### 现有逻辑
- 账户有 `cashFlowType` 字段，用于标记账户的现金流活动类型
- 收支分类有 `cashFlowType` 字段，用于标记分类的现金流活动类型
- 现金流量表通过 `isCashEquivalent` 标记现金等价物账户
- 计算时优先使用分类的 `cashFlowType`，其次使用账户的 `cashFlowType`

### 问题
1. 账户的 `cashFlowType` 字段冗余，与分类的 `cashFlowType` 功能重复
2. 转账交易没有分类，无法确定现金流活动类型
3. 现金流量表对转账交易的处理不够清晰

## 改进方案

### 1. 数据库模型修改
- 删除 Account 模型的 `cashFlowType` 字段
- Category 模型添加 `type` 字段支持 'transfer' 类型（转账分类）

### 2. 现金流量表计算逻辑重构

#### 收入交易
- 现金账户收到收入 → 现金流入
- 根据分类的 `cashFlowType` 确定活动类型

#### 支出交易
- 现金账户支出 → 现金流出
- 根据分类的 `cashFlowType` 确定活动类型

#### 转账交易
- **现金 → 现金**：不影响现金流总量（内部流转）
- **现金 → 非现金**：现金流出
  - 根据转入账户的类型或分类确定活动类型
- **非现金 → 现金**：现金流入
  - 根据转出账户的类型或分类确定活动类型
- **非现金 → 非现金**：不影响现金流

### 3. 转账分类设计

为转账交易添加分类支持：
- 转账分类类型为 'transfer'
- 转账分类有 `cashFlowType` 字段
- 创建转账交易时可以选择分类

## 实施步骤

### Step 1: 数据库模型修改
- 删除 Account 模型的 `cashFlowType` 字段
- Category 模型的 `type` 字段支持 'transfer' 类型

### Step 2: 后端 API 修改
- 修改 transaction.ts 支持转账交易选择分类
- 重构 report.ts 现金流量表计算逻辑

### Step 3: 前端修改
- 移除账户表单中的现金流量活动类型字段
- 转账弹窗添加分类选择
- 更新收支分类管理支持转账分类

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/prisma/schema.prisma` | 修改 | 删除 Account.cashFlowType |
| `backend/src/routes/transaction.ts` | 修改 | 转账交易支持分类 |
| `backend/src/routes/report.ts` | 重构 | 现金流量表计算逻辑 |
| `frontend/src/services/api.ts` | 修改 | 更新类型定义 |
| `frontend/src/components/AccountCategoryModal.tsx` | 修改 | 移除 cashFlowType 字段 |
| `frontend/src/pages/Transactions.tsx` | 修改 | 转账弹窗添加分类选择 |
| `frontend/src/components/TransactionCategoryModal.tsx` | 修改 | 支持转账分类 |

## 详细设计

### 1. 现金流量表计算逻辑

```typescript
router.get('/cash-flow', async (req, res, next) => {
  // 获取现金账户
  const cashCategories = await prisma.accountCategory.findMany({
    where: { isCashEquivalent: true },
  })
  const cashAccountIds = (await prisma.account.findMany({
    where: { categoryId: { in: cashCategories.map(c => c.id) } },
  })).map(a => a.id)

  // 获取所有交易
  const transactions = await prisma.transaction.findMany({
    where: { date: { gte: start, lte: end }, isAdjustment: false },
    include: { account: true, toAccount: true, category: true },
  })

  const result = {
    operating: { inflow: 0, outflow: 0, items: [] },
    investing: { inflow: 0, outflow: 0, items: [] },
    financing: { inflow: 0, outflow: 0, items: [] },
  }

  transactions.forEach(t => {
    const isFromCash = cashAccountIds.includes(t.accountId)
    const isToCash = t.toAccountId && cashAccountIds.includes(t.toAccountId)
    const cashFlowType = t.category?.cashFlowType || 'operating'
    
    if (t.type === 'income' && isFromCash) {
      // 收入 + 现金账户 → 现金流入
      result[cashFlowType].inflow += t.amount
      result[cashFlowType].items.push({ ...t, direction: 'inflow' })
    } else if (t.type === 'expense' && isFromCash) {
      // 支出 + 现金账户 → 现金流出
      result[cashFlowType].outflow += t.amount
      result[cashFlowType].items.push({ ...t, direction: 'outflow' })
    } else if (t.type === 'transfer') {
      if (isFromCash && !isToCash) {
        // 现金 → 非现金：现金流出
        result[cashFlowType].outflow += t.amount
        result[cashFlowType].items.push({ ...t, direction: 'outflow' })
      } else if (!isFromCash && isToCash) {
        // 非现金 → 现金：现金流入
        result[cashFlowType].inflow += t.amount
        result[cashFlowType].items.push({ ...t, direction: 'inflow' })
      }
      // 现金 → 现金：不影响现金流
    }
  })
})
```

### 2. 转账分类示例

```
转账分类（type: 'transfer'）：
- 借款转入（cashFlowType: 'financing'）
- 借款转出（cashFlowType: 'financing'）
- 投资转入（cashFlowType: 'investing'）
- 投资转出（cashFlowType: 'investing'）
- 内部转账（cashFlowType: null，不影响现金流）
```

## 验证清单
- [ ] Account 模型删除 cashFlowType 字段成功
- [ ] 转账交易可以选择分类
- [ ] 现金流量表正确计算收入交易
- [ ] 现金流量表正确计算支出交易
- [ ] 现金流量表正确计算转账交易
- [ ] 前端账户表单移除 cashFlowType 字段
- [ ] 前端转账弹窗支持分类选择
