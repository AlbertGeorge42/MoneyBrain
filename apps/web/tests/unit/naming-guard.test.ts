/**
 * 命名规范守卫（docs/dev-guide.md §12）。
 *
 * 把「前端命名规范」的机械可检查部分变成测试失败，防止历史身份前缀回潮、
 * 未注册 domain 混入、裸 z-index 与双色板失同步。定义清单不另抄：
 * 颜色 token 复用 buildMbColorVarNames()，domain 注册表在本文件唯一声明。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildMbColorVarNames } from '../../src/styles/theme/theme-tokens'

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SRC_ROOT = join(WEB_ROOT, 'src')

/** 规范 §4.2：CSS class 的 domain 注册表（封闭集合） */
const DOMAINS = new Set(['tx', 'rp', 'set', 'bg', 'dp', 'ov', 'shared', 'shell'])
const SCAN_EXTENSIONS = new Set(['.css', '.ts', '.tsx'])

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return listSourceFiles(full)
    return SCAN_EXTENSIONS.has(extname(entry.name)) ? [full] : []
  })
}

function at(file: string, source: string, index: number): string {
  return `${relative(WEB_ROOT, file).split('\\').join('/')}:${source.slice(0, index).split('\n').length}`
}

/** 剥离注释，保留行号与字符串内容（避免注释里的示例触发误报） */
function stripComments(source: string, isCss: boolean): string {
  if (isCss) return source.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
  let state: 'code' | 'line' | 'block' = 'code'
  let out = ''
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]
    const next = source[i + 1]
    if (state === 'code') {
      if (ch === '/' && next === '/') { state = 'line'; out += '  '; i += 1; continue }
      if (ch === '/' && next === '*') { state = 'block'; out += '  '; i += 1; continue }
      out += ch
    } else if (state === 'line') {
      if (ch === '\n') { state = 'code'; out += ch } else out += ' '
    } else {
      if (ch === '*' && next === '/') { state = 'code'; out += '  '; i += 1 }
      else out += ch === '\n' ? '\n' : ' '
    }
  }
  return out
}

const files = listSourceFiles(SRC_ROOT).map((file) => {
  const isCss = extname(file) === '.css'
  return { file, source: stripComments(readFileSync(file, 'utf8'), isCss), isCss }
})

describe('前端命名规范守卫（§4 / §10 / §11 / §13）', () => {
  it('CSS 中 mb-* class 的 domain 必须属于注册集合，且无 mb-hf-* 回潮', () => {
    const failures: string[] = []
    for (const { file, source, isCss } of files) {
      if (!isCss) continue
      for (const m of source.matchAll(/(?<![\w-])\.(mb-[a-z][a-z0-9-]*)/g)) {
        const name = m[1]
        const domain = name.split('-')[1]
        if (name.startsWith('mb-hf-')) {
          failures.push(`${at(file, source, m.index ?? 0)}  ${name}  ← mb-hf-* 已废弃，用 mb-shell-* / mb-shared-*`)
        } else if (!DOMAINS.has(domain)) {
          failures.push(`${at(file, source, m.index ?? 0)}  ${name}  ← 未注册 domain「${domain}」`)
        }
      }
    }
    expect(failures, `发现 ${failures.length} 处 domain 违规：\n${failures.join('\n')}`).toEqual([])
  })

  it('class 名只用小写与连字符，无 camelCase / snake_case', () => {
    const failures: string[] = []
    for (const { file, source, isCss } of files) {
      if (!isCss) continue
      for (const m of source.matchAll(/(?<![\w-])\.(mb-[A-Za-z0-9_-]+)/g)) {
        if (/[A-Z_]/.test(m[1])) {
          failures.push(`${at(file, source, m.index ?? 0)}  ${m[1]}  ← class 只允许小写 + 连字符`)
        }
      }
    }
    expect(failures, `发现 ${failures.length} 处命名格式违规：\n${failures.join('\n')}`).toEqual([])
  })

  it('源码中不得出现 Hf* 共享组件名（历史身份前缀已清理）', () => {
    const failures: string[] = []
    const banned = ['HfButton', 'HfSheet', 'HfSegmented', 'HfSwitch', 'HfTabs', 'HfHeadAction']
    for (const { file, source } of files) {
      for (const name of banned) {
        const idx = source.indexOf(name)
        if (idx >= 0) failures.push(`${at(file, source, idx)}  ${name}  ← 历史 Hf 前缀`)
      }
    }
    expect(failures, `发现 ${failures.length} 处 Hf 前缀残留：\n${failures.join('\n')}`).toEqual([])
  })

  it('z-index 不得出现裸数字（CSS 与 TSX 均走 --mb-z-* token）', () => {
    const failures: string[] = []
    for (const { file, source } of files) {
      for (const m of source.matchAll(/(?:zIndex\s*[:=]\s*|z-index\s*:\s*)([0-9]+)/g)) {
        failures.push(`${at(file, source, m.index ?? 0)}  ${m[0].trim()}  ← 用 var(--mb-z-*) 替代`)
      }
    }
    expect(failures, `发现 ${failures.length} 处裸 z-index：\n${failures.join('\n')}`).toEqual([])
  })

  it('light / dark 两套色板 key 集合必须完全一致（§11）', () => {
    const light = new Set(buildMbColorVarNames(false))
    const dark = new Set(buildMbColorVarNames(true))
    const lightOnly = [...light].filter((k) => !dark.has(k))
    const darkOnly = [...dark].filter((k) => !light.has(k))
    expect(
      { lightOnly, darkOnly },
      `色板 key 不一致：light 独有 ${JSON.stringify(lightOnly)}；dark 独有 ${JSON.stringify(darkOnly)}`,
    ).toEqual({ lightOnly: [], darkOnly: [] })
  })

  it('共享 Button 必须输出基类 mb-shared-btn——否则 variant 缺 flex，图标与文字基线错位', () => {
    const rel = (file: string) => relative(WEB_ROOT, file).split('\\').join('/')
    const button = files.find((entry) => rel(entry.file).endsWith('features/shared/Button.tsx'))
    expect(button, '未找到 features/shared/Button.tsx').toBeDefined()
    const source = button!.source
    const classesBlock = source.slice(source.indexOf('const classes = ['), source.indexOf('.filter(Boolean)'))
    expect(classesBlock).toContain("'mb-shared-btn'")

    const css = files.find((entry) => rel(entry.file).endsWith('features/shared/button.css'))
    expect(css, '未找到 features/shared/button.css').toBeDefined()
    const base = css!.source.slice(css!.source.indexOf('.mb-shared-btn {'), css!.source.indexOf('.mb-shared-btn:hover'))
    expect(base).toMatch(/display:\s*inline-flex/)
    expect(base).toMatch(/align-items:\s*center/)
  })
})
