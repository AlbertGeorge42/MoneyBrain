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
const DOMAINS = new Set(['tx', 'rp', 'set', 'bg', 'dp', 'ov', 'shared', 'shell', 'overlay'])
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

  it('交易 ⇄ 退款跳转必须共用 TxLink，且不用 accent 色表示可点', () => {
    const rel = (file: string) => relative(WEB_ROOT, file).split('\\').join('/')
    const src = (name: string) => files.find((entry) => rel(entry.file).endsWith(name))?.source ?? ''
    const tag = src('features/shared/RefundTag.tsx')
    const summary = src('features/shared/RefundSummarySection.tsx')
    const detail = src('features/transactions/TransactionDetailPanel.tsx')
    expect(tag).toContain('TxLink')
    expect(summary).toContain('TxLink')
    expect(detail).toContain('TxLink')

    const css = src('features/shared/txLink.css')
    expect(css).not.toContain('--mb-color-accent')
    expect(css).toContain('--mb-color-text-secondary')
    expect(css).toContain('text-decoration: underline dashed')
    const rowCss = src('features/shared/txRow.css')
    const linkBlock = rowCss.slice(rowCss.indexOf('.mb-tx-refund-tag--link'), rowCss.indexOf('.mb-tx-refund-tag.is-unlinked'))
    expect(linkBlock).not.toContain('--mb-color-accent')
  })

  it('Overlay 契约：Sheet/Modal 统一 frame>scroll+footer，尺寸走语义档位', () => {
    const rel = (file: string) => relative(WEB_ROOT, file).split('\\').join('/')
    const src = (name: string) => files.find((entry) => rel(entry.file).endsWith(name))?.source ?? ''
    const sheet = src('features/shared/Sheet.tsx')
    const modal = src('features/shared/Modal.tsx')
    const overlayCss = src('features/shared/overlay.css')

    // 唯一 Footer API：两者都必须把 actions 渲染进 mb-overlay-footer。
    expect(sheet).toContain('mb-overlay-footer')
    expect(modal).toContain('mb-overlay-footer')
    expect(sheet).toMatch(/actions\s*\?/)
    expect(modal).toMatch(/actions\s*\?/)
    // 统一 overlay registry：Modal 曾缺失，导致浮层打开时「记一笔」入口未禁用。
    expect(sheet).toContain('registerOverlay')
    expect(modal).toContain('registerOverlay')
    // 尺寸语义档位走 CSS token，不在调用点散落裸数字。
    expect(sheet).toContain('--mb-overlay-sm')
    expect(sheet).toContain('--mb-overlay-md')
    expect(sheet).toContain('--mb-overlay-lg')
    expect(overlayCss).toContain('.mb-overlay-frame')
    expect(overlayCss).toContain('.mb-overlay-scroll')
    expect(overlayCss).toMatch(/\.mb-overlay-footer[\s\S]*justify-content:\s*flex-end/)
  })

  it('桌面抽屉统一外观：满高直角、无 feature 自定的 max-height / 圆角', () => {
    const rel = (file: string) => relative(WEB_ROOT, file).split('\\').join('/')
    const src = (name: string) => files.find((entry) => rel(entry.file).endsWith(name))?.source ?? ''
    const sheet = src('features/shared/Sheet.tsx')
    const overlayCss = src('features/shared/overlay.css')

    // 组件在桌面统一加外观钩子；feature 不再各自写桌面圆角 / 高度截断。
    expect(sheet).toContain('mb-overlay-shell')
    expect(overlayCss).toMatch(/\.mb-overlay-shell\.is-desktop\s*\{[^}]*height:\s*100%[^}]*border-radius:\s*0/)
    expect(overlayCss).toMatch(/\.mb-overlay-shell\.is-desktop\s*\{[^}]*max-height:\s*100vh/)

    const budgetsCss = src('features/budgets/budgets.css')
    expect(budgetsCss).not.toContain('.mb-bg-detail,\n.mb-bg-editor')
    expect(budgetsCss).not.toMatch(/\.mb-bg-(detail|editor)\s+\.mb-ov-body\s*\{[^}]*overflow-y/)
    const settingsCss = src('features/settings/settings.css')
    expect(settingsCss).not.toMatch(/\.mb-set-sheet\.is-desktop\s*\{[^}]*border-radius/)
  })

  it('业务侧不得自建 Footer class（Overlay actions 是唯一 Footer API）', () => {
    const rel = (file: string) => relative(WEB_ROOT, file).split('\\').join('/')
    const banned = ['mb-set-sheet-actions', 'mb-dp-sheet-actions', 'mb-tx-detail-actions']
    for (const cls of banned) {
      for (const entry of files) {
        if (!entry.file.endsWith('.tsx') && !entry.file.endsWith('.ts')) continue
        expect(entry.source, `${cls} 仍被 ${rel(entry.file)} 使用`).not.toContain(cls)
      }
      for (const entry of files) {
        if (!entry.file.endsWith('.css')) continue
        expect(entry.source, `${cls} 的 CSS 未清理`).not.toContain(cls)
      }
    }
  })

  it('交易详情与记账浮层的 Footer 都走 Overlay actions 插槽', () => {
    const rel = (file: string) => relative(WEB_ROOT, file).split('\\').join('/')
    const detail = files.find((entry) => rel(entry.file).endsWith('transactions/TransactionDetailPanel.tsx'))?.source ?? ''
    expect(detail).toContain('onActions')
    expect(detail).toContain('actions={footer}')

    const quick = files.find((entry) => rel(entry.file).endsWith('overview/QuickEntry.tsx'))?.source ?? ''
    expect(quick).toContain('onActions')
    expect(quick).toContain('actions={actions}')
  })
})
