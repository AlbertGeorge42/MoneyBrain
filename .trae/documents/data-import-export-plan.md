# 数据导入导出功能计划

## CSV 格式分析

### 钱迹 CSV 格式
```
ID,时间,分类,二级分类,类型,金额,币种,账户1,账户2,备注,已报销,手续费,优惠券,记账者,账单标记,标签,账单图片,关联账单
```

### 字段映射

| CSV字段 | MoneyBrain字段 | 说明 |
|---------|---------------|------|
| ID | - | 忽略，使用UUID |
| 时间 | date | 交易日期时间 |
| 分类 | category.name | 一级分类名称 |
| 二级分类 | category.name | 合并为分类名（如"餐饮-三餐"） |
| 类型 | type | 支出→expense, 收入→income, 转账→transfer, 退款→expense(负数), 还款→transfer |
| 金额 | amount | 交易金额 |
| 币种 | - | 忽略，默认CNY |
| 账户1 | account.name | 交易账户 |
| 账户2 | toAccount.name | 转账目标账户（转账类型） |
| 备注 | note | 交易备注 |
| 已报销 | - | 忽略 |
| 手续费 | - | 忽略 |
| 优惠券 | - | 忽略 |
| 记账者 | - | 忽略 |
| 账单标记 | - | 特殊标记（如"不计收支"） |
| 标签 | - | 忽略 |
| 账单图片 | - | 忽略 |
| 关联账单 | - | 忽略 |

### 类型转换规则

| CSV类型 | MoneyBrain类型 | 处理方式 |
|---------|---------------|---------|
| 支出 | expense | 正常支出 |
| 收入 | income | 正常收入 |
| 转账 | transfer | 账户间转账 |
| 退款 | expense | 支出，金额取负 |
| 还款 | transfer | 转账类型 |

## 实施方案

### 1. 后端 API

#### 导入 API
```
POST /api/data/import
Content-Type: multipart/form-data

请求：CSV文件
响应：{ success: true, data: { imported: number, skipped: number, errors: [] } }
```

#### 导出 API
```
GET /api/data/export
响应：CSV文件下载
```

### 2. 导入逻辑

1. 解析CSV文件
2. 提取所有账户和分类
3. 创建不存在的账户和分类
4. 创建交易记录

### 3. 导出逻辑

1. 查询所有交易记录
2. 按钱迹格式生成CSV
3. 返回文件下载

## 文件变更

| 文件 | 操作 |
|------|------|
| backend/src/routes/data.ts | 修改：添加导入/导出接口 |
| frontend/src/pages/Settings.tsx | 修改：添加导入按钮 |
| frontend/src/services/api.ts | 修改：添加导入API方法 |
