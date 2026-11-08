/** 交易 CSV 的完整表头（19 列，含口径版本），与导出端保持一致。 */
export const TRANSACTION_CSV_HEADER = [
  'ID', '时间', '分类', '二级分类', '类型', '金额', '币种',
  '账户1', '账户2', '备注', '已报销', '手续费', '优惠券',
  '记账者', '账单标记', '标签', '账单图片', '关联账单', '口径版本',
] as const

/**
 * 测试用 CSV 构造器：表头与 BOM 由调用方声明，行数据由各用例按场景填写。
 *
 * 各导入场景的列数并不相同（交易导出 19 列、历史导入 18 列、快照 9 列），
 * 所以表头必须显式传入，不能在这里写死。
 */
export function csvBuffer(
  rows: readonly (readonly string[])[],
  options: { header: readonly string[]; bom?: boolean },
): Buffer {
  const lines = [options.header.join(','), ...rows.map((row) => row.join(','))]
  return Buffer.from((options.bom ? '\uFEFF' : '') + lines.join('\n'), 'utf-8')
}
