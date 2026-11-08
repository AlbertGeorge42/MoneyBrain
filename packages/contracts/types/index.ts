// ===== 金额单位 =====

import type { Minor } from '../../domain/src/index.js'
import type { BackupDataType } from '../constants.js'

export type { Minor }
export type { BackupDataType }

/**
 * 本项目所有金额字段的单位都是**分**（整数），从 DB 到前端一致。
 * 唯一例外：CSV / 备份文件与用户输入框用元——换算只发生在那一处。
 */

// ===== 通用响应类型 =====

/**
 * 后端统一错误码。
 * 前端据此决定提示文案、是否重试、是否需要用户介入。
 */
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'DUPLICATE_ERROR'
  | 'FOREIGN_KEY_ERROR'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN'

export interface ApiError {
  code: ApiErrorCode
  /** 面向用户的可读文案 */
  message: string
  /** 结构化补充信息（如字段级校验错误） */
  details?: unknown
  /** 请求 ID，用于在后端日志中定位同一次请求 */
  requestId?: string
}

export interface ApiSuccessResponse<T> {
  success: true
  data: T
  timestamp: string
}

export interface ApiErrorResponse {
  success: false
  error: ApiError
  timestamp: string
}

/** 所有 API 响应的联合类型：成功必有 data，失败必有 error */
export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse

export interface PaginatedResponse<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

/** 通用操作成功响应：删除 / 批量排序 / 清库等只回一句话的端点。 */
export interface MessageResult {
  message: string
}

// ===== 账户分类 =====

export interface AccountCategory {
  id: string
  name: string
  type: string
  parentId: string | null
  sort: number
  parent: AccountCategory | null
  children: AccountCategory[]
  isCashEquivalent: boolean
  isInvestment: boolean
  createdAt: string
  updatedAt: string
}

// ===== 账户 =====

export interface Account {
  id: string
  name: string
  type: string
  initialBalance: Minor
  /** 本地日历日 `YYYY-MM-DD`（无时分秒，不做 UTC 换算）。 */
  initialBalanceDate: string | null
  categoryId: string | null
  sort: number
  category: AccountCategory | null
  createdAt: string
  updatedAt: string
}

export interface AccountStats {
  transactionCount: number
  totalIncome: Minor
  totalExpense: Minor
}

/** 某账户在某日的余额查询（GET /accounts/:id/balance-at）。 */
export interface AccountBalanceAtResult {
  accountId: string
  date: string
  balance: Minor
}

/** 一键对账的结果（POST /accounts/:id/reconcile）。 */
export interface AccountReconcileResult {
  accountId: string
  date: string
  /** 账面推导值（覆盖时已剔除被覆盖的当日调整）。 */
  bookBalance: Minor
  actualBalance: Minor
  /** actualBalance − bookBalance；正数入账、负数出账。 */
  difference: Minor
  status: 'balanced' | 'created' | 'overwritten' | 'appended'
  transactionId: string | null
}

/** 删除账户的结果：级联删除的各类关联行数 + 6 秒撤销用的审计事件 id。 */
export interface AccountDeleteResult {
  message: string
  auditEventId: string
  deletedTransactions?: number
  deletedIncomingTransfers?: number
  deletedBudgets?: number
  deletedAssetClasses?: number
  deletedSnapshots?: number
}

// ===== 交易分类 =====

export interface TransactionCategory {
  id: string
  name: string
  type: string
  parentId: string | null
  sort: number
  parent: TransactionCategory | null
  children: TransactionCategory[]
  cashFlowType: 'operating' | 'investing' | 'financing' | null
  createdAt: string
  updatedAt: string
}

/** 删除交易分类的结果：按所选处理方式返回转移 / 删除的交易数 + 6 秒撤销用的审计事件 id。 */
export interface TransactionCategoryDeleteResult {
  message: string
  auditEventId: string
  transferredTransactions?: number
  deletedTransactions?: number
  transferredBudgets?: number
  deletedCategory?: string
}

