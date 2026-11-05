/**
 * CSS 变量守卫（U1b）
 *
 * CSS 引用未定义变量不会报错，浏览器会静默回退。本守卫把这类问题变成测试失败：
 * 1. 引用完整性：src 内每个 var(--mb-*) 都必须在「variables.css ∪ buildCssVars()」中定义；
 * 2. 命名空间隔离：项目代码不得出现 --ant-*（决策 #32）；
 * 3. 死变量：已定义的 --mb-* 必须至少被引用一次；过渡期保留的需在下方白名单显式登记。
 *
 * 定义清单直接复用 buildCssVars()（syncCssVars() 也用它），不在守卫里另抄一份。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCssVars } from '../../src/styles/theme/config'

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SRC_ROOT = join(WEB_ROOT, 'src')
const THEME_DIR = join(SRC_ROOT, 'styles', 'theme')
const VARIABLES_CSS = join(THEME_DIR, 'variables.css')
const CONFIG_TS = join(THEME_DIR, 'config.ts')

const SCAN_EXTENSIONS = new Set(['.css', '.ts', '.tsx'])
const MB_REF = /var\(\s*(--mb-[A-Za-z0-9_-]+)/g
const MB_DEFINITION = /(--mb-[A-Za-z0-9_-]+)\s*:/g
const MB_LITERAL_KEY = /'(--mb-[^']+)'\s*:/g
const ANT_VAR = /--ant-[A-Za-z0-9_-]+/g

/**
 * 死变量白名单：定义后暂未被引用、但按约定需要保留的 token。
 * 新增豁免必须在此显式登记并写明原因；删除对应 token 时同步删掉条目。
 */
const DEAD_VAR_ALLOWLIST: Record<string, string> = {
  // 存量结构 token：当前无 2px 边框用法，保留待原型切换时重规范（U1b 不删 token）
  '--mb-border-width-thick': '存量结构 token，当前无 2px 边框场景',
  // 存量结构 token：布局实际用 JSX width={244}，该值待原型切换时统一重规范
  '--mb-layout-sider-width': '存量结构 token，当前 Sider 用 JSX width={244}',
  // 存量财务色：中性数字/现金流色板已生成，当前页面尚未引用
  '--mb-color-neutral': '存量财务色，当前无中性数字显示场景',
  '--mb-color-cash': '存量财务色，现金流色板暂未引用',
  '--mb-color-non-cash': '存量财务色，现金流色板暂未引用',
  // HF token：design-tokens 全量保留；hero 反白文字改用 --mb-color-hero-ink
  '--mb-color-text-inverse': 'design-tokens 全量保留，当前无其他反色文字场景',
}

function toPosix(path: string): string {
  return path.split('\\').join('/')
}

function location(file: string, source: string, index: number): string {
  return `${toPosix(relative(WEB_ROOT, file))}:${source.slice(0, index).split('\n').length}`
}

/** 把 CSS 块的注释内容替换为等长空白，保留行号 */
function stripCssComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[^\n]/g, ' '),
  )
}

/** 剥离 TS/TSX 的行注释与块注释，保留字符串内容与行号 */
function stripTsComments(source: string): string {
  type State = 'code' | 'line' | 'block' | 'single' | 'double' | 'template'
  let state: State = 'code'
  let out = ''
  let i = 0

  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]

    if (state === 'code') {
      if (ch === '/' && next === '/') {
        state = 'line'
        out += '  '
        i += 2
        continue
      }
      if (ch === '/' && next === '*') {
        state = 'block'
        out += '  '
        i += 2
        continue
      }
      if (ch === '"') state = 'double'
      else if (ch === "'") state = 'single'
      else if (ch === '`') state = 'template'
      out += ch
      i += 1
      continue
    }

    if (state === 'line') {
      if (ch === '\n') {
        state = 'code'
        out += ch
      } else {
        out += ' '
      }
      i += 1
      continue
    }

    if (state === 'block') {
      if (ch === '*' && next === '/') {
        state = 'code'
        out += '  '
        i += 2
      } else {
        out += ch === '\n' ? '\n' : ' '
        i += 1
      }
      continue
    }

    // 字符串内部：保留内容，处理转义与结束引号
    if (ch === '\\') {
      out += ch + (next ?? '')
      i += 2
      continue
    }
    if (
      (state === 'double' && ch === '"') ||
      (state === 'single' && ch === "'") ||
      (state === 'template' && ch === '`')
    ) {
      state = 'code'
    }
    out += ch
    i += 1
  }

  return out
}

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return listSourceFiles(full)
    return SCAN_EXTENSIONS.has(extname(entry.name)) ? [full] : []
  })
}

