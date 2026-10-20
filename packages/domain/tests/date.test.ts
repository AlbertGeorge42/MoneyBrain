import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addDays,
  contains,
  localDate,
  periodLengthInDays,
  periodOfMonth,
  periodOfQuarter,
  periodOfWeek,
  periodOfYear,
} from '../src/index.js'

const d = (value: string) => localDate(value)

test('月份期间是半开区间', () => {
  const period = periodOfMonth(d('2026-02-15'))
  assert.equal(period.start, d('2026-02-01'))
  assert.equal(period.endExclusive, d('2026-03-01'))
  assert.equal(contains(period, d('2026-02-28')), true)
  assert.equal(contains(period, d('2026-03-01')), false)
})

test('闰年 2 月长度正确', () => {
  assert.equal(periodLengthInDays(periodOfMonth(d('2024-02-10'))), 29)
  assert.equal(periodLengthInDays(periodOfMonth(d('2026-02-10'))), 28)
})

test('季度期间跨年正确', () => {
  const period = periodOfQuarter(d('2026-11-20'))
  assert.equal(period.start, d('2026-10-01'))
  assert.equal(period.endExclusive, d('2027-01-01'))
})

test('年度期间是 1 月 1 日到次年 1 月 1 日', () => {
  const period = periodOfYear(d('2026-06-01'))
  assert.equal(period.start, d('2026-01-01'))
  assert.equal(period.endExclusive, d('2027-01-01'))
})

test('周期间从周一开始', () => {
  const period = periodOfWeek(d('2026-10-20')) // 周二
  assert.equal(period.start, d('2026-10-19'))
  assert.equal(period.endExclusive, d('2026-10-26'))
})

test('跨月加天正确', () => {
  assert.equal(addDays(d('2026-01-31'), 1), d('2026-02-01'))
  assert.equal(addDays(d('2026-03-01'), -1), d('2026-02-28'))
})

test('非法日期会被拒绝', () => {
  assert.throws(() => localDate('2026-02-30'))
  assert.throws(() => localDate('2026/01/01'))
})
