import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync, rmSync } from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const testDbPath = path.resolve(__dirname, '../../prisma/test.db')

// 必须在导入 src/prisma.ts 之前指向测试库
process.env.DATABASE_URL = `file:${testDbPath}`

const { default: app } = await import('../../src/index.js')
const { prisma } = await import('../../src/prisma.js')

// B3 过渡态验收：云同步目录默认拒绝、需显式确认；开关与目录可读写；
// 执行时机由内部策略决定，接口只暴露只读状态（上次成功 / 预计窗口 / 当前份数）。
// 自动备份配置跟着数据库走（test.db 同级），用例结束后清理，避免污染 prisma 目录。

const configPath = path.join(path.dirname(testDbPath), 'auto-backup-config.json')

describe('自动备份 API（B3）', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  afterAll(async () => {
    if (existsSync(configPath)) {
      rmSync(configPath)
    }
    await prisma.$disconnect()
  })

  it('默认配置：未开启，含只读状态字段', async () => {
    const response = await request(app).get('/api/data/auto-backup')
    expect(response.status).toBe(200)
    expect(response.body.data.enabled).toBe(false)
    expect(response.body.data.defaultDirectory).toBeTruthy()
    expect(response.body.data).toHaveProperty('nextWindowAt')
    expect(response.body.data).toHaveProperty('backupCount')
  })

  it('开启时云同步目录默认拒绝，显式确认后接受', async () => {
    const cloudDirectory = 'C:\\Users\\me\\OneDrive\\moneybrain-backup'

    const blocked = await request(app)
      .put('/api/data/auto-backup')
      .send({ enabled: true, directory: cloudDirectory })
    expect(blocked.status).toBe(400)
    expect(blocked.body.error.message).toMatch(/云同步目录/)

    const accepted = await request(app)
      .put('/api/data/auto-backup')
      .send({
        enabled: true,
        directory: cloudDirectory,
        confirmCloudDirectory: true,
      })
    expect(accepted.status).toBe(200)
    expect(accepted.body.data.enabled).toBe(true)

    // 关闭调度收尾，避免定时器泄漏到测试进程
    const disabled = await request(app)
      .put('/api/data/auto-backup')
      .send({ enabled: false })
    expect(disabled.status).toBe(200)
    expect(disabled.body.data.enabled).toBe(false)
  })

  it('参数校验：enabled 必须是布尔值', async () => {
    const response = await request(app)
      .put('/api/data/auto-backup')
      .send({ enabled: 'yes' })
    expect(response.status).toBe(400)
  })
})