function readStripped(file: string): string {
  const source = readFileSync(file, 'utf8')
  return extname(file) === '.css'
    ? stripCssComments(source)
    : stripTsComments(source)
}

/** 收集 src 内全部 var(--mb-*) 引用 */
function collectReferences(): Array<{ name: string; at: string }> {
  return listSourceFiles(SRC_ROOT).flatMap((file) => {
    const source = readStripped(file)
    return [...source.matchAll(MB_REF)].map((match) => ({
      name: match[1],
      at: location(file, source, match.index ?? 0),
    }))
  })
}

/** 收集定义清单：variables.css 结构 token ∪ buildCssVars() 键名 */
function collectDefinitions(): Map<string, string> {
  const definitions = new Map<string, string>()

  const variablesSource = stripCssComments(readFileSync(VARIABLES_CSS, 'utf8'))
  for (const match of variablesSource.matchAll(MB_DEFINITION)) {
    definitions.set(match[1], location(VARIABLES_CSS, variablesSource, match.index ?? 0))
  }

  const configSource = stripTsComments(readFileSync(CONFIG_TS, 'utf8'))
  const literalKeys = new Map<string, string>()
  for (const match of configSource.matchAll(MB_LITERAL_KEY)) {
    literalKeys.set(match[1], location(CONFIG_TS, configSource, match.index ?? 0))
  }

  // 键名来自 project 自己的清单；传空 token 只取键，不求值
  const generated = buildCssVars({}, false)
  const generatedAt = configSource.indexOf('--mb-color-${name}')
  for (const key of Object.keys(generated)) {
    const literalAt = literalKeys.get(key)
    definitions.set(
      key,
      literalAt ??
        location(CONFIG_TS, configSource, generatedAt < 0 ? 0 : generatedAt),
    )
  }

  return definitions
}

function collectAntReferences(): Array<{ name: string; at: string }> {
  return listSourceFiles(SRC_ROOT).flatMap((file) => {
    const source = readStripped(file)
    return [...source.matchAll(ANT_VAR)].map((match) => ({
      name: match[0],
      at: location(file, source, match.index ?? 0),
    }))
  })
}

describe('CSS 变量守卫（U1b）', () => {
  const references = collectReferences()
  const definitions = collectDefinitions()
  const referencedNames = new Set(references.map((reference) => reference.name))

  it('var(--mb-*) 引用必须都有定义', () => {
    const failures = references
      .filter((reference) => !definitions.has(reference.name))
      .map((reference) => `${reference.at}  ${reference.name}  ← 引用未定义变量`)

    expect(
      failures,
      `发现 ${failures.length} 处未定义引用（定义源：variables.css ∪ buildCssVars()）：\n${failures.join('\n')}`,
    ).toEqual([])
  })

  it('项目代码不得出现 --ant-*（决策 #32）', () => {
    const failures = collectAntReferences().map(
      (reference) => `${reference.at}  ${reference.name}  ← 项目代码不得引用 AntD 变量`,
    )

    expect(
      failures,
      `发现 ${failures.length} 处 --ant-* 引用：\n${failures.join('\n')}`,
    ).toEqual([])
  })

  it('已定义的 --mb-* 必须被引用（新增未使用需登记白名单）', () => {
    const failures = [...definitions.entries()]
      .filter(([name]) => !referencedNames.has(name) && !(name in DEAD_VAR_ALLOWLIST))
      .map(([name, at]) => `${at}  ${name}  ← 定义后无人引用`)

    expect(
      failures,
      `发现 ${failures.length} 个死变量（如属过渡期保留，请在 tests/unit/css-vars-guard.test.ts 的 DEAD_VAR_ALLOWLIST 登记并写明原因）：\n${failures.join('\n')}`,
    ).toEqual([])
  })
})
