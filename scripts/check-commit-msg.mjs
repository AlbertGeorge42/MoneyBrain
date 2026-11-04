import { readFileSync } from 'node:fs'

const EXAMPLE = 'fix：导出文件名改用本地日历日——UTC+8 凌晨会落到前一天（A5）'

function fail(problems) {
  console.error('提交信息不符合 docs/dev-guide.md §10.1：')
  for (const p of problems) console.error(`  - ${p}`)
  console.error(`正确示例：${EXAMPLE}`)
  process.exit(1)
}

function readTypesFromGuide() {
  const guide = readFileSync(new URL('../docs/dev-guide.md', import.meta.url), 'utf8')
  const line = guide.split(/\r?\n/).find((l) => l.includes('`feat`') && l.includes('`fix`'))
  const types = line ? [...line.matchAll(/`([a-z]+)`/g)].map((m) => m[1]) : []
  if (types.length === 0) {
    console.error('无法从 docs/dev-guide.md §10.1 读取类型白名单，请检查该行格式')
    process.exit(1)
  }
  return types
}

const types = readTypesFromGuide()
const messagePath = process.argv[2]
if (!messagePath) fail(['缺少提交信息文件参数'])

const message = readFileSync(messagePath, 'utf8')
const firstLine = message
  .split(/\r?\n/)
  .find((line) => line.trim() && !line.startsWith('#'))

if (!firstLine) fail(['提交信息为空'])

// 放行 git 生成的合并 / 回滚 / 自动压缩消息
if (
  firstLine.startsWith('Merge ') ||
  firstLine.startsWith('Revert "') ||
  firstLine.startsWith('fixup!') ||
  firstLine.startsWith('squash!')
) {
  process.exit(0)
}

const problems = []
const fullColon = firstLine.indexOf('：')
const asciiColon = firstLine.indexOf(':')

if (fullColon === -1) problems.push('缺少全角冒号「：」')
if (asciiColon !== -1 && (fullColon === -1 || asciiColon < fullColon)) {
  problems.push('冒号必须用全角「：」，不能用半角「:」')
}

const prefixEnd = fullColon !== -1 ? fullColon : asciiColon
const prefix = prefixEnd > 0 ? firstLine.slice(0, prefixEnd) : ''
if (!prefix) {
  problems.push('缺少类型前缀')
} else if (prefix.includes('(') || prefix.includes('（')) {
  problems.push(`不要带作用域（如 docs(ux)：），当前为「${prefix}」`)
} else if (!types.includes(prefix)) {
  problems.push(`类型「${prefix}」不在白名单（${types.join(' / ')}）`)
}

const dashParts = firstLine.split('——')
if (dashParts.length < 2 || !dashParts[0].trim() || !dashParts[1].trim()) {
  problems.push('缺少全角破折号「——」，或「——」前后缺少内容（做了什么——为什么/影响）')
}

if (!/（.+）$/.test(firstLine)) {
  problems.push('缺少全角括号注记「（条目号/哈希/重写批次）」')
}
if (/\([^)]*\)/.test(firstLine)) {
  problems.push('括号必须用全角「（）」，不能用半角「()」')
}

if (problems.length > 0) fail(problems)
process.exit(0)