/** 移动交易分类的结果。 */
export interface TransactionCategoryMoveResult {
  message: string
  movedCategory: TransactionCategory
}

// ===== 交易 =====

// 交易类型（表单与 API 共用）
export type TransactionType = 'expense' | 'income' | 'transfer' | 'refund' | 'adjustment'

export interface Transaction {
  id: string
  type: TransactionType
  ruleVersion: number
  amount: Minor
  fee: Minor
  coupon: Minor
  /** 本地日历日 `YYYY-MM-DD`（无时分秒，不做 UTC 换算）。 */
  date: string
  note: string | null
  accountId: string
  categoryId: string | null
  toAccountId: string | null
  relatedTransactionId: string | null
  relatedType: string | null // 'income' | 'expense'（退款时记录原交易类型）
  excludeFromIncomeExpense: boolean // 不计收支：不参与收入/支出统计（仍影响账户余额）
  deletedAt: string | null // 软删除时间；null = 未删除
  account: Account
  category: TransactionCategory | null
  toAccount: Account | null
  relatedTransaction: Transaction | null
  refunds: Transaction[]
  createdAt: string
}

/** 交易列表统计（口径由领域层规则定义，与报表同源）。 */
export interface TransactionStats {
  income: Minor
  expense: Minor
  refund: Minor
  balance: Minor
  transferCount: number
}

/** 最早一笔未删除交易的日期（报表期间参考；空库为 null）。 */
export interface EarliestTransactionDateResult {
  date: string | null
}

/** 交易软删除结果：auditEventId 供「已删除 · 撤销」反向写入。 */
export interface TransactionDeleteResult {
  message: string
  auditEventId: string
}

// ===== 自动定时备份（B3） =====

/**
 * 自动备份状态（执行时刻由内部策略决定：配置的间隔 + 空闲窗口），
 * 用户设置开关、目录、备份间隔与保留份数；F5 加密容器落地后目录不再限制。
 */
export interface AutoBackupConfig {
  enabled: boolean
  /** 备份目标目录（绝对路径） */
  directory: string
  /** 备份间隔（正整数小时；旧配置缺省 24） */
  intervalHours: number
  /** 目录内保留份数（正整数；旧配置缺省 7） */
  keepCount: number
  /** 上次成功执行时间（ISO 字符串；从未执行为 null） */
  lastRunAt: string | null
  /** 上次执行失败原因 */
  lastRunError: string | null
  /** 服务端默认目录（数据库同级 auto-backups/） */
  defaultDirectory: string
  /** 预计下次窗口（上次成功 + intervalHours；从未成功为 null，首次空闲即执行） */
  nextWindowAt: string | null
  /** 目录内现有备份份数 */
  backupCount: number
}

// ===== 审计事件与回收站（B2） =====

export type AuditEventAction = 'updated' | 'deleted' | 'restored'

/** 审计事件：行内字段为序列化快照（金额分 → 字符串，Date → ISO 字符串）。 */
export interface AuditEvent {
  id: string
  entity: string
  entityId: string
  action: AuditEventAction
  beforeJson: string | null
  afterJson: string | null
  at: string
}

/** 回收站条目：交易 + 最近一条 deleted 事件 id（恢复 = 撤销它）。 */
export interface RecycleBinItem {
  transaction: Transaction
  deleteEventId: string | null
}

/** 回收站里的硬删除实体（账户 / 交易分类），恢复 = 撤销 deleted 事件。 */
export interface RecycleBinEntityItem {
  deleteEventId: string
  entity: 'account' | 'transaction_category'
  entityId: string
  name: string
  detail: string
  deletedAt: string
  canRestore: boolean
}

/** 交易修改历史（详情页时间线）。 */
export interface AuditEventHistoryResult {
  list: AuditEvent[]
}

/** 回收站列表。 */
export interface RecycleBinResult {
  list: RecycleBinItem[]
  accounts?: RecycleBinEntityItem[]
  categories?: RecycleBinEntityItem[]
}

// ===== 预算 =====

