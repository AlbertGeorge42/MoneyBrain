import assert from 'node:assert/strict'
import test from 'node:test'
import { formatAmount, parseAmount } from '../src/index.js'

test('元字符串按小数点解析，不经过浮点', () => {
  assert.equal(parseAmount('8.11'), 811)
  assert.equal(parseAmount('8.1'), 810)
  assert.equal(parseAmount('8'), 800)
  assert.equal(parseAmount('0.01'), 1)
  assert.equal(parseAmount('0.0'), 0)
  assert.equal(parseAmount('-0.01'), -1)
  assert.equal(parseAmount('1,234.56'), 123456)
  assert.equal(parseAmount(' 12.30 '), 1230)
})

test('超过两位小数或非法格式直接失败，不静默舍入', () => {
  assert.throws(() => parseAmount('8.115'), /金额格式无效/)
  assert.throws(() => parseAmount('abc'), /金额格式无效/)
  assert.throws(() => parseAmount(''), /金额格式无效/)
  assert.throws(() => parseAmount('1.2.3'), /金额格式无效/)
  // 15 位整数部分会超过安全整数，直接拒绝而不是给出近似值
  assert.throws(() => parseAmount('123456789012345'), /金额必须是整数分|金额格式无效/)
})

test('分转元字符串固定两位小数，负数与边界正确', () => {
  assert.equal(formatAmount(811), '8.11')
  assert.equal(formatAmount(2900), '29.00')
  assert.equal(formatAmount(-1), '-0.01')
  assert.equal(formatAmount(0), '0.00')
  assert.equal(formatAmount(9000000000000000), '90000000000000.00')
})

test('解析与格式化往返一致', () => {
  for (const value of ['0.00', '0.01', '-0.01', '8.11', '1234.56', '-90000000000000.00']) {
    assert.equal(formatAmount(parseAmount(value)), value)
  }
})
