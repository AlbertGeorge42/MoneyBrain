# MoneyBrain 项目全面重构规格说明

## 一、项目现状分析

### 1.1 项目架构概览
- **前端**: React 18 + TypeScript + Vite + Ant Design + Zustand + ECharts
- **后端**: Node.js + Express + TypeScript + Prisma + SQLite
- **数据模型**: Account, AccountCategory, Category, Transaction, Budget, BalanceSnapshot

### 1.2 代码规模
- 后端路由文件: 9个
- 前端页面组件: 5个
- 前端公共组件: 8个
- 工具函数: 3个

---

## 二、问题识别与分析

### 2.1 后端问题

#### 问题1: 重复的余额计算函数
**位置**: 
- [report.ts:10-77](backend/src/routes/report.ts#L10-L77) - `calculateBalanceAtDate`
- [balance-snapshot.ts:24-48](backend/src/routes/balance-snapshot.ts#L24-L48) - `calculateBalanceAtDate`

**问题描述**: 
两个文件中存在同名但实现不同的余额计算函数。report.ts 中的版本更完整，支持初始余额日期和转账交易；balance-snapshot.ts 中的版本较简单，只处理收支交易。

**影响**: 代码重复，维护困难，可能导致计算结果不一致。

**优先级**: 高

---

#### 问题2: 余额变化计算逻辑分散
**位置**: [transaction.ts:9-32](backend/src/routes/transaction.ts#L9-L32)

**问题描述**:
`calculateBalanceChange` 和 `calculateTransferInAmount` 函数只在 transaction.ts 中定义，但类似的计算逻辑在 report.ts 和 balance-snapshot.ts 中也有重复实现。

**影响**: 业务逻辑分散，修改时容易遗漏。

**优先级**: 高

---

#### 问题3: 重复创建 PrismaClient 实例
**位置**: [data.ts:7](backend/src/routes/data.ts#L7)

**问题描述**:
data.ts 中重新创建了 `new PrismaClient()`，而其他路由文件都使用从 index.ts 导出的共享实例。

**影响**: 可能导致数据库连接池问题，不符合单例模式。

**优先级**: 中

---

#### 问题4: 未使用的 API 接口
**位置**: 
- [account-category.ts:19-29](backend/src/routes/account-category.ts#L19-L29) - `GET /tree`
- [category.ts:19-29](backend/src/routes/category.ts#L19-L29) - `GET /tree`
- [category.ts:62-83](backend/src/routes/category.ts#L62-L83) - `PUT /sort/batch`

**问题描述**:
这些接口已实现但前端未调用，增加了维护负担。

**影响**: 死代码，增加维护成本。

**优先级**: 低

---

#### 问题5: 缺少统一的服务层
**位置**: 所有路由文件

**问题描述**:
业务逻辑直接写在路由处理函数中，没有抽象成独立的服务层。例如余额计算、交易创建等复杂逻辑散落在各处。

**影响**: 代码难以测试，业务逻辑复用困难。

**优先级**: 中

---

### 2.2 前端问题

#### 问题6: 重复的类型定义
**位置**: 
- [api.ts:11-19](frontend/src/services/api.ts#L11-L19) - `ApiResponse`
- [response.ts:4-12](backend/src/utils/response.ts#L4-L12) - `ApiResponse`

**问题描述**:
前后端各自定义了相同的类型，没有共享类型定义机制。

**影响**: 类型不同步风险，维护两份代码。

**优先级**: 中

---

#### 问题7: 重复的树构建工具函数
**位置**:
- [tree.ts:7-17](backend/src/utils/tree.ts#L7-L17) - `buildTree`
- [treeUtils.ts:9-19](frontend/src/utils/treeUtils.ts#L9-L19) - `buildTreeData`

**问题描述**:
两个函数功能完全相同，只是命名和类型定义略有不同。

**影响**: 代码重复，修改时需要同步两处。

**优先级**: 低

---

#### 问题8: Modal 组件重复模式
**位置**:
- [AccountCategoryModal.tsx](frontend/src/components/AccountCategoryModal.tsx) - 650行
- [TransactionCategoryModal.tsx](frontend/src/components/TransactionCategoryModal.tsx) - 235行

**问题描述**:
两个 Modal 组件有相似的结构：Tab切换、表格展示、CRUD操作、表单弹窗等。

**影响**: 代码重复，UI不一致风险。

**优先级**: 低

---

#### 问题9: 图表组件重复导出
**位置**:
- [charts/index.ts](frontend/src/components/charts/index.ts)
- [charts/index.tsx](frontend/src/components/charts/index.tsx)

**问题描述**:
存在两个索引文件，可能导致导入混乱。

**影响**: 代码混乱，潜在的错误。

**优先级**: 低

---

#### 问题10: Store 中的重复刷新逻辑
**位置**: [stores/index.ts:123-218](frontend/src/stores/index.ts#L123-L218)

**问题描述**:
每个 CRUD 操作后都调用 `fetchXxx()` 刷新数据，模式重复。例如：
```typescript
addAccount: async (data) => {
  const res = await accountApi.create(data)
  if (res.data.success) {
    await get().fetchAccounts()
  }
},
```

**影响**: 代码冗余，可以优化。

**优先级**: 低

---

### 2.3 架构层面问题

#### 问题11: 缺少统一的错误处理机制
**位置**: 所有路由文件

**问题描述**:
虽然使用了 errorHandler 中间件，但错误类型不够细化，缺少自定义错误类。

**影响**: 错误处理不够精细，前端难以针对处理。

**优先级**: 中

---

#### 问题12: 缺少请求参数验证
**位置**: 所有路由文件

**问题描述**:
参数验证直接写在处理函数中，没有使用统一的验证中间件（如 Joi、Zod）。

**影响**: 验证逻辑分散，容易遗漏。

**优先级**: 中

---

## 三、重构目标

### 3.1 总体目标
1. 消除代码重复，提高代码复用率
2. 优化项目结构，提升可维护性
3. 统一业务逻辑，减少潜在bug
4. 提升代码质量，便于后续扩展

### 3.2 量化指标
- 消除重复代码行数: 预计 200+ 行
- 减少文件数量: 1-2 个
- 提取公共函数: 5-8 个
- 新增服务层模块: 2-3 个

---

## 四、重构范围与优先级

### 4.1 高优先级（立即执行）

| 编号 | 重构项 | 影响范围 | 风险等级 |
|------|--------|----------|----------|
| R1 | 统一余额计算函数 | 后端 report.ts, balance-snapshot.ts | 中 |
| R2 | 抽取余额变化计算服务 | 后端 transaction.ts, report.ts | 中 |
| R3 | 修复 PrismaClient 重复创建 | 后端 data.ts | 低 |

### 4.2 中优先级（计划执行）

| 编号 | 重构项 | 影响范围 | 风险等级 |
|------|--------|----------|----------|
| R4 | 创建后端服务层 | 后端所有路由 | 高 |
| R5 | 统一错误处理机制 | 后端 | 中 |
| R6 | 添加请求参数验证 | 后端 | 中 |
| R7 | 共享类型定义 | 前后端 | 中 |

### 4.3 低优先级（可选执行）

| 编号 | 重构项 | 影响范围 | 风险等级 |
|------|--------|----------|----------|
| R8 | 清理未使用的API | 后端 | 低 |
| R9 | 统一树构建函数 | 前后端 | 低 |
| R10 | 抽取通用Modal组件 | 前端 | 中 |
| R11 | 清理重复导出文件 | 前端 | 低 |
| R12 | 优化Store刷新逻辑 | 前端 | 低 |

---

## 五、详细重构方案

### 5.1 R1: 统一余额计算函数

**当前状态**:
- report.ts 中有完整版本（支持初始余额日期、转账）
- balance-snapshot.ts 中有简化版本

**重构方案**:
1. 在 `backend/src/services/` 创建 `balance.service.ts`
2. 将 report.ts 中的 `calculateBalanceAtDate` 移至服务层
3. 删除 balance-snapshot.ts 中的重复函数
4. 两处都导入使用服务层函数

**重构后代码结构**:
```
backend/src/
├── services/
│   └── balance.service.ts  # 新增
├── routes/
│   ├── report.ts           # 修改：导入服务
│   └── balance-snapshot.ts # 修改：导入服务
```

---

### 5.2 R2: 抽取余额变化计算服务

**当前状态**:
- transaction.ts 中定义了 `calculateBalanceChange` 和 `calculateTransferInAmount`
- report.ts 中有类似的内联计算逻辑

**重构方案**:
1. 在 `balance.service.ts` 中添加余额变化计算函数
2. 统一所有余额变化计算逻辑
3. 提供清晰的函数文档

**重构后接口**:
```typescript
// backend/src/services/balance.service.ts
export interface BalanceChange {
  mainAccountChange: number
  toAccountChange?: number
}

export function calculateTransactionBalanceChange(
  type: TransactionType,
  amount: number,
  fee: number,
  coupon: number
): BalanceChange
```

---

### 5.3 R3: 修复 PrismaClient 重复创建

**当前状态**:
```typescript
// data.ts
const prisma = new PrismaClient()  // 错误：重复创建
```

**重构方案**:
```typescript
// data.ts
import { prisma } from '../index.js'  // 使用共享实例
```

---

### 5.4 R4: 创建后端服务层

**重构方案**:
创建以下服务模块：

```
backend/src/services/
├── balance.service.ts    # 余额计算相关
├── transaction.service.ts # 交易业务逻辑
├── report.service.ts     # 报表生成逻辑
└── category.service.ts   # 分类树构建逻辑
```

**服务层职责**:
- balance.service.ts: 余额计算、余额变化计算
- transaction.service.ts: 交易创建、更新、删除的业务逻辑
- report.service.ts: 资产负债表、收支表、现金流量表生成
- category.service.ts: 分类树构建、分类验证

---

### 5.5 R5: 统一错误处理机制

**重构方案**:
1. 创建自定义错误类
2. 在服务层抛出特定错误
3. 路由层捕获并传递给错误中间件

**新增文件**:
```typescript
// backend/src/errors/index.ts
export class AppError extends Error {
  constructor(
    public message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message)
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource}不存在`, 'NOT_FOUND', 404)
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400)
  }
}

export class BusinessError extends AppError {
  constructor(message: string) {
    super(message, 'BUSINESS_ERROR', 400)
  }
}
```

---

### 5.6 R7: 共享类型定义

**重构方案**:
1. 创建 `shared/types` 目录存放共享类型
2. 使用 TypeScript 的 path mapping 或 npm workspaces
3. 前后端都从共享模块导入类型

**目录结构**:
```
MoneyBrain/
├── shared/
│   └── types/
│       ├── api.ts        # API响应类型
│       ├── account.ts    # 账户相关类型
│       ├── transaction.ts # 交易相关类型
│       └── index.ts      # 统一导出
├── frontend/
└── backend/
```

---

## 六、测试策略

### 6.1 测试范围
1. **单元测试**: 新创建的服务层函数
2. **集成测试**: API 接口功能
3. **回归测试**: 确保重构后功能不变

### 6.2 测试用例

#### 余额计算测试
```typescript
describe('BalanceService', () => {
  describe('calculateBalanceAtDate', () => {
    it('应正确计算指定日期的账户余额')
    it('应正确处理初始余额日期')
    it('应正确处理转账交易')
    it('应正确处理退款交易')
  })
  
  describe('calculateTransactionBalanceChange', () => {
    it('应正确计算收入余额变化')
    it('应正确计算支出余额变化')
    it('应正确计算转账余额变化')
    it('应正确处理手续费和优惠券')
  })
})
```

---

## 七、实施步骤

### 阶段一：高优先级重构（预计 2-3 小时）
1. 创建 `balance.service.ts`
2. 统一余额计算函数
3. 统一余额变化计算函数
4. 修复 PrismaClient 重复创建
5. 运行测试验证

### 阶段二：中优先级重构（预计 4-5 小时）
1. 创建错误处理模块
2. 创建其他服务层模块
3. 重构路由文件使用服务层
4. 添加请求验证
5. 运行测试验证

### 阶段三：低优先级重构（预计 2-3 小时）
1. 清理未使用代码
2. 统一工具函数
3. 优化前端组件
4. 全面回归测试

---

## 八、风险评估

| 风险项 | 可能性 | 影响 | 缓解措施 |
|--------|--------|------|----------|
| 重构引入新bug | 中 | 高 | 充分的单元测试和集成测试 |
| 服务层抽象不合理 | 低 | 中 | 先实现核心功能，逐步优化 |
| 类型共享配置复杂 | 低 | 低 | 可选方案，不影响核心功能 |
| 重构时间超出预期 | 中 | 中 | 分阶段实施，优先高优先级 |

---

## 九、预期效果

### 9.1 代码质量提升
- 减少重复代码约 200+ 行
- 提高代码复用率
- 增强代码可测试性

### 9.2 可维护性提升
- 业务逻辑集中管理
- 清晰的模块划分
- 统一的错误处理

### 9.3 扩展性提升
- 服务层便于添加新功能
- 类型共享便于前后端协作
- 模块化设计便于扩展