export interface Budget {
  id: string
  name: string
  type: 'income' | 'expense' | 'transfer'
  amount: Minor
  period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  /** 本地日历日 `YYYY-MM-DD`（无时分秒，不做 UTC 换算）。 */
  startDate: string
  /** 本地日历日 `YYYY-MM-DD`；null = 无限期。 */
  endDate: string | null
  transactionTime: number | null
  note: string | null
  isActive: boolean
  accountId: string
  toAccountId: string | null
  categoryId: string
  account: Account
  toAccount: Account | null
  category: TransactionCategory
  createdAt: string
  updatedAt: string
}

export interface BudgetPrediction {
  date: string
  type: 'income' | 'expense' | 'transfer'
  amount: Minor
  note: string | null
  accountId: string
  toAccountId: string | null
  categoryId: string
  budgetId: string
  budgetName: string
}

export interface BudgetStatus {
  budget: Budget
  used: Minor
  remaining: Minor
  /** 真实使用率：超支时 >100，不截断（C3）；进度条条宽可封顶，文本必须显示真实值 */
  percentage: number
  isOverBudget: boolean
}

/** 预算下钻明细行（C2）：与预算用量同一口径，signedAmount 为主类型 +、冲减退款 −。 */
export interface BudgetUsageDetail {
  transaction: Transaction
  /** 计入金额：主类型交易为正、冲减退款为负 */
  signedAmount: Minor
}

export interface BudgetUsageDetails {
  list: BudgetUsageDetail[]
  /** 计入条数（主类型 + 冲减退款） */
  count: number
  /** 明细合计（跨期退款冲减超过本期支出时为负） */
  total: Minor
  /** 已用：与预算状态同款下限（负数夹到 0），与预算卡上的「已使用」一致 */
  used: Minor
}

export interface TransactionCategoryStats {
  transactionCount: number
  childrenCount: number
}

// ===== 分析与报表 =====

/** 总览仪表盘（近两月收支 + 最近交易）。 */
export interface DashboardSummaryData {
  thisMonth: { income: Minor; expense: Minor; balance: Minor }
  lastMonth: { income: Minor; expense: Minor }
  recentTransactions: Transaction[]
}

export interface ReportValue {
  actual: Minor
  predicted: Minor
}

export interface AnalyticsTrendItem {
  label: string
  amount: Minor
}

export interface AnalyticsCategoryBreakdownItem {
  name: string
  value: Minor
  categoryId?: string
  hasChildren?: boolean
}

export interface AnalyticsAssetTrendItem {
  label: string
  assets: Minor
  liabilities: Minor
  netWorth: Minor
}

// 资产负债表 - 分类节点
export interface BalanceSheetCategoryNode {
  id: string  // categoryId
  name: string
  type: 'asset' | 'liability'
  sort: number
  actual: Minor
  predicted: Minor
  children: BalanceSheetAccountNode[]
}

// 资产负债表 - 账户节点
export interface BalanceSheetAccountNode {
  id: string  // accountId
  name: string
  categoryId: string
  type: 'asset' | 'liability'
  actual: Minor
  predicted: Minor
}

export interface BalanceSheetReportData {
  date: string
  granularity: 'day' | 'month' | 'year'
  assets: ReportValue
  liabilities: ReportValue
  netWorth: ReportValue
  assetsByCategory: Record<string, Minor>
  liabilitiesByCategory: Record<string, Minor>
  assetNodes: BalanceSheetCategoryNode[]
  liabilityNodes: BalanceSheetCategoryNode[]
  predictionNote?: string
}

export interface ReportCategoryDetail {
  name: string
  actual: Minor
  predicted: Minor
  categoryId: string
  hasChildren: boolean
  sort: number
  children?: ReportCategoryDetail[]
}

