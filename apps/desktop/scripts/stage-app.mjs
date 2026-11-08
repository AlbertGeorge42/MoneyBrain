#!/usr/bin/env node
/**
 * 生成 Electron 可打包目录 apps/desktop/build/app。
 *
 * 为什么不直接用仓库根目录做 app：
 *   - 根目录是 npm workspaces，生产依赖被提升到根 node_modules，electron-builder 无法推断；
 *   - 这里显式列出 API 的运行时依赖并安装到独立目录，打包输入自洽、可复现。
 *
 * 安全约束：全过程只读 apps/api/prisma 的 schema 与 migrations，
 * 不读取 dev.db / dev.db-wal / dev.db-shm。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const root = path.resolve(desktopDir, '..', '..')
const appDir = path.join(desktopDir, 'build', 'app')
const apiPrismDir = path.join(root, 'apps', 'api', 'prisma')

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} 失败（cwd=${cwd}）`)
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function installedVersion(name) {
  return readJson(path.join(root, 'node_modules', name, 'package.json')).version
}

/** API 运行时依赖：排除纯类型包，版本取当前 node_modules 的真实版本，避免打包时漂移。 */
function runtimeDependencies() {
  const deps = {}
  // API 与它编译进来的 packages/* 都需要运行时依赖（如 packages/sync 的 @noble/hashes）。
  const manifests = [
    path.join(root, 'apps', 'api', 'package.json'),
    ...fs
      .readdirSync(path.join(root, 'packages'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(root, 'packages', entry.name, 'package.json'))
      .filter((file) => fs.existsSync(file)),
  ]
  for (const manifest of manifests) {
    for (const name of Object.keys(readJson(manifest).dependencies ?? {})) {
      if (name.startsWith('@types/')) continue
      deps[name] = installedVersion(name)
    }
  }
  // 迁移 CLI 随包运行（首次启动 / 版本升级执行 migrate deploy）。
  deps.prisma = installedVersion('prisma')
  return deps
}

async function main() {
  // 前端产物允许由调用方指定（并行会话正在改 apps/web 时，用 HEAD 纯净快照构建，避免打包半成品）。
  const webDist = process.env.MB_WEB_DIST
    ? path.resolve(process.env.MB_WEB_DIST)
    : path.join(root, 'apps', 'web', 'dist')

  if (!process.env.MB_WEB_DIST) {
    console.log('[stage] 构建 web 产物…')
    run('npm', ['run', 'build', '-w', '@moneybrain/web'], root)
  } else {
    console.log(`[stage] 使用指定 web 产物：${webDist}`)
  }

  console.log('[stage] 构建 api 产物…')
  run('npm', ['run', 'build', '-w', '@moneybrain/api'], root)

  const apiDist = path.join(root, 'apps', 'api', 'dist')
  for (const required of [path.join(webDist, 'index.html'), path.join(apiDist, 'apps', 'api', 'src', 'index.js')]) {
    if (!fs.existsSync(required)) throw new Error(`构建产物缺失：${required}`)
  }

  console.log(`[stage] 生成 ${appDir}`)
  await fsp.rm(appDir, { recursive: true, force: true })
  await fsp.mkdir(appDir, { recursive: true })

  await fsp.cp(webDist, path.join(appDir, 'web'), { recursive: true })
  await fsp.cp(apiDist, path.join(appDir, 'api'), { recursive: true })
  await fsp.cp(
    path.join(apiPrismDir, 'migrations'),
    path.join(appDir, 'prisma', 'migrations'),
    { recursive: true },
  )
  await fsp.copyFile(path.join(apiPrismDir, 'schema.prisma'), path.join(appDir, 'prisma', 'schema.prisma'))
  await fsp.copyFile(path.join(desktopDir, 'src', 'main.cjs'), path.join(appDir, 'main.cjs'))

  const packageJson = {
    name: 'moneybrain',
    productName: 'MoneyBrain',
    version: readJson(path.join(root, 'package.json')).version,
    description: 'MoneyBrain 个人记账桌面版',
    main: 'main.cjs',
    private: true,
    dependencies: runtimeDependencies(),
    devDependencies: {
      electron: readJson(path.join(desktopDir, 'package.json')).devDependencies.electron,
    },
  }
  await fsp.writeFile(path.join(appDir, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`)

  console.log('[stage] 安装运行时依赖（跳过 postinstall，Prisma 引擎由仓库复制）…')
  run('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock', '--prefer-offline'], appDir)

  // Prisma 5 的 @prisma/engines 用 postinstall 下载二进制；仓库里已有匹配版本，直接复制。
  const enginesSource = path.join(root, 'node_modules', '@prisma', 'engines')
  const enginesTarget = path.join(appDir, 'node_modules', '@prisma', 'engines')
  await fsp.mkdir(enginesTarget, { recursive: true })
  for (const file of ['query_engine-windows.dll.node', 'schema-engine-windows.exe']) {
    const from = path.join(enginesSource, file)
    if (!fs.existsSync(from)) throw new Error(`缺少 Prisma 引擎：${from}`)
    await fsp.copyFile(from, path.join(enginesTarget, file))
  }

  // 已生成的 Prisma Client（含 schema 副本）必须与引擎版本一致。
  const generatedClient = path.join(appDir, 'node_modules', '.prisma', 'client')
  await fsp.cp(
    path.join(root, 'node_modules', '.prisma', 'client'),
    generatedClient,
    { recursive: true },
  )
  // 开发机并发跑 dev 服务时，prisma generate 可能留下未完成的 .tmp 引擎文件，不进城打包。
  for (const entry of await fsp.readdir(generatedClient)) {
    if (entry.includes('.tmp')) await fsp.rm(path.join(generatedClient, entry), { force: true })
  }

  const requiredOutputs = [
    path.join(appDir, 'main.cjs'),
    path.join(appDir, 'node_modules', 'prisma', 'build', 'index.js'),
    path.join(appDir, 'node_modules', '@prisma', 'client', 'default.js'),
    path.join(appDir, 'node_modules', '.prisma', 'client', 'query_engine-windows.dll.node'),
    path.join(appDir, 'prisma', 'migrations'),
  ]
  for (const required of requiredOutputs) {
    if (!fs.existsSync(required)) throw new Error(`打包目录缺少 ${required}`)
  }
  console.log(`[stage] 完成：${appDir}`)
}

main().catch((error) => {
  console.error(`[stage] 失败：${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
})
