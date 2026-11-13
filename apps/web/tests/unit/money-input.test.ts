/**
 * 金额输入边界：前端只有这一处「元文本 → 整数分」入口，
 * 解析内核是 Domain 的 parseAmount（字符串按位解析，不经浮点）。
 */
import { describe, expect, it } from 'vitest'
import { editableAmount, formatAmountInput, normalizeAmountInput, parseMoneyInput } from '@/utils/money'

describe('parseMoneyInput', () => {
  it('归一化后进同一个解析内核', () => {
    expect(normalizeAmountInput(' ¥ 1,234.56 ')).toBe('1234.56')
    expect(parseMoneyInput('¥1,234.56')).toBe(123_456)
    expect(parseMoneyInput('１２３４')).toBe(123_400)
    expect(parseMoneyInput('１２．５')).toBe(1250)
  })

  it('按字符串按位解析，不产生浮点尾差', () => {
    expect(parseMoneyInput('8.11')).toBe(811)
    expect(parseMoneyInput('0.01')).toBe(1)
    expect(parseMoneyInput('0.10')).toBe(10)
    expect(parseMoneyInput('1234567.89')).toBe(123_456_789)
  })

  it('用户输入到一半的孤立小数点等价于整数', () => {
    expect(parseMoneyInput('8.')).toBe(800)
    expect(parseMoneyInput('8.0')).toBe(800)
  })

  it('超过两位小数、科学计数法、非安全整数一律拒绝，不静默舍入', () => {
    expect(parseMoneyInput('8.115')).toBeNull()
    expect(parseMoneyInput('0.005')).toBeNull()
    expect(parseMoneyInput('1e3')).toBeNull()
    expect(parseMoneyInput('99999999999999999999')).toBeNull()
  })

  it('空串、纯符号与非法格式返回 null', () => {
    expect(parseMoneyInput('')).toBeNull()
    expect(parseMoneyInput('   ')).toBeNull()
    expect(parseMoneyInput('-')).toBeNull()
    expect(parseMoneyInput('¥')).toBeNull()
    expect(parseMoneyInput('1.2.3')).toBeNull()
  })

  it('正负与 0 由调用方按场景裁定', () => {
    expect(parseMoneyInput('-5')).toBeNull()
    expect(parseMoneyInput('0')).toBeNull()
    expect(parseMoneyInput('-676.80', { allowNegative: true })).toBe(-67_680)
    expect(parseMoneyInput('0', { allowZero: true })).toBe(0)
    expect(parseMoneyInput('0.00', { allowZero: true })).toBe(0)
  })
})

describe('金额展示', () => {
  it('失焦格式化走千分位，失败时保留原文', () => {
    expect(formatAmountInput('1234.56')).toBe('1,234.56')
    expect(formatAmountInput('8.115')).toBe('8.115')
  })

  it('可编辑文本：整数去掉 .00，非整数保留两位小数', () => {
    expect(editableAmount(10000)).toBe('100')
    expect(editableAmount(123456)).toBe('1234.56')
    expect(editableAmount(-67680)).toBe('-676.80')
    expect(editableAmount(0)).toBe('0')
  })
})