export interface IncomeExpenseReportData {
  startDate: string
  endDate: string
  income: ReportValue
  expense: ReportValue
  balance: ReportValue
  /**
   * 对账条：期初净资产 + 净收入 − 净支出 + other = 期末净资产。
   * other = 不进收支统计但改变余额的部分（不计收支、转账手续费、平账、减开户日前的交易）。
   * difference = 期末 − 上面等式的右边；恒为 0 才说明收支口径与余额口径自洽。
   */
  reconciliation: {
    startNetWorth: Minor
    netIncome: Minor
    netExpense: Minor
    other: Minor
    endNetWorth: Minor
    difference: Minor
  }
  incomeByCategory: Record<string, Minor>
  expenseByCategory: Record<string, Minor>
  incomeCategoryDetails: ReportCategoryDetail[]
  expenseCategoryDetails: ReportCategoryDetail[]
  startAssets: ReportValue
  startLiabilities: ReportValue
  startNetWorth: ReportValue
  endAssets: ReportValue
  endLiabilities: ReportValue
  endNetWorth: ReportValue
  assetChange: ReportValue
  predictionNote?: string
}

export interface CashFlowActivityItem {
  categoryName: string
  categoryId: string | null
  parentId: string | null
  level: number
  amount: Minor
  actual: Minor
  predicted: Minor
  type: string
  direction: string
  children?: CashFlowActivityItem[]
}

export interface CashFlowActivity {
  inflow: ReportValue
  outflow: ReportValue
  net: ReportValue
  items: CashFlowActivityItem[]
}

export interface SankeyLink {
  source: string
  target: string
  value: Minor
  actualValue?: Minor
  predictedValue?: Minor
}

export interface CashFlowReportData {
  startDate: string
  endDate: string
  cashInflow: ReportValue
  cashOutflow: ReportValue
  netCashFlow: ReportValue
  /** 平账（对账调整）净额，单列展示，不计入生活/投资/筹资流量。 */
  reconciliation: ReportValue
  flowByAccount: Record<string, { inflow: ReportValue; outflow: ReportValue }>
  cashAccounts: string[]
  startCash: ReportValue
  endCash: ReportValue
  cashChange: ReportValue
  byActivity: {
    operating: CashFlowActivity
    investing: CashFlowActivity
    financing: CashFlowActivity
    uncategorized: CashFlowActivity
  }
  sankey: {
    nodes: Array<{
      name: string
      category?: 'income_category' | 'non_cash_source' | 'cash' | 'expense_category' | 'non_cash_target'
    }>
    links: SankeyLink[]
  }
  predictionNote?: string
}

// ===== 投资分析 =====

export interface InvestmentAccountDetail {
  id: string
  name: string
  categoryId: string | null
  categoryName: string
  balance: Minor
  ratio: number
  totalInvested: Minor
  totalWithdrawn: Minor
  maxCapitalEmployed: Minor
  simpleReturnRate: number
  cumulativeReturnRate: number
}

export interface InvestmentCategorySummary {
  categoryId: string
  categoryName: string
  balance: Minor
  ratio: number
  accounts: InvestmentAccountDetail[]
}

export interface InvestmentReturnAnalysis {
  startValue: Minor
  endValue: Minor
  valueChange: Minor
  periodInvested: Minor
  periodWithdrawn: Minor
  netCashFlow: Minor
  periodReturn: Minor
  maxCapitalEmployed: Minor
  simpleReturnRate: number
  cumulativeReturnRate: number
  xirr: number | null
  twr: number | null
  annualizedTwr: number | null
  investmentDays: number
  cashFlowCount: number
}

export interface InvestmentTrendItem {
  month: string
  investment: Minor
  netWorth: Minor
  ratio: number
}

// ===== 投资资产类型 =====

export interface InvestmentAssetClass {
  id: string
  accountId: string
  name: string
  targetRatio: number | null
  sort: number
  createdAt: string
  updatedAt: string
}

/** 删除资产类别的结果：被快照引用且未强制时返回 needConfirm 与引用数。 */
export interface AssetClassDeleteResult {
  message: string
  needConfirm?: boolean
  snapshotsCount?: number
  deletedSnapshots?: number
}

