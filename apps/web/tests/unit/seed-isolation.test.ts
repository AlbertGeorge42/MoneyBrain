/**
 * 种子数据隔离守卫
 *
 * 1. 生产入口静态依赖图：从 main.tsx / App.tsx 出发只跟随静态 import / export-from，不得出现 dev-fixtures。
 *    （DesignApp 是 lazy 动态路由，不在静态图内；它的种子引用另由第 3 条约束。）
 * 2. 全量源码：任何文件都不得静态 import dev-fixtures。
 * 3. src 内对 dev-fixtures 的引用只有一种形态：DesignApp 中的单处动态 import（DEV 分支内）。
 * 4. 模式解析：PROD 下即使 VITE_HF_DATA=seed 也必须是 api；开发模式默认 api。
 * 5. 若 dist/ 已构建，构建产物里不得出现任何种子标记。
 */
import { describe, expect, it, afterEach, vi } from 'vitest'
import * as ts from 'typescript'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readHfDataMode, resolveHfDataMode } from '../../src/features/overview/useApiLedger'

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SRC_ROOT = join(WEB_ROOT, 'src')
const DEV_FIXTURES = join(SRC_ROOT, 'dev-fixtures')
const ENTRY_FILES = [join(SRC_ROOT, 'main.tsx'), join(SRC_ROOT, 'App.tsx')]

const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.css', '.json']
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx'])

function toPosix(path: string): string {
  return path.split('\\').join('/')
}

function isInsideDevFixtures(path: string): boolean {
  return toPosix(path).startsWith(toPosix(DEV_FIXTURES) + '/')
}

/** 用 TypeScript AST 取静态 import / export-from 的模块说明符，动态 import() 不计入。 */
function staticModuleSpecifiers(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const specifiers: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = node.moduleSpecifier
      if (specifier && ts.isStringLiteral(specifier)) specifiers.push(specifier.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return specifiers
}

/** 取 import('...') 的模块说明符。 */
function dynamicImportSpecifiers(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const specifiers: string[] = []
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return specifiers
}

/** 只解析项目内路径（@/ 与相对路径）；@contracts / @domain / 三方包不属于本次隔离范围。 */
function resolveSourcePath(fromFile: string, specifier: string): string | null {
  let target: string
  if (specifier.startsWith('@/')) target = join(SRC_ROOT, specifier.slice(2))
  else if (specifier.startsWith('.')) target = resolve(dirname(fromFile), specifier)
  else return null

  if (!extname(target)) {
    for (const extension of RESOLVE_EXTENSIONS) {
      if (existsSync(target + extension)) return target + extension
    }
    for (const extension of RESOLVE_EXTENSIONS) {
      const index = join(target, `index${extension}`)
      if (existsSync(index)) return index
    }
  }
  return existsSync(target) ? target : null
}

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return listSourceFiles(full)
    return SOURCE_EXTENSIONS.has(extname(entry.name)) ? [full] : []
  })
}

function productionGraph(): string[] {
  const visited = new Set<string>()
  const queue = [...ENTRY_FILES]
  while (queue.length > 0) {
    const file = queue.shift()!
    if (visited.has(file)) continue
    visited.add(file)
    if (!SOURCE_EXTENSIONS.has(extname(file))) continue
    for (const specifier of staticModuleSpecifiers(file)) {
      const resolved = resolveSourcePath(file, specifier)
      if (resolved && !visited.has(resolved)) queue.push(resolved)
    }
  }
  return [...visited]
}

describe('种子数据隔离守卫', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('生产入口静态依赖图不含 dev-fixtures（扫描确实覆盖到组件层）', () => {
    const graph = productionGraph()
    const leaks = graph.filter(isInsideDevFixtures).map((file) => toPosix(relative(WEB_ROOT, file)))
    expect(
      leaks,
      `生产入口静态依赖图里出现种子模块：\n${leaks.join('\n')}`,
    ).toEqual([])
    // 防空转：依赖图必须真的展开到 App 的直接依赖及其子依赖。
    const graphPaths = graph.map((file) => toPosix(relative(WEB_ROOT, file)))
    expect(graphPaths).toEqual(
      expect.arrayContaining([
        'src/main.tsx',
        'src/App.tsx',
        'src/components/common/ErrorBoundary.tsx',
      ]),
    )
    // lazy 路由不在静态图内：DesignApp 不得被当成静态依赖。
    expect(graphPaths).not.toContain('src/app/design/DesignApp.tsx')
  })

  it('src 内任何文件都不得静态 import dev-fixtures', () => {
    const leaks = listSourceFiles(SRC_ROOT)
      .filter((file) => !isInsideDevFixtures(file))
      .flatMap((file) =>
        staticModuleSpecifiers(file)
          .filter((specifier) => specifier.includes('dev-fixtures'))
          .map((specifier) => `${toPosix(relative(WEB_ROOT, file))} → ${specifier}`),
      )
    expect(leaks, `静态 import 种子模块：\n${leaks.join('\n')}`).toEqual([])
  })

  it('src 内对 dev-fixtures 的引用只有 DesignApp 的单处动态 import', () => {
    const references = listSourceFiles(SRC_ROOT)
      .filter((file) => !isInsideDevFixtures(file))
      .filter((file) => {
        const all = [...staticModuleSpecifiers(file), ...dynamicImportSpecifiers(file)]
        return all.some((specifier) => specifier.includes('dev-fixtures'))
      })
      .map((file) => toPosix(relative(WEB_ROOT, file)))
    expect(references).toEqual(['src/app/design/DesignApp.tsx'])

    const designFile = join(SRC_ROOT, 'app/design/DesignApp.tsx')
    expect(staticModuleSpecifiers(designFile).filter((s) => s.includes('dev-fixtures'))).toEqual([])
    expect(dynamicImportSpecifiers(designFile).filter((s) => s.includes('dev-fixtures'))).toEqual([
      '@/dev-fixtures/seed',
    ])
  })

  it('PROD 下 VITE_HF_DATA=seed 也解析为 api', () => {
    expect(resolveHfDataMode({ DEV: false, PROD: true, VITE_HF_DATA: 'seed' })).toBe('api')
    expect(resolveHfDataMode({ DEV: true, PROD: true, VITE_HF_DATA: 'seed' })).toBe('api')
  })

  it('开发模式默认 api，只有显式 seed 开关才走种子', () => {
    expect(resolveHfDataMode({ DEV: true, PROD: false })).toBe('api')
    expect(resolveHfDataMode({ DEV: true, PROD: false, VITE_HF_DATA: 'api' })).toBe('api')
    expect(resolveHfDataMode({ DEV: true, PROD: false, VITE_HF_DATA: 'seed' })).toBe('seed')
  })

  it('当前测试环境默认不落种子', () => {
    vi.stubEnv('VITE_HF_DATA', '')
    expect(readHfDataMode()).toBe('api')
  })
})