// ===== 投资快照 =====

export interface InvestmentAllocationItem {
  id: string
  snapshotId: string
  assetClassId: string
  marketValue: Minor
  periodNetFlow: Minor
  sort: number
  assetClass: InvestmentAssetClass
}

export interface InvestmentAllocationSnapshot {
  id: string
  accountId: string
  /** 本地日历日 `YYYY-MM-DD`（无时分秒，不做 UTC 换算）。 */
  date: string
  accountBalance: Minor
  previousSnapshotId: string | null
  note: string | null
  items: InvestmentAllocationItem[]
  createdAt: string
  updatedAt: string
}

// ===== 投资分析报表扩展 =====

export interface AccountAllocationItem {
  assetClassId: string
  name: string
  marketValue: Minor
  ratio: number
  targetRatio: number | null
  deviation: number | null
  rebalanceAmount: Minor | null
  periodInvested: Minor
  periodWithdrawn: Minor
  periodReturn: Minor | null
  returnRate: number | null
  sort: number
}

export interface SnapshotHistoryItem {
  id: string
  date: string
  accountBalance: Minor
  items: Array<{
    assetClassId: string
    name: string
    marketValue: Minor
    ratio: number
  }>
}

export interface AccountAllocationDetail {
  accountId: string
  accountName: string
  balance: Minor
  hasAssetClasses: boolean
  latestSnapshotDate: string | null
  returnRate: number | null
  items: AccountAllocationItem[]
  snapshots: SnapshotHistoryItem[]
}

export interface StaleAccountInfo {
  accountId: string
  accountName: string
  daysSinceLastSnapshot: number
  balance: Minor
}

export interface InvestmentAnalysisReportData {
  startDate: string
  endDate: string
  totalInvestment: Minor
  /** 资产合计（含负余额资产），仅用于「总资产」展示。 */
  totalAssets: Minor
  /** 投资占比的分母：正余额资产合计（负余额资产与负债账户都不计入）。 */
  ratioBase: Minor
  /** 分母里排除掉的负余额资产：账户数量与合计（正数幅度）。 */
  excludedNegativeAssetCount: number
  excludedNegativeAssets: Minor
  /** = totalInvestment / ratioBase，恒 ≤ 100%。 */
  investmentRatio: number
  accountCount: number
  returnAnalysis: InvestmentReturnAnalysis
  byCategory: InvestmentCategorySummary[]
  trend: InvestmentTrendItem[]
  byAccountAllocation: AccountAllocationDetail[]
  staleAccounts: StaleAccountInfo[]
}

// ===== 导入与回滚 =====

/**
 * 一次导入的结果计数。
 * 前后端共用同一份定义——预览与正式导入返回同一结构，
 * 预览数字才能直接和实际结果对照。
 */
export interface ImportCounts {
  accountCategories: number
  accounts: number
  transactionCategories: number
  transactions: number
  budgets: number
  investmentSnapshots: number
  investmentItems: number
}

/**
 * 更新计数：交易只导入不更新（重复的按幂等键跳过），持仓随快照一起写入。
 */
export interface ImportUpdatedCounts {
  accountCategories: number
  accounts: number
  transactionCategories: number
  budgets: number
  investmentSnapshots: number
}

/**
 * 跳过计数：持仓不会单独被跳过（它随快照整体写入）。
 */
export interface ImportSkippedCounts {
  accountCategories: number
  accounts: number
  transactionCategories: number
  transactions: number
  budgets: number
  investmentSnapshots: number
}

/**
 * 一条被跳过的 CSV 行。解析/入库失败必须留下这条记录，
 * 不能像旧实现那样 catch 后静默丢掉。
 */
export interface ImportSkippedRow {
  /** CSV 数据行号（含表头，从 1 起算） */
  rowNumber: number
  /** 可读的失败原因 */
  reason: string
  /** 原始行的核心字段原值（字段名 → 值） */
  raw: Record<string, string>
}

/**
 * 导入文件本身的摘要：确认前就能看到的数字。
 * 全部来自真实解析结果，预览与正式导入走同一段解析代码。
 */
export interface ImportFileSummary {
  /** 文件里可解析的流水笔数（含被重复跳过的） */
  total: number
  /** 这些流水的金额绝对值合计（分） */
  amountTotal: number
  /** 期间跨度（YYYY-MM-DD） */
  dateFrom: string | null
  dateTo: string | null
  /** 文件里出现、但库里还没有、导入时会新建的账户名 */
  unknownAccounts: string[]
  /** 文件里出现、但库里还没有、导入时会新建的分类名 */
  unknownCategories: string[]
  /** 疑似重复（幂等键已存在或文件内重复）而被跳过的笔数 */
  duplicates: number
  /** 被跳过的行；空数组表示没有任何行被静默丢弃 */
  skippedRows: ImportSkippedRow[]
  /** 已安全自动修正的行数（如金额浮点尾差四舍五入到分） */
  autoFixedRows: number
}

export interface ImportFullResult {
  imported: ImportCounts
  updated: ImportUpdatedCounts
  skipped: ImportSkippedCounts
  errors: string[]
  /** 预览与正式导入都返回；旧调用方可以不读 */
  summary?: ImportFileSummary
}

/** 正式导入的结果：覆盖模式额外带回滚点 id，所有模式都带导入批次 id。 */
export interface ImportBackupResult extends ImportFullResult {
  rollbackPointId?: string
  /** 本次导入的批次 id，可按它精确回滚 */
  importId?: string
}

/** 一次导入批次的可读信息（设置页展示「这批导入了多少笔」）。 */
export interface ImportBatch {
  id: string
  createdAt: string
  filename: string
  mode: 'merge' | 'overwrite'
  includes: BackupDataType[]
  imported: ImportCounts
  /** 本批实际新增的流水笔数 */
  transactionCount: number
  status: 'active' | 'rolledBack'
  rolledBackAt: string | null
  /** 回滚实际删除的各类行数（仅回滚过的批次有） */
  rolledBack: Record<string, number> | null
}

export interface ImportBatchRollbackResult {
  importId: string
  /** 各类实际删除的行数 */
  removed: Record<string, number>
  /** 其中流水笔数——回滚后给用户的「撤销了 N 笔」 */
  removedTransactions: number
}

/** 备份文件内容识别：该文件包含哪些数据类型。 */
export interface DetectFileResult {
  includes: BackupDataType[]
}

/**
 * 覆盖导入的预览结果。
 * 与正式导入同一份结构，区别只在于库未真正改变。
 */
export interface ImportPreview {
  /** 预览的数字，与正式导入完全一致 */
  result: ImportFullResult
  /** 本次覆盖会清空的数据类型 */
  willOverwrite: BackupDataType[]
  /** 覆盖后各数据类型的最终条数 */
  resultingCounts: ImportCounts
}

/**
 * 一个回滚点：覆盖导入前自动留下的整库快照。
 */
export interface RollbackPoint {
  id: string
  /** 创建时间（ISO 字符串） */
  createdAt: string
  /** 触发原因，如「覆盖导入前」 */
  reason: string
  /** 本次回滚点覆盖的数据类型 */
  includes: BackupDataType[]
  /** 快照各表的行数统计 */
  stats: Record<string, number>
  /** 快照文件大小（字节） */
  sizeBytes: number
}

export interface RollbackResult {
  /** 已恢复的表名 */
  restoredTables: string[]
  /** 快照各表的行数统计 */
  stats: Record<string, number>
}

// ===== 预算推演（资产 / 现金流） =====

/** 推演窗口：3 / 6 / 12 个月。 */
export type ProjectionMonths = 3 | 6 | 12

/**
 * 资产/负债水平（整数分）。
 * liabilities 为正数欠款（与资产负债报表同一口径）；netWorth = assets − liabilities。
 */
export interface ProjectionBalance {
  assets: Minor
  liabilities: Minor
  netWorth: Minor
}

/**
 * 被未来真实交易覆盖的预算点位。
 *
 * occurrence 匹配口径：同一预算点位所属周期内，存在同类型、同账户（转账还需同转入账户）
 * 的已排定真实交易。命中后该点位从 planned 中剔除，金额只出现在 committed。
 */
export interface ProjectionCoveredOccurrence {
  budgetId: string
  budgetName: string
  type: 'income' | 'expense' | 'transfer'
  /** 预算点位日期（YYYY-MM-DD）。 */
  date: string
  /** 被剔除的 planned 金额。 */
  amount: Minor
  /** 覆盖它的真实交易。 */
  transactionId: string
  transactionDate: string
}

/**
 * 一行推演点位。
 *
 * - actual：asOf 当期真实余额（只含 date ≤ asOf 的交易；未来各点保持不变）
 * - planned：预算展开的**累计增量**（相对 actual，已剔除被真实交易覆盖的点位）
 * - committed：已排定未来真实交易的**累计增量**（相对 actual）
 * - total = actual + planned + committed（逐项相加）
 *
 * planned 与 committed 是两个互不重叠的来源：未来日期真实交易只进 committed，
 * 预算展开只进 planned，同一笔计划被真实交易覆盖时只保留 committed 一份。
 */
export interface AssetProjectionPoint {
  label: string
  /** 该月最后一个日历日（YYYY-MM-DD）。 */
  date: string
  actual: ProjectionBalance
  planned: ProjectionBalance
  committed: ProjectionBalance
  total: ProjectionBalance
  /** 本月（label）计划点位被真实交易覆盖的 occurrence（已从 planned 剔除，金额只在 committed）。 */
  covered: ProjectionCoveredOccurrence[]
}

export interface AssetProjectionResult {
  /** 推演起点（YYYY-MM-DD）。 */
  asOf: string
  months: ProjectionMonths
  /** 起点真实余额，等于每个点位里的 actual。 */
  base: ProjectionBalance
  points: AssetProjectionPoint[]
}

/** 一组现金流口径：actual（当期已发生）+ planned + committed。 */
export interface ProjectionFlowValue {
  actual: Minor
  planned: Minor
  committed: Minor
  total: Minor
}

/** 现金流推演点位：期初 + 净额 = 期末。 */
export interface CashFlowProjectionPoint {
  label: string
  /** 该月最后一个日历日（YYYY-MM-DD）。 */
  date: string
  inflow: ProjectionFlowValue
  outflow: ProjectionFlowValue
  net: ProjectionFlowValue
  startCash: Minor
  endCash: Minor
  /** 本月（label）计划点位被真实交易覆盖的 occurrence（已从 planned 剔除，金额只在 committed）。 */
  covered: ProjectionCoveredOccurrence[]
}

export interface CashFlowProjectionResult {
  asOf: string
  months: ProjectionMonths
  /** 首个推演月月初现金（真实余额，不含未来日期交易）。 */
  startCash: Minor
  /** 末个推演月月末现金（= 逐月净额累加）。 */
  endCash: Minor
  points: CashFlowProjectionPoint[]
}

/** 某个预算在某个月的展开点位。 */
export interface BudgetPeriodPlanOccurrence {
  budgetId: string
  budgetName: string
  type: 'income' | 'expense' | 'transfer'
  /** 该点位日期（YYYY-MM-DD）。 */
  date: string
  amount: Minor
}

export interface BudgetPeriodPlanPoint {
  /** 自然月（YYYY-MM）。 */
  month: string
  /** 该月是否存在预算展开点位；false 表示「无预算」。 */
  hasBudget: boolean
  budgets: BudgetPeriodPlanOccurrence[]
  /** 该月预算额度合计；hasBudget=false 时为 null（不用 0 冒充无预算）。 */
  totals: { income: Minor; expense: Minor; transfer: Minor } | null
}

export interface BudgetPeriodPlanResult {
  fromMonth: string
  months: number
  points: BudgetPeriodPlanPoint[]
}
